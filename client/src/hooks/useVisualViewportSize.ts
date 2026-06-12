import { useEffect } from "react";

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

      let height = vvHeight;
      if (isStandaloneIOS && isFullscreenPortrait) {
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

    apply();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", scheduleApply);
    document.addEventListener("focusout", scheduleApply);

    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", scheduleApply);
      document.removeEventListener("focusout", scheduleApply);
      document.documentElement.style.removeProperty("--app-height");
      document.documentElement.style.removeProperty("--app-offset-top");
    };
  }, [enabled]);
}
