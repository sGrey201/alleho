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

    const apply = () => {
      const vv = window.visualViewport;
      const vvHeight = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;

      const isStandaloneIOS =
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      // Skip the stretch in iPad split view / landscape where innerWidth differs.
      const isFullscreenPortrait = window.innerWidth === window.screen.width;

      // While an input is focused the keyboard is (appearing) up. In standalone
      // PWA the `shortfall > 150` heuristic is unreliable during the open
      // animation, so stretching to screen height would push the composer under
      // the keyboard. Anchoring to the real visualViewport height keeps the
      // composer visible. The stretch only matters for the no-keyboard idle case.
      const editableFocused = isEditableElement(document.activeElement);

      let height = vvHeight;
      if (isStandaloneIOS && isFullscreenPortrait && !editableFocused) {
        // Status bar shortfall is ~44-59pt; anything bigger means the keyboard is up.
        const shortfall = window.screen.height - (vvHeight + offsetTop);
        const keyboardOpen = shortfall > 150;
        if (!keyboardOpen) {
          height = Math.max(vvHeight, window.screen.height);
        }
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

    // Re-measure when an input gains focus: iOS standalone does not always fire a
    // `visualViewport` resize as the keyboard animates in.
    const handleFocusIn = (event: FocusEvent) => {
      if (isEditableElement(event.target)) scheduleApply();
    };

    apply();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", scheduleApply);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", scheduleApply);

    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", scheduleApply);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", scheduleApply);
      document.documentElement.style.removeProperty("--app-height");
      document.documentElement.style.removeProperty("--app-offset-top");
    };
  }, [enabled]);
}
