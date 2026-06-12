import { useEffect } from "react";
import { CHAT_COMPOSER_INSET_EVENT } from "@/lib/chatScroll";

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
    let observedComposer: Element | null = null;
    let composerRo: ResizeObserver | null = null;

    const updateComposerInset = () => {
      const composer = document.querySelector(".chat-composer-panel");
      if (!(composer instanceof HTMLElement)) {
        composerRo?.disconnect();
        composerRo = null;
        observedComposer = null;
        document.documentElement.style.removeProperty("--chat-composer-inset");
        return;
      }

      if (composer !== observedComposer) {
        composerRo?.disconnect();
        observedComposer = composer;
        composerRo = new ResizeObserver(updateComposerInset);
        composerRo.observe(composer);
      }

      const height = Math.ceil(composer.getBoundingClientRect().height);
      const next = `${height}px`;
      const prev = document.documentElement.style.getPropertyValue("--chat-composer-inset");
      document.documentElement.style.setProperty("--chat-composer-inset", next);
      if (prev !== next) {
        window.dispatchEvent(new CustomEvent(CHAT_COMPOSER_INSET_EVENT));
      }
    };

    // iOS scrolls the layout viewport when the keyboard opens; pinning scroll to the
    // origin keeps the fixed shell from "flying up" and exposing the page background.
    const pinLayoutScroll = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    const apply = () => {
      const vv = window.visualViewport;
      const vvHeight = vv?.height ?? window.innerHeight;
      const vvOffsetTop = vv?.offsetTop ?? 0;

      const isStandaloneIOS =
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      // Skip the stretch in iPad split view / landscape where innerWidth differs.
      const isFullscreenPortrait = window.innerWidth === window.screen.width;

      const shortfall = window.screen.height - (vvHeight + vvOffsetTop);
      const editableFocused = isEditableElement(document.activeElement);
      // Treat keyboard as open while an input is focused OR the viewport visibly shrank.
      const keyboardOpen = editableFocused || shortfall > 150;

      document.documentElement.classList.toggle("keyboard-open", keyboardOpen);

      let height = vvHeight;
      let keyboardGap = 0;
      if (keyboardOpen) {
        // Safari keeps an accessory strip (and sometimes a URL bar) between the page
        // bottom and the keyboard that lies outside visualViewport.height. Extend the
        // shell to cover it so raw wallpaper does not show through.
        const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
        const innerHeightGap = Math.max(0, window.innerHeight - vvHeight - vvOffsetTop);
        const layoutGap = Math.max(0, layoutHeight - vvHeight - vvOffsetTop);
        let measuredGap = 0;
        const composer = document.querySelector(".chat-composer-panel");
        if (composer) {
          const composerBottom = composer.getBoundingClientRect().bottom;
          measuredGap = Math.max(0, vvOffsetTop + vvHeight - composerBottom);
        }
        const extraBottom = Math.min(160, Math.max(layoutGap, innerHeightGap, measuredGap));
        if (extraBottom > 0) {
          keyboardGap = extraBottom;
          height = vvHeight + extraBottom;
        }
      } else if (isStandaloneIOS && isFullscreenPortrait) {
        height = Math.max(vvHeight, window.screen.height);
      }

      // Shrink the shell in place (height only). Applying visualViewport.offsetTop as
      // `top` shifts the whole app and causes a visible jump when the keyboard opens.
      document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
      document.documentElement.style.setProperty("--app-offset-top", "0px");
      if (keyboardGap > 0) {
        document.documentElement.style.setProperty("--keyboard-gap", `${Math.round(keyboardGap)}px`);
      } else {
        document.documentElement.style.removeProperty("--keyboard-gap");
      }

      if (keyboardOpen) {
        pinLayoutScroll();
      }

      requestAnimationFrame(updateComposerInset);
    };

    const scheduleApply = () => {
      apply();
      requestAnimationFrame(apply);
      window.setTimeout(apply, 100);
      window.setTimeout(apply, 300);
      window.setTimeout(updateComposerInset, 100);
      window.setTimeout(updateComposerInset, 350);
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (focusOutTimer) {
        clearTimeout(focusOutTimer);
        focusOutTimer = null;
      }
      if (isEditableElement(event.target)) {
        pinLayoutScroll();
        scheduleApply();
      }
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
    updateComposerInset();
    const vv = window.visualViewport;
    const onVisualViewportScroll = () => {
      pinLayoutScroll();
      apply();
    };
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", onVisualViewportScroll);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", scheduleApply);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      if (focusOutTimer) clearTimeout(focusOutTimer);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", onVisualViewportScroll);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", scheduleApply);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
      document.documentElement.classList.remove("keyboard-open");
      document.documentElement.style.removeProperty("--app-height");
      document.documentElement.style.removeProperty("--app-offset-top");
      document.documentElement.style.removeProperty("--keyboard-gap");
      document.documentElement.style.removeProperty("--chat-composer-inset");
      composerRo?.disconnect();
    };
  }, [enabled]);
}
