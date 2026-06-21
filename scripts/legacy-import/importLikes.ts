import { and, eq } from "drizzle-orm";
import { db } from "../../server/db.ts";
import {
  conversationMessageReactions,
  conversationMessages,
  users,
} from "../../shared/schema.ts";
import { CHANNEL_ID, LIKE_EMOJI } from "./constants.ts";
import { loadLegacyArticleLikes, loadLegacyArticles } from "./loadJson.ts";
import { parseDate } from "./parseDate.ts";
import type { ImportPhaseResult } from "./types.ts";

export async function importLikes(options: { dryRun: boolean }): Promise<ImportPhaseResult> {
  const likes = loadLegacyArticleLikes();

  const channelMessages = await db
    .select({ id: conversationMessages.id })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, CHANNEL_ID));
  const messageIds = new Set(channelMessages.map((m) => m.id));
  if (options.dryRun) {
    for (const article of loadLegacyArticles()) {
      messageIds.add(article.id);
    }
  }

  const existingUsers = await db.select({ id: users.id }).from(users);
  const userIds = new Set(existingUsers.map((u) => u.id));

  const existingReactions = await db
    .select({
      messageId: conversationMessageReactions.messageId,
      userId: conversationMessageReactions.userId,
    })
    .from(conversationMessageReactions)
    .innerJoin(
      conversationMessages,
      eq(conversationMessageReactions.messageId, conversationMessages.id)
    )
    .where(
      and(
        eq(conversationMessages.conversationId, CHANNEL_ID),
        eq(conversationMessageReactions.emoji, LIKE_EMOJI)
      )
    );
  const existingKeys = new Set(
    existingReactions.map((r) => `${r.messageId}:${r.userId}`)
  );

  const result: ImportPhaseResult = {
    total: likes.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    details: { missingMessage: 0, missingUser: 0, duplicate: 0 },
  };

  const toInsert: {
    id: string;
    messageId: string;
    userId: string;
    emoji: string;
    createdAt: Date | null;
  }[] = [];

  for (const like of likes) {
    if (!messageIds.has(like.article_id)) {
      result.skipped += 1;
      result.details!.missingMessage += 1;
      continue;
    }
    if (!userIds.has(like.user_id)) {
      result.skipped += 1;
      result.details!.missingUser += 1;
      continue;
    }
    const key = `${like.article_id}:${like.user_id}`;
    if (existingKeys.has(key)) {
      result.skipped += 1;
      result.details!.duplicate += 1;
      continue;
    }
    toInsert.push({
      id: like.id,
      messageId: like.article_id,
      userId: like.user_id,
      emoji: LIKE_EMOJI,
      createdAt: parseDate(like.created_at),
    });
  }

  if (options.dryRun) {
    result.inserted = toInsert.length;
    return result;
  }

  const batchSize = 50;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    try {
      const inserted = await db
        .insert(conversationMessageReactions)
        .values(batch)
        .onConflictDoNothing()
        .returning({ id: conversationMessageReactions.id });
      result.inserted += inserted.length;
      result.skipped += batch.length - inserted.length;
      result.details!.duplicate += batch.length - inserted.length;
    } catch {
      result.failed += batch.length;
    }
  }

  return result;
}
