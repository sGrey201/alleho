/**
 * Move legacy voice messages from uploads/ into voice-messages/<messageId>/
 * and write the one-track manifest the transcriber already watches.
 *
 * Does nothing unless --apply is passed. Prints the database host and bucket
 * before any write so a local .env is not confused with production.
 *
 * Production:
 *   set -a && source /path/to/production.env && set +a
 *   npx tsx scripts/migrate-voice-messages.ts
 *   npx tsx scripts/migrate-voice-messages.ts --apply
 */
import "dotenv/config";
import { and, eq, like } from "drizzle-orm";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { pool, db } from "../server/db.ts";
import { storage } from "../server/storage.ts";
import { packageVoiceMessage } from "../server/voiceMessagePackage.ts";
import { objectStorageClient } from "../server/replit_integrations/object_storage/objectStorage.ts";
import {
  conversationMessages,
  conversations,
  voicePayloadSchema,
  type ConversationMessage,
} from "../shared/schema.ts";

function databaseTarget(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return "(DATABASE_URL is not set)";
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return "(DATABASE_URL is not a URL)";
  }
}

function objectKey(objectPath: string): string | null {
  if (!objectPath.startsWith("/objects/uploads/")) return null;
  const key = objectPath.slice("/objects/".length);
  if (!key || key.includes("..")) return null;
  return key;
}

function durationSec(message: ConversationMessage): number {
  if (!message.content) return 0;
  try {
    return voicePayloadSchema.parse(JSON.parse(message.content)).durationSec;
  } catch {
    return 0;
  }
}

/** Prefer a live original message; the manifest is written once per audio file. */
function choosePrimary(messages: ConversationMessage[]): ConversationMessage {
  const live = messages.filter((message) => !message.deletedAt);
  const eligible = live.length > 0 ? live : messages;
  const originals = eligible.filter((message) => !message.forwardedFromMessageId);
  const candidates = originals.length > 0 ? originals : eligible;
  return candidates.reduce((earliest, message) => {
    const earliestAt = earliest.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const messageAt = message.createdAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return messageAt < earliestAt ? message : earliest;
  });
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Database: ${databaseTarget()}`);
  console.log(`Bucket: ${process.env.YC_BUCKET ?? "(YC_BUCKET is not set)"}`);
  const missing = [
    "DATABASE_URL",
    "YC_BUCKET",
    "YC_REGION",
    "YC_ACCESS_KEY_ID",
    "YC_SECRET_ACCESS_KEY",
  ].filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing env: ${missing.join(", ")}`);
  }

  const rows = await db
    .select()
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.messageType, "voice"),
        like(conversationMessages.imageUrl, "/objects/uploads/%")
      )
    );

  const groups = new Map<string, ConversationMessage[]>();
  for (const message of rows) {
    const path = message.imageUrl;
    if (!path) continue;
    const list = groups.get(path) ?? [];
    list.push(message);
    groups.set(path, list);
  }

  console.log(`Voice files still in uploads/: ${groups.size}`);
  let moved = 0;
  let failed = 0;

  for (const [sourcePath, messages] of groups) {
    const primary = choosePrimary(messages);
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, primary.conversationId));
    if (!conversation) {
      failed += 1;
      console.error(`skip ${primary.id}: conversation ${primary.conversationId} is missing`);
      continue;
    }
    const author = await storage.getUser(primary.authorUserId);
    const copies = messages.filter((message) => message.id !== primary.id).length;
    console.log(
      `${apply ? "move" : "would move"} ${primary.id} ${sourcePath} copies=${copies} deleted=${!!primary.deletedAt}`
    );
    if (!apply) continue;

    try {
      const packaged = await packageVoiceMessage({
        message: primary,
        conversation,
        author,
        sourceObjectPath: sourcePath,
        durationSec: durationSec(primary),
        deleteSource: false,
      });
      if (!packaged?.imageUrl) {
        failed += 1;
        console.error(`failed ${primary.id}: package returned no path`);
        continue;
      }
      await db
        .update(conversationMessages)
        .set({ imageUrl: packaged.imageUrl })
        .where(eq(conversationMessages.imageUrl, sourcePath));

      const sourceKey = objectKey(sourcePath);
      if (sourceKey) {
        await objectStorageClient.send(
          new DeleteObjectCommand({
            Bucket: process.env.YC_BUCKET,
            Key: sourceKey,
          })
        );
      }
      moved += 1;
      console.log(`moved ${primary.id} -> ${packaged.imageUrl}`);
    } catch (err) {
      failed += 1;
      console.error(`failed ${primary.id}`, err);
    }
  }

  console.log(`Done. moved=${moved} failed=${failed} files=${groups.size}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
