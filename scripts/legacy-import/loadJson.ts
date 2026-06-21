import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  SourceArticle,
  SourceArticleLike,
  SourceArticleTag,
  SourcePayment,
  SourceTag,
  SourceUser,
} from "./types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const LEGACY_DATA_DIR = join(__dirname, "..", "..", "old data");

function readJsonArray<T>(filename: string): T[] {
  const path = join(LEGACY_DATA_DIR, filename);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(raw)) {
    throw new Error(`Expected array in ${path}`);
  }
  return raw as T[];
}

export function loadLegacyUsers(): SourceUser[] {
  return readJsonArray<SourceUser>("users.json");
}

export function loadLegacyTags(): SourceTag[] {
  return readJsonArray<SourceTag>("tags.json");
}

export function loadLegacyArticleTags(): SourceArticleTag[] {
  return readJsonArray<SourceArticleTag>("article_tags.json");
}

export function loadLegacyArticles(): SourceArticle[] {
  return readJsonArray<SourceArticle>("articles.json");
}

export function loadLegacyArticleLikes(): SourceArticleLike[] {
  return readJsonArray<SourceArticleLike>("article_likes.json");
}

export function loadLegacyPayments(): SourcePayment[] {
  return readJsonArray<SourcePayment>("payments.json");
}

export function buildTagMap(tags: SourceTag[]): Map<string, SourceTag> {
  return new Map(tags.map((tag) => [tag.id, tag]));
}

export function buildArticleTagsMap(
  articleTags: SourceArticleTag[],
  tagMap: Map<string, SourceTag>
): Map<string, SourceTag[]> {
  const result = new Map<string, SourceTag[]>();
  for (const link of articleTags) {
    const tag = tagMap.get(link.tag_id);
    if (!tag) continue;
    const list = result.get(link.article_id) ?? [];
    list.push(tag);
    result.set(link.article_id, list);
  }
  return result;
}
