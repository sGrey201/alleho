/** Dispatched when `.chat-composer-panel` height changes (keyboard, reply bar, safe area). */
export const CHAT_COMPOSER_INSET_EVENT = "chat-composer-inset";

/** Ask `useVisualViewportSize` to re-measure after transient viewport changes (e.g. mic permission). */
export const VISUAL_VIEWPORT_REFRESH_EVENT = "visual-viewport-refresh";

/** Scroll an overflow-y container so the last pixels are visible (reliable vs scrollIntoView in nested layouts). */
export function scrollChatPaneToBottom(scrollRoot: HTMLElement | null): void {
  if (!scrollRoot) return;
  scrollRoot.scrollTop = scrollRoot.scrollHeight;
}

/** Re-scroll while the iOS keyboard and composer padding settle. */
export function scrollChatPaneToBottomForKeyboard(scrollRoot: HTMLElement | null): void {
  if (!scrollRoot) return;
  const scroll = () => scrollChatPaneToBottom(scrollRoot);
  scroll();
  requestAnimationFrame(scroll);
  window.setTimeout(scroll, 100);
  window.setTimeout(scroll, 350);
  window.setTimeout(scroll, 550);
}
