export function messengerProfilePath(userId: string, returnTo?: string): string {
  const base = `/messenger/profile/${userId}`;
  if (!returnTo || !returnTo.startsWith("/messenger")) return base;
  return `${base}?from=${encodeURIComponent(returnTo)}`;
}

export function messengerOwnProfilePath(returnTo?: string): string {
  const base = "/messenger/profile";
  if (!returnTo || !returnTo.startsWith("/messenger")) return base;
  return `${base}?from=${encodeURIComponent(returnTo)}`;
}

export function messengerProfileReturnPath(search: string): string {
  const from = getMessengerProfileFromSearch(search);
  if (from) return from;
  return "/messenger";
}

export function getMessengerProfileFromSearch(search: string): string | undefined {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const from = params.get("from");
  if (from && from.startsWith("/messenger")) return from;
  return undefined;
}
