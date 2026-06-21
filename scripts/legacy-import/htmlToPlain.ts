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

/** Convert legacy article HTML to plain text with paragraph breaks. */
export function htmlToPlain(html: string): string {
  if (!html?.trim()) return "";

  let text = html;
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<p[^>]*>/gi, "");
  text = text.replace(/<[^>]+>/g, "");
  text = decodeBasicEntities(text);
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
