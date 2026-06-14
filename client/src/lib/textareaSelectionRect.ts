const MIRROR_PROPERTIES = [
  "direction",
  "boxSizing",
  "width",
  "height",
  "overflowX",
  "overflowY",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "fontSize",
  "fontSizeAdjust",
  "lineHeight",
  "fontFamily",
  "textAlign",
  "textTransform",
  "textIndent",
  "textDecoration",
  "letterSpacing",
  "wordSpacing",
  "tabSize",
  "MozTabSize",
] as const;

function getMirrorDiv(textarea: HTMLTextAreaElement): HTMLDivElement {
  let mirror = textarea.parentElement?.querySelector<HTMLDivElement>(
    "[data-chat-textarea-mirror]"
  );
  if (mirror) return mirror;

  mirror = document.createElement("div");
  mirror.setAttribute("data-chat-textarea-mirror", "");
  mirror.setAttribute("aria-hidden", "true");
  const style = mirror.style;
  style.position = "absolute";
  style.top = "0";
  style.left = "-9999px";
  style.visibility = "hidden";
  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  textarea.parentElement?.appendChild(mirror);
  return mirror;
}

function syncMirrorStyles(textarea: HTMLTextAreaElement, mirror: HTMLDivElement): void {
  const computed = window.getComputedStyle(textarea);
  for (const prop of MIRROR_PROPERTIES) {
    mirror.style.setProperty(
      prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`),
      computed.getPropertyValue(prop)
    );
  }
}

function buildMirrorContent(text: string, caretIndex: number): string {
  const before = text.slice(0, caretIndex);
  const escaped = before
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
  return `${escaped}<span data-caret-marker>&nbsp;</span>`;
}

export function getTextareaSelectionRect(
  textarea: HTMLTextAreaElement,
  selectionStart: number,
  selectionEnd: number
): DOMRect | null {
  if (selectionStart === selectionEnd) return null;

  const mirror = getMirrorDiv(textarea);
  syncMirrorStyles(textarea, mirror);

  mirror.innerHTML = buildMirrorContent(textarea.value, selectionStart);
  const startMarker = mirror.querySelector("[data-caret-marker]");
  if (!startMarker) return null;
  const startRect = startMarker.getBoundingClientRect();

  mirror.innerHTML = buildMirrorContent(textarea.value, selectionEnd);
  const endMarker = mirror.querySelector("[data-caret-marker]");
  if (!endMarker) return null;
  const endRect = endMarker.getBoundingClientRect();

  const textareaRect = textarea.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const top =
    Math.min(startRect.top, endRect.top) -
    mirrorRect.top -
    textarea.scrollTop +
    textareaRect.top;
  const left =
    Math.min(startRect.left, endRect.left) -
    mirrorRect.left -
    textarea.scrollLeft +
    textareaRect.left;
  const right =
    Math.max(startRect.right, endRect.right) -
    mirrorRect.left -
    textarea.scrollLeft +
    textareaRect.left;
  const bottom =
    Math.max(startRect.bottom, endRect.bottom) -
    mirrorRect.top -
    textarea.scrollTop +
    textareaRect.top;

  return new DOMRect(left, top, Math.max(right - left, 8), Math.max(bottom - top, 20));
}
