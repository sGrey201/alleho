/** Paths allowed for unauthenticated messenger guests. */
export function isGuestMessengerPath(path: string): boolean {
  if (path === "/messenger") return true;
  if (/^\/messenger\/channel\/[^/]+$/.test(path)) return true;
  return false;
}

export function isGuestForbiddenMessengerPath(path: string): boolean {
  return path.startsWith("/messenger") && !isGuestMessengerPath(path);
}
