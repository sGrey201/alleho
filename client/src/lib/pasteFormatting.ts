import { BOLD_MARKER } from "@shared/messageFormatting";

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "LI",
  "TR",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
]);

const IGNORED_TAGS = new Set(["STYLE", "SCRIPT", "META", "HEAD", "TITLE", "LINK"]);

function isBoldElement(el: HTMLElement): boolean {
  const tag = el.tagName;
  if (tag === "B" || tag === "STRONG") return true;

  const styleAttr = el.getAttribute("style") ?? "";
  if (/font-weight\s*:\s*(bold|bolder|[6-9]00)/i.test(styleAttr)) return true;

  const fontWeight = el.style.fontWeight;
  if (fontWeight === "bold" || fontWeight === "bolder") return true;
  const numeric = parseInt(fontWeight, 10);
  return !Number.isNaN(numeric) && numeric >= 600;
}

function normalizeTextNode(text: string): string {
  // HTML exporters (Word, markdown tools) wrap long lines in source; those \n are not paragraph breaks.
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
}

function walkNode(node: Node, ancestorBold: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeTextNode(node.textContent ?? "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName;

  if (IGNORED_TAGS.has(tag)) return "";
  if (tag === "BR") return "\n";

  const boldHere = !ancestorBold && isBoldElement(el);
  let inner = "";
  for (const child of Array.from(el.childNodes)) {
    inner += walkNode(child, ancestorBold || boldHere);
  }

  if (boldHere && inner) {
    inner = `${BOLD_MARKER}${inner}${BOLD_MARKER}`;
  }

  if (BLOCK_TAGS.has(tag) && inner && !inner.endsWith("\n")) {
    inner += "\n";
  }

  return inner;
}

function normalizePastedMarkup(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/(\*\*){2,}/g, BOLD_MARKER)
    .trimEnd();
}

/** Convert clipboard HTML bold styles to **markup**. */
export function htmlToBoldMarkup(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return normalizePastedMarkup(walkNode(doc.body, false));
}

/** Returns converted text when clipboard contains HTML, otherwise null (use default paste). */
export function clipboardHtmlToBoldMarkup(data: DataTransfer): string | null {
  const html = data.getData("text/html");
  if (!html?.trim()) return null;
  const converted = htmlToBoldMarkup(html);
  return converted.length > 0 ? converted : null;
}
