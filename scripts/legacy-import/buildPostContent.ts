import { BOLD_MARKER, SPONSOR_MARKER } from "../../shared/messageFormatting.ts";
import { PAYWALL_FREE_WORDS } from "./constants.ts";
import { htmlToFormatted } from "./htmlToPlain.ts";
import type { SourceTag } from "./types.ts";

function sortTags(tags: SourceTag[]): SourceTag[] {
  return [...tags].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === "situation" ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "ru");
  });
}

function formatRemedyName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const [first, ...rest] = words;
  return [
    first.charAt(0).toUpperCase() + first.slice(1).toLowerCase(),
    ...rest.map((word) => word.toLowerCase()),
  ].join(" ");
}

export function formatArticleTitle(tags: SourceTag[]): string {
  const sorted = sortTags(tags);
  const title = sorted
    .map((tag) => (tag.category === "remedy" ? formatRemedyName(tag.name) : tag.name))
    .join(", ");
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

export function formatTagHashtagToken(tag: SourceTag): string {
  if (tag.category === "remedy") {
    return formatRemedyName(tag.name)
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  return normalizeTagHashtag(tag.name);
}

export function formatHashtagLine(tags: SourceTag[]): string {
  const sorted = sortTags(tags);
  return sorted
    .map((tag) => formatTagHashtagToken(tag))
    .filter(Boolean)
    .map((token) => `#${token}`)
    .join(" ");
}

function splitAtWordCount(text: string, wordCount: number): { free: string; paid: string } {
  const paragraphs = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) {
    return { free: "", paid: "" };
  }

  let wordsUsed = 0;
  const freeParagraphs: string[] = [];
  let index = 0;

  for (; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    const paragraphWords = paragraph.split(/\s+/).filter(Boolean);
    const paragraphWordCount = paragraphWords.length;

    if (wordsUsed + paragraphWordCount <= wordCount) {
      freeParagraphs.push(paragraph);
      wordsUsed += paragraphWordCount;
      continue;
    }

    if (wordsUsed < wordCount) {
      const remainingWords = wordCount - wordsUsed;
      const freeWords = paragraphWords.slice(0, remainingWords);
      const paidWords = paragraphWords.slice(remainingWords);
      if (freeWords.length > 0) {
        freeParagraphs.push(freeWords.join(" "));
      }
      const paidParagraphs = [
        ...(paidWords.length > 0 ? [paidWords.join(" ")] : []),
        ...paragraphs.slice(index + 1),
      ];
      return {
        free: freeParagraphs.join("\n\n"),
        paid: paidParagraphs.join("\n\n"),
      };
    }

    break;
  }

  return {
    free: freeParagraphs.join("\n\n"),
    paid: paragraphs.slice(index).join("\n\n"),
  };
}

function buildArticleBody(article: { preview: string; content: string }): string {
  const preview = htmlToFormatted(article.preview ?? "");
  const content = htmlToFormatted(article.content ?? "");
  if (preview && content) return `${preview}\n\n${content}`;
  return preview || content;
}

export function buildPostContent(
  article: {
    preview: string;
    content: string;
    is_free: boolean;
  },
  tags: SourceTag[]
): string {
  const title = formatArticleTitle(tags);
  const plainBody = buildArticleBody(article);
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

  // Public hashtags after paid block so non-sponsors still see them.
  if (hashtagLine) {
    parts.push(hashtagLine);
  }

  return parts.join("\n\n").trim();
}
