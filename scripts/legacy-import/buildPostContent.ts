import { BOLD_MARKER, SPONSOR_MARKER } from "../../shared/messageFormatting.ts";
import { PAYWALL_FREE_WORDS } from "./constants.ts";
import { htmlToPlain } from "./htmlToPlain.ts";
import type { SourceTag } from "./types.ts";

function sortTags(tags: SourceTag[]): SourceTag[] {
  return [...tags].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === "situation" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "ru");
  });
}

export function formatArticleTitle(tags: SourceTag[]): string {
  const sorted = sortTags(tags);
  const title = sorted.map((tag) => tag.name).join(", ");
  if (!title) return "";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Turn tag display name into a hashtag token (without leading #). */
export function normalizeTagHashtag(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z\u0400-\u04ff0-9_-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatHashtagLine(tags: SourceTag[]): string {
  const sorted = sortTags(tags);
  return sorted
    .map((tag) => normalizeTagHashtag(tag.name))
    .filter(Boolean)
    .map((token) => `#${token}`)
    .join(" ");
}

function splitAtWordCount(text: string, wordCount: number): { free: string; paid: string } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= wordCount) {
    return { free: text.trim(), paid: "" };
  }
  const free = words.slice(0, wordCount).join(" ");
  const paid = words.slice(wordCount).join(" ");
  return { free, paid };
}

export function buildPostContent(article: {
  content: string;
  is_free: boolean;
}, tags: SourceTag[]): string {
  const title = formatArticleTitle(tags);
  const plainBody = htmlToPlain(article.content);
  const hashtagLine = formatHashtagLine(tags);

  const parts: string[] = [];
  if (title) {
    parts.push(`${BOLD_MARKER}${title}${BOLD_MARKER}`);
  }

  if (plainBody) {
    if (article.is_free) {
      parts.push(plainBody);
    } else {
      const { free, paid } = splitAtWordCount(plainBody, PAYWALL_FREE_WORDS);
      if (free) parts.push(free);
      if (paid) {
        parts.push(`${SPONSOR_MARKER}${paid}${SPONSOR_MARKER}`);
      }
    }
  }

  if (hashtagLine) {
    parts.push(hashtagLine);
  }

  return parts.join("\n\n").trim();
}
