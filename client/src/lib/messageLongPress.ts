import type { TouchEvent, PointerEvent } from "react";

export const MESSAGE_LONG_PRESS_MS = 400;
const MOVE_THRESHOLD_PX = 8;
const SELECTION_GUARD_MS = 80;

/** Visible text lines in the right-click / long-press message preview bubble. */
export const MESSAGE_LAYER_MAX_TEXT_LINES = 10;

/** text-sm (14px) × leading-snug (1.375) × lines + p-2 padding (16px). */
export const MESSAGE_LAYER_BUBBLE_MAX_HEIGHT_PX = Math.ceil(
  14 * 1.375 * MESSAGE_LAYER_MAX_TEXT_LINES + 16
);

export type MessageLayerRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type MessageActionLayerLayout = {
  bubbleTop: number;
  bubbleHeight: number;
  menuTop: number;
  reactionsTop: number;
};

/** Keeps reactions + bubble + action menu inside the viewport. */
export function layoutMessageActionLayer(
  rect: MessageLayerRect,
  viewportHeight: number,
  options?: {
    bubbleMaxHeight?: number;
    menuHeight?: number;
    reactionsBarOffset?: number;
    bubbleToMenuGap?: number;
    margin?: number;
  }
): MessageActionLayerLayout {
  const bubbleMaxHeight = options?.bubbleMaxHeight ?? MESSAGE_LAYER_BUBBLE_MAX_HEIGHT_PX;
  const menuHeight = options?.menuHeight ?? 280;
  const reactionsBarOffset = options?.reactionsBarOffset ?? 42;
  const bubbleToMenuGap = options?.bubbleToMenuGap ?? 8;
  const margin = options?.margin ?? 12;

  const bubbleHeight = Math.min(rect.height, bubbleMaxHeight);
  const minBubbleTop = margin + reactionsBarOffset;
  const maxBubbleTop = Math.max(
    minBubbleTop,
    viewportHeight - margin - bubbleHeight - bubbleToMenuGap - menuHeight
  );

  let bubbleTop = Math.max(minBubbleTop, Math.min(rect.top, maxBubbleTop));

  // Message scrolled under the header — anchor to its visible lower portion.
  if (rect.top < minBubbleTop) {
    const messageVisibleBottom = Math.min(rect.top + rect.height, maxBubbleTop + bubbleHeight);
    const preferredTop = messageVisibleBottom - bubbleHeight;
    bubbleTop = Math.max(minBubbleTop, Math.min(preferredTop, maxBubbleTop));
  }

  const menuTop = bubbleTop + bubbleHeight + bubbleToMenuGap;
  const reactionsTop = Math.max(margin, bubbleTop - reactionsBarOffset);

  return { bubbleTop, bubbleHeight, menuTop, reactionsTop };
}

export type MessageLongPressRefs = {
  timer: number | null;
  guardTimer: number | null;
  start: { x: number; y: number } | null;
};

function clearTextSelection(): void {
  window.getSelection()?.removeAllRanges();
}

let selectionGuardCount = 0;

function onSelectionChange(): void {
  if (selectionGuardCount > 0) clearTextSelection();
}

function startSelectionGuard(): void {
  if (selectionGuardCount === 0) {
    document.addEventListener("selectionchange", onSelectionChange);
  }
  selectionGuardCount += 1;
}

function stopSelectionGuard(): void {
  if (selectionGuardCount <= 0) return;
  selectionGuardCount -= 1;
  if (selectionGuardCount === 0) {
    document.removeEventListener("selectionchange", onSelectionChange);
    clearTextSelection();
  }
}

let activeLongPressRefs: MessageLongPressRefs | null = null;
let documentReleaseListenersAttached = false;

function onDocumentPointerRelease(): void {
  if (!activeLongPressRefs) return;
  clearMessageLongPress(activeLongPressRefs);
}

function ensureDocumentReleaseListeners(): void {
  if (documentReleaseListenersAttached) return;
  documentReleaseListenersAttached = true;
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  document.addEventListener("touchend", onDocumentPointerRelease, opts);
  document.addEventListener("touchcancel", onDocumentPointerRelease, opts);
  document.addEventListener("pointerup", onDocumentPointerRelease, true);
  document.addEventListener("pointercancel", onDocumentPointerRelease, true);
}

function clearMessageLongPressTimers(refs: MessageLongPressRefs): void {
  if (refs.timer !== null) {
    window.clearTimeout(refs.timer);
    refs.timer = null;
  }
  if (refs.guardTimer !== null) {
    window.clearTimeout(refs.guardTimer);
    refs.guardTimer = null;
  }
  refs.start = null;
}

export function isInteractiveMessageTarget(target: HTMLElement): boolean {
  const interactive = target.closest("a,button,input,textarea");
  if (!interactive || !(interactive instanceof HTMLElement)) return false;
  // Message action cards (e.g. questionnaire) still need long-press for the context menu.
  if (interactive.dataset.allowLongPress === "true") return false;
  return true;
}

export function clearMessageLongPress(refs: MessageLongPressRefs): void {
  clearMessageLongPressTimers(refs);
  stopSelectionGuard();
  if (activeLongPressRefs === refs) activeLongPressRefs = null;
}

export function startMessageLongPress(
  refs: MessageLongPressRefs,
  x: number,
  y: number,
  onOpen: () => void
): void {
  clearMessageLongPress(refs);
  refs.start = { x, y };
  activeLongPressRefs = refs;
  ensureDocumentReleaseListeners();
  startSelectionGuard();
  clearTextSelection();

  refs.guardTimer = window.setTimeout(() => {
    clearTextSelection();
  }, SELECTION_GUARD_MS);

  refs.timer = window.setTimeout(() => {
    clearTextSelection();
    onOpen();
    clearMessageLongPressTimers(refs);
    clearTextSelection();
  }, MESSAGE_LONG_PRESS_MS);
}

export function handleMessageTouchStart(
  e: TouchEvent<HTMLElement>,
  refs: MessageLongPressRefs,
  onOpen: () => void,
  enabled = true
): void {
  if (!enabled) return;
  const target = e.target as HTMLElement;
  if (isInteractiveMessageTarget(target)) return;
  const touch = e.touches[0];
  if (!touch) return;
  startMessageLongPress(refs, touch.clientX, touch.clientY, onOpen);
}

export function handleMessageTouchMove(
  e: TouchEvent<HTMLElement>,
  refs: MessageLongPressRefs
): void {
  const start = refs.start;
  if (!start) return;
  const touch = e.touches[0];
  if (!touch) return;
  const dx = Math.abs(touch.clientX - start.x);
  const dy = Math.abs(touch.clientY - start.y);
  if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
    clearMessageLongPress(refs);
    return;
  }
  if (e.cancelable) e.preventDefault();
}

export function handleMessagePointerDown(
  e: PointerEvent<HTMLElement>,
  refs: MessageLongPressRefs,
  onOpen: () => void,
  enabled = true
): void {
  if (!enabled || e.pointerType !== "mouse") return;
  const target = e.target as HTMLElement;
  if (isInteractiveMessageTarget(target)) return;
  startMessageLongPress(refs, e.clientX, e.clientY, onOpen);
}

export function handleMessagePointerMove(
  e: PointerEvent<HTMLElement>,
  refs: MessageLongPressRefs
): void {
  const start = refs.start;
  if (!start) return;
  const dx = Math.abs(e.clientX - start.x);
  const dy = Math.abs(e.clientY - start.y);
  if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
    clearMessageLongPress(refs);
  }
}
