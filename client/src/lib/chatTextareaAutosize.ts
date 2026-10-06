/** Grow/shrink chat input to content; use after value clears so height collapses to one line. */
const LINE = 24;
export const CHAT_TEXTAREA_MAX_HEIGHT = LINE * 6;

export function syncChatTextareaHeight(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.overflowY = "hidden";
  const full = el.scrollHeight;
  el.style.height = `${Math.min(full, CHAT_TEXTAREA_MAX_HEIGHT)}px`;
  el.style.overflowY = full > CHAT_TEXTAREA_MAX_HEIGHT ? "auto" : "hidden";
}
