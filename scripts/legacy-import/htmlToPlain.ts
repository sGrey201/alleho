import { BOLD_MARKER } from "../../shared/messageFormatting.ts";

const HTML_ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decodeBasicEntities(text: string): string {
  let result = text;
  for (const [entity, char] of Object.entries(HTML_ENTITY_MAP)) {
    result = result.split(entity).join(char);
  }
  return result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripInlineTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** Convert legacy article HTML to plain text, preserving bold as ** markers. */
export function htmlToFormatted(html: string): string {
  if (!html?.trim()) return "";

  let text = html;
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<p[^>]*>/gi, "");
  text = text.replace(
    /<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi,
    (_, _tag, inner) => `${BOLD_MARKER}${stripInlineTags(inner)}${BOLD_MARKER}`
  );
  text = text.replace(/<[^>]+>/g, "");
  text = decodeBasicEntities(text);
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** @deprecated Use htmlToFormatted */
export function htmlToPlain(html: string): string {
  return htmlToFormatted(html);
}
