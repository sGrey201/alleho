/** Apply immersive/chat shell classes before React paints (PWA safe-area CSS). */
export function bootstrapPwaShellFromUrl(pathname: string) {
  if (!pathname.startsWith("/messenger")) return;

  document.documentElement.classList.add("app-immersive");

  if (!isMobileChatPath(pathname)) return;
  document.documentElement.classList.add("app-shell-chat");
}

function isMobileChatPath(pathname: string): boolean {
  if (typeof window === "undefined") return false;
  if (!window.matchMedia("(max-width: 767px)").matches) return false;
  if (pathname.includes("/settings")) return false;
  return /\/messenger\/(chat|group|channel|direct)\/[^/]+/.test(pathname);
}
