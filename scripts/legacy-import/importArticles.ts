import { and, eq } from "drizzle-orm";
import { db } from "../../server/db.ts";
import { storage } from "../../server/storage.ts";
import { previewFromConversationMessageParts } from "../../server/utils/conversationPreview.ts";
import {
  conversationMessages,
  conversationParticipants,
  conversations,
} from "../../shared/schema.ts";
import { buildPostContent } from "./buildPostContent.ts";
import { CHANNEL_ID } from "./constants.ts";
import {
  buildArticleTagsMap,
  buildTagMap,
  loadLegacyArticleTags,
  loadLegacyArticles,
  loadLegacyTags,
} from "./loadJson.ts";
import { parseDate } from "./parseDate.ts";
import type { ImportPhaseResult, SourceArticle } from "./types.ts";

function sortArticlesChronologically(articles: SourceArticle[]): SourceArticle[] {
  return [...articles].sort((a, b) => {
    const ta = parseDate(a.created_at)?.getTime() ?? 0;
    const tb = parseDate(b.created_at)?.getTime() ?? 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

async function getChannelOwnerUserId(): Promise<string> {
  const [owner] = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(
      and(
        eq(conversationParticipants.conversationId, CHANNEL_ID),
        eq(conversationParticipants.role, "owner")
      )
    )
    .limit(1);
  if (!owner) {
    throw new Error(`Channel owner not found for ${CHANNEL_ID}`);
  }
  return owner.userId;
}

async function ensureChannelMonetizationEnabled(dryRun: boolean): Promise<void> {
  const settings = await storage.getChannelSponsorSettings(CHANNEL_ID);
  if (settings?.enabled) return;
  if (dryRun) return;
  await storage.upsertChannelSponsorSettings(CHANNEL_ID, {
    enabled: true,
    tier1Amount: settings?.tier1Amount ?? "500",
    contentDurationDays: settings?.contentDurationDays ?? 180,
  });
}

export async function importArticles(options: { dryRun: boolean }): Promise<ImportPhaseResult> {
  const articles = sortArticlesChronologically(loadLegacyArticles());
  const tags = loadLegacyTags();
  const articleTags = loadLegacyArticleTags();
  const tagMap = buildTagMap(tags);
  const articleTagsMap = buildArticleTagsMap(articleTags, tagMap);

  const ownerUserId = await getChannelOwnerUserId();
  await ensureChannelMonetizationEnabled(options.dryRun);

  const existingMessages = await db
    .select({ id: conversationMessages.id })
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, CHANNEL_ID));
  const existingIds = new Set(existingMessages.map((m) => m.id));

  const result: ImportPhaseResult = {
    total: articles.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    details: { noTags: 0, updated: 0 },
  };

  let latestMessage: {
    content: string;
    createdAt: Date | null;
  } | null = null;

  for (const article of articles) {
    const tagsForArticle = articleTagsMap.get(article.id) ?? [];
    if (tagsForArticle.length === 0) {
      result.details!.noTags += 1;
    }

    const content = buildPostContent(article, tagsForArticle);
    const createdAt = parseDate(article.created_at) ?? new Date();

    if (!latestMessage || createdAt > (latestMessage.createdAt ?? new Date(0))) {
      latestMessage = { content, createdAt };
    }

    if (existingIds.has(article.id)) {
      if (options.dryRun) {
        result.details!.updated += 1;
        continue;
      }
      try {
        await db
          .update(conversationMessages)
          .set({ content, createdAt })
          .where(eq(conversationMessages.id, article.id));
        result.details!.updated += 1;
      } catch {
        result.failed += 1;
      }
      continue;
    }

    if (options.dryRun) {
      result.inserted += 1;
      continue;
    }

    try {
      await db.insert(conversationMessages).values({
        id: article.id,
        conversationId: CHANNEL_ID,
        authorUserId: ownerUserId,
        messageType: "message",
        content,
        createdAt,
      });
      result.inserted += 1;
    } catch {
      result.failed += 1;
    }
  }

  if (!options.dryRun && latestMessage) {
    const preview = previewFromConversationMessageParts(latestMessage.content, null, "message");
    await db
      .update(conversations)
      .set({
        lastMessageAt: latestMessage.createdAt ?? new Date(),
        lastMessagePreview: preview,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, CHANNEL_ID));
  }

  return result;
}
