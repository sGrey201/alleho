/** Scroll an overflow-y container so the last pixels are visible (reliable vs scrollIntoView in nested layouts). */
export function scrollChatPaneToBottom(scrollRoot: HTMLElement | null): void {
  if (!scrollRoot) return;
  scrollRoot.scrollTop = scrollRoot.scrollHeight;
}
