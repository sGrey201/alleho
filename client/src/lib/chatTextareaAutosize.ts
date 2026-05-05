/** Grow/shrink chat input to content; use after value clears so height collapses to one line. */
const LINE = 24;
export const CHAT_TEXTAREA_MAX_HEIGHT = LINE * 6;

export function syncChatTextareaHeight(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, CHAT_TEXTAREA_MAX_HEIGHT)}px`;
}
