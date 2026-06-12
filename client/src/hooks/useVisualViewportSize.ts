import { useEffect } from "react";

/** True for elements that summon the on-screen keyboard. */
function isEditableElement(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

/**
 * Keeps --app-height in sync with the real visible viewport.
 *
 * Two iOS quirks handled here:
 * - Keyboard: visualViewport shrinks, so the app (and the composer pinned to its
 *   bottom) stays above the keyboard instead of leaving a gap after it closes.
 * - Standalone PWA with black-translucent status bar: WebKit reports the layout
 *   viewport as screen height minus the status bar, and iOS paints the uncovered
 *   bottom band with theme-color (gray strip above the home indicator). When no
 *   keyboard is shown we stretch the app to the physical screen height.
 */
export function useVisualViewportSize(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let focusOutTimer: ReturnType<typeof setTimeout> | null = null;

    const apply = () => {
      const vv = window.visualViewport;
      const vvHeight = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;

      const isStandaloneIOS =
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      // Skip the stretch in iPad split view / landscape where innerWidth differs.
      const isFullscreenPortrait = window.innerWidth === window.screen.width;

      const shortfall = window.screen.height - (vvHeight + offsetTop);
      const editableFocused = isEditableElement(document.activeElement);
      // Treat keyboard as open while an input is focused OR the viewport visibly shrank.
      const keyboardOpen = editableFocused || shortfall > 150;

      document.documentElement.classList.toggle("keyboard-open", keyboardOpen);

      let height = vvHeight;
      if (isStandaloneIOS && isFullscreenPortrait && !keyboardOpen) {
        height = Math.max(vvHeight, window.screen.height);
      }

      document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
      document.documentElement.style.setProperty("--app-offset-top", `${Math.round(offsetTop)}px`);
    };

    const scheduleApply = () => {
      apply();
      requestAnimationFrame(apply);
      window.setTimeout(apply, 100);
      window.setTimeout(apply, 300);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (focusOutTimer) {
        clearTimeout(focusOutTimer);
        focusOutTimer = null;
      }
      if (isEditableElement(event.target)) scheduleApply();
    };

    // Delay stretch-to-screen until the keyboard finish animation; cancel if focus
    // returns quickly (common when toggling the keyboard repeatedly).
    const handleFocusOut = () => {
      scheduleApply();
      if (focusOutTimer) clearTimeout(focusOutTimer);
      focusOutTimer = setTimeout(() => {
        focusOutTimer = null;
        scheduleApply();
      }, 450);
    };

    apply();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", scheduleApply);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      if (focusOutTimer) clearTimeout(focusOutTimer);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", scheduleApply);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.documentElement.classList.remove("keyboard-open");
      document.documentElement.style.removeProperty("--app-height");
      document.documentElement.style.removeProperty("--app-offset-top");
    };
  }, [enabled]);
}
