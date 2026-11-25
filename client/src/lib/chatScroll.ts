/** Dispatched when `.chat-composer-panel` height changes (keyboard, reply bar, safe area). */
export const CHAT_COMPOSER_INSET_EVENT = "chat-composer-inset";

/** Ask `useVisualViewportSize` to re-measure after transient viewport changes (e.g. mic permission). */
export const VISUAL_VIEWPORT_REFRESH_EVENT = "visual-viewport-refresh";

/** Scroll an overflow-y container so the last pixels are visible (reliable vs scrollIntoView in nested layouts). */
export function scrollChatPaneToBottom(scrollRoot: HTMLElement | null): void {
  if (!scrollRoot) return;
  scrollRoot.scrollTop = scrollRoot.scrollHeight;
}

export function isChatScrolledToBottom(scrollRoot: HTMLElement, threshold = 8): boolean {
  return scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight <= threshold;
}

export type ChatScrollAnchor = {
  messageId: string;
  /** Distance from the pane's top edge to the message's top edge. */
  offset: number;
};

export type ChatScrollSnapshot = {
  atBottom: boolean;
  anchor: ChatScrollAnchor | null;
};

const chatScrollSnapshots = new Map<string, ChatScrollSnapshot>();

export function readChatScrollSnapshot(conversationId: string): ChatScrollSnapshot | undefined {
  return chatScrollSnapshots.get(conversationId);
}

export function writeChatScrollSnapshot(conversationId: string, snapshot: ChatScrollSnapshot): void {
  chatScrollSnapshots.set(conversationId, snapshot);
}

function messageNodes(scrollRoot: HTMLElement): HTMLElement[] {
  const content = scrollRoot.firstElementChild;
  if (!content) return [];
  const nodes: HTMLElement[] = [];
  const children = content.children;
  for (let i = 0; i < children.length; i += 1) {
    const node = children[i];
    if (node instanceof HTMLElement && node.dataset.messageId) nodes.push(node);
  }
  return nodes;
}

