import { useEffect } from "react";

/** Matches `.chat-panel-bg` `--chat-base` (light mode). */
export const CHAT_SHELL_BACKGROUND = "#a8c492";
export const CHAT_SHELL_THEME_COLOR = "#a8c492";
export const DEFAULT_SHELL_THEME_COLOR = "#fcfcfc";
/** Matches `index.html` / manifest brand color for non-immersive pages. */
export const BRAND_THEME_COLOR = "#6B7042";

const SHELL_BG_VAR = "--app-shell-background";
const SHELL_THEME_META = 'meta[name="theme-color"]';
const APPLE_STATUS_BAR_META = 'meta[name="apple-mobile-web-app-status-bar-style"]';

export function setThemeColorMeta(color: string) {
  let meta = document.querySelector(SHELL_THEME_META) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = color;
}

/** `black-translucent` lets chat wallpaper show under the iOS status bar (not a white bar). */
export function setAppleStatusBarStyle(style: "default" | "black-translucent") {
  let meta = document.querySelector(APPLE_STATUS_BAR_META) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "apple-mobile-web-app-status-bar-style";
    document.head.appendChild(meta);
  }
  meta.content = style;
}

export type AppShellThemeVariant = "default" | "chat";

/**
 * Sets immersive shell background (body / .app-viewport) and theme-color for PWA safe areas.
 * Pass `null` to clear overrides when leaving immersive routes.
 */
export function useAppShellTheme(variant: AppShellThemeVariant | null) {
  useEffect(() => {
    if (variant === null) {
      document.documentElement.style.removeProperty(SHELL_BG_VAR);
      document.documentElement.classList.remove("app-shell-chat");
      setThemeColorMeta(DEFAULT_SHELL_THEME_COLOR);
      setAppleStatusBarStyle("default");
      return;
    }

    if (variant === "chat") {
      document.documentElement.style.removeProperty(SHELL_BG_VAR);
      document.documentElement.classList.add("app-shell-chat");
      setThemeColorMeta(CHAT_SHELL_THEME_COLOR);
      setAppleStatusBarStyle("black-translucent");
    } else {
      document.documentElement.style.removeProperty(SHELL_BG_VAR);
      document.documentElement.classList.remove("app-shell-chat");
      setThemeColorMeta(DEFAULT_SHELL_THEME_COLOR);
      setAppleStatusBarStyle("default");
    }

    return () => {
      document.documentElement.style.removeProperty(SHELL_BG_VAR);
      document.documentElement.classList.remove("app-shell-chat");
      setThemeColorMeta(DEFAULT_SHELL_THEME_COLOR);
      setAppleStatusBarStyle("default");
    };
  }, [variant]);
}

/** Classic layout (landing, auth): restore brand chrome and clear shell overrides. */
export function resetAppShellThemeForClassicLayout() {
  document.documentElement.style.removeProperty(SHELL_BG_VAR);
  document.documentElement.classList.remove("app-shell-chat");
  setThemeColorMeta(BRAND_THEME_COLOR);
  setAppleStatusBarStyle("default");
}
