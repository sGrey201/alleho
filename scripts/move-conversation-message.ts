/**
 * Move one chat message into another conversation.
 * A questionnaire message moves with its filled instance. The instance is
 * rebound to the destination chat's patient so that patient can open it.
 *
 * The message keeps its original time, so it shows up in the destination
 * chat at that moment in the history, not as a new last message.
 *
 * Prints the database host and changes nothing unless --apply is passed.
 *
 *   npx tsx scripts/move-conversation-message.ts \
 *     --from 0cb02258-9664-4e18-8bc5-4adfc7f8e74f \
 *     --message e3a53780-003b-411d-a109-d0bbb7b352a7 \
 *     --to 7d19f96e-8c41-4754-8a10-97f9f51f1b3e
 *
 *   npx tsx scripts/move-conversation-message.ts \
 *     --from 0cb02258-9664-4e18-8bc5-4adfc7f8e74f \
 *     --message e3a53780-003b-411d-a109-d0bbb7b352a7 \
 *     --to 7d19f96e-8c41-4754-8a10-97f9f51f1b3e \
 *     --apply
 */
import "dotenv/config";
import { desc, eq } from "drizzle-orm";
import Redis from "ioredis";
import { pool, db } from "../server/db.ts";
import { previewFromConversationMessageParts } from "../server/utils/conversationPreview.ts";
import {
  conversationMessageComments,
  conversationMessages,
  conversationParticipants,
  conversations,
  questionnaireInstances,
  users,
  type Conversation,
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

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function requireId(name: string): string {
  const value = arg(name)?.trim();
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error(`Pass ${name} <uuid>`);
  }
  return value;
}

function personLabel(user: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
} | undefined): string {
  if (!user) return "—";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return name || user.email || "—";
}

async function chatLabel(conversation: Conversation): Promise<string> {
  const participants = await db
    .select({
      role: conversationParticipants.role,
      displayName: conversationParticipants.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(conversationParticipants)
    .leftJoin(users, eq(users.id, conversationParticipants.userId))
    .where(eq(conversationParticipants.conversationId, conversation.id));
  const names = participants
    .map((row) => row.displayName?.trim() || personLabel(row))
    .filter((name) => name && name !== "—");
  const patient = conversation.patientUserId
    ? await db.select().from(users).where(eq(users.id, conversation.patientUserId)).then((rows) => rows[0])
    : undefined;
  return [
    conversation.type,
    conversation.deletedAt ? "deleted" : "active",
    names.length > 0 ? names.join(", ") : "(no participants)",
    `patient=${personLabel(patient)}`,
  ].join(" | ");
}

async function refreshLastMessage(conversationId: string): Promise<void> {
  const [last] = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(1);
  await db
    .update(conversations)
    .set({
      lastMessageAt: last?.createdAt ?? null,
      lastMessagePreview: last
        ? previewFromConversationMessageParts(last.content, last.imageUrl, last.messageType)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));
}

async function clearRecentCache(conversationIds: string[]): Promise<void> {
  const url =
    process.env.REDIS_URL ??
    (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:6379` : undefined);
  if (!url) {
    console.log("Redis: not configured, recent cache left as-is");
    return;
  }
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3000,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    const keys = conversationIds.map((id) => `conversation:recent:${id}`);
    await redis.del(...keys);
    console.log(`Redis: cleared ${keys.join(", ")}`);
  } catch (err) {
    console.error("Redis: cache was not cleared", err);
  } finally {
    redis.disconnect();
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const fromId = requireId("--from");
  const toId = requireId("--to");
  const messageId = requireId("--message");
  if (fromId === toId) throw new Error("--from and --to are the same chat");

  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(`Database: ${databaseTarget()}`);

  const [message] = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.id, messageId));
  if (!message) throw new Error(`Message ${messageId} was not found`);
  if (message.conversationId !== fromId) {
    throw new Error(
      `Message is in chat ${message.conversationId}, not ${fromId}`
    );
  }

  const [source] = await db.select().from(conversations).where(eq(conversations.id, fromId));
  const [target] = await db.select().from(conversations).where(eq(conversations.id, toId));
  if (!source) throw new Error(`Source chat ${fromId} was not found`);
  if (!target) throw new Error(`Destination chat ${toId} was not found`);
  if (target.deletedAt) throw new Error(`Destination chat ${toId} is deleted`);

  const instances = await db
    .select()
    .from(questionnaireInstances)
    .where(eq(questionnaireInstances.messageId, messageId));
  const replies = await db
    .select({ id: conversationMessages.id })
    .from(conversationMessages)
    .where(eq(conversationMessages.replyToMessageId, messageId));
  const comments = await db
    .select({ id: conversationMessageComments.id })
    .from(conversationMessageComments)
    .where(eq(conversationMessageComments.messageId, messageId));

  console.log(`Message: ${message.id} type=${message.messageType} at=${message.createdAt?.toISOString() ?? "—"}`);
  console.log(`From: ${fromId}`);
  console.log(`  ${await chatLabel(source)}`);
  console.log(`To: ${toId}`);
  console.log(`  ${await chatLabel(target)}`);
  if (message.messageType === "questionnaire") {
    if (instances.length === 0) console.log("Questionnaire instance: none linked to this message");
    for (const instance of instances) {
      console.log(
        `Questionnaire instance ${instance.id}: patient ${instance.patientUserId ?? "unbound"} -> ${target.patientUserId ?? "unbound"}`
      );
    }
  } else if (instances.length > 0) {
    console.log(`Linked questionnaire instances: ${instances.map((row) => row.id).join(", ")}`);
  }
  if (message.replyToMessageId) {
    console.log(`Reply target ${message.replyToMessageId} will be cleared; it stays in the source chat`);
  }
  if (replies.length > 0) {
    console.log(`Replies left behind in the source chat: ${replies.map((row) => row.id).join(", ")}`);
  }
  console.log(`Comments moved with the message: ${comments.length}`);

  if (!apply) {
    console.log("Dry-run only. Pass --apply to move the message.");
    await pool.end();
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(conversationMessages)
      .set({
        conversationId: toId,
        replyToMessageId: null,
      })
      .where(eq(conversationMessages.id, messageId));

    if (instances.length > 0) {
      await tx
        .update(questionnaireInstances)
        .set({
          conversationId: toId,
          patientUserId: target.patientUserId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(questionnaireInstances.messageId, messageId));
    }

    if (comments.length > 0) {
      await tx
        .update(conversationMessageComments)
        .set({ conversationId: toId })
        .where(eq(conversationMessageComments.messageId, messageId));
    }
  });

  await refreshLastMessage(fromId);
  await refreshLastMessage(toId);
  await clearRecentCache([fromId, toId]);
  console.log("Moved.");
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