/** First message that is still on screen (or the first one below the top edge). */
export function captureChatScrollAnchor(scrollRoot: HTMLElement): ChatScrollAnchor | null {
  const nodes = messageNodes(scrollRoot);
  if (nodes.length === 0) return null;
  const rootTop = scrollRoot.getBoundingClientRect().top;
  let lo = 0;
  let hi = nodes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const rect = nodes[mid].getBoundingClientRect();
    if (rect.bottom > rootTop + 1) {
      found = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  if (found < 0) return null;
  const el = nodes[found];
  const messageId = el.dataset.messageId;
  if (!messageId) return null;
  return { messageId, offset: el.getBoundingClientRect().top - rootTop };
}

export function captureChatScrollSnapshot(scrollRoot: HTMLElement): ChatScrollSnapshot {
  return {
    atBottom: isChatScrolledToBottom(scrollRoot),
    anchor: captureChatScrollAnchor(scrollRoot),
  };
}

/** Keep the same message at the same place in the pane. Returns false if it is not mounted. */
export function restoreChatScrollAnchor(scrollRoot: HTMLElement, anchor: ChatScrollAnchor): boolean {
  const el = scrollRoot.querySelector<HTMLElement>(
    `[data-message-id="${CSS.escape(anchor.messageId)}"]`
  );
  if (!el) return false;
  const rootTop = scrollRoot.getBoundingClientRect().top;
  const delta = el.getBoundingClientRect().top - rootTop - anchor.offset;
  if (Math.abs(delta) < 0.5) return true;
  const maxTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
  scrollRoot.scrollTop = Math.min(maxTop, Math.max(0, scrollRoot.scrollTop + delta));
  return true;
}

/** Pin the chat viewport to the latest messages. */
export function anchorChatToBottom(scrollRoot: HTMLElement | null): void {
  scrollChatPaneToBottom(scrollRoot);
}

/** Keep a chat element visible while nested content height changes (e.g. inline payment forms). */
export function scrollChatElementIntoView(
  el: HTMLElement | null,
  options: ScrollIntoViewOptions = { behavior: "smooth", block: "nearest" }
): void {
  if (!el) return;
  const run = () => el.scrollIntoView(options);
  run();
  requestAnimationFrame(run);
  window.setTimeout(run, 80);
  window.setTimeout(run, 350);
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

/** Position a focused input/textarea just above the on-screen keyboard (one pass). */
export function adjustFocusedEditableAboveKeyboard(el: HTMLElement): void {
  const scrollRoot = el.closest(".app-sheet-panel-body");
  if (!(scrollRoot instanceof HTMLElement)) return;
  if (document.activeElement !== el) return;

  const vv = window.visualViewport;
  const rootRect = scrollRoot.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const visibleTop = vv?.offsetTop ?? 0;
  const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const effectiveTop = Math.max(visibleTop, rootRect.top) + 12;
  const effectiveBottom = Math.min(visibleBottom, rootRect.bottom) - 16;

  if (elRect.bottom > effectiveBottom) {
    scrollRoot.scrollTop += elRect.bottom - effectiveBottom;
  } else if (elRect.top < effectiveTop) {
    scrollRoot.scrollTop += elRect.top - effectiveTop;
  }
}

/** Re-position while the iOS keyboard animation settles. */
export function scrollFocusedEditableAboveKeyboard(el: HTMLElement): void {
  const run = () => adjustFocusedEditableAboveKeyboard(el);
  run();
  requestAnimationFrame(run);
  window.setTimeout(run, 100);
  window.setTimeout(run, 300);
  window.setTimeout(run, 550);
}

/** Scroll an element to the vertical center of a chat pane (instant, no document scroll). */
export function scrollChatBubbleIntoPane(
  scrollRoot: HTMLElement,
  el: HTMLElement,
  block: "center" | "nearest" = "center"
): void {
  const rootRect = scrollRoot.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const elTopInRoot = elRect.top - rootRect.top + scrollRoot.scrollTop;

  let targetTop: number;
  if (block === "center") {
    targetTop = elTopInRoot - scrollRoot.clientHeight / 2 + elRect.height / 2;
  } else {
    const elBottom = elTopInRoot + elRect.height;
    const viewTop = scrollRoot.scrollTop;
    const viewBottom = viewTop + scrollRoot.clientHeight;
    if (elTopInRoot >= viewTop && elBottom <= viewBottom) return;
    if (elTopInRoot < viewTop) targetTop = elTopInRoot;
    else targetTop = elBottom - scrollRoot.clientHeight;
  }

  const maxTop = Math.max(0, scrollRoot.scrollHeight - scrollRoot.clientHeight);
  scrollRoot.scrollTop = Math.min(maxTop, Math.max(0, targetTop));
}

/** Opacity pulse to highlight a message bubble after scroll. */
export function blinkChatBubble(el: HTMLElement): void {
  let blinkCount = 0;
  const tick = () => {
    if (blinkCount >= 6) return;
    if (blinkCount % 2 === 0) {
      el.classList.add("opacity-60");
    } else {
      el.classList.remove("opacity-60");
    }
    blinkCount += 1;
    window.setTimeout(tick, 320);
  };
  tick();
}

const FOCUS_BUBBLE_RETRY_MS = 2000;
const FOCUS_BUBBLE_RETRY_INTERVAL_MS = 50;

/**
 * Scroll a bubble into view inside the chat pane, then run onHighlighted.
 * Retries until scroll root and element exist or timeout (deep links after pagination).
 */
export function focusChatBubble(
  resolveScrollRoot: () => HTMLElement | null,
  resolveElement: () => HTMLElement | null,
  onHighlighted?: () => void
): void {
  const startedAt = Date.now();

  const tryFocus = () => {
    const scrollRoot = resolveScrollRoot();
    const el = resolveElement();
    if (!scrollRoot || !el) {
      if (Date.now() - startedAt < FOCUS_BUBBLE_RETRY_MS) {
        window.setTimeout(tryFocus, FOCUS_BUBBLE_RETRY_INTERVAL_MS);
      }
      return;
    }

    scrollChatBubbleIntoPane(scrollRoot, el, "center");

    requestAnimationFrame(() => {
      scrollChatBubbleIntoPane(scrollRoot, el, "center");
      requestAnimationFrame(() => {
        scrollChatBubbleIntoPane(scrollRoot, el, "center");
        onHighlighted?.();
      });
    });
  };

  tryFocus();
}
