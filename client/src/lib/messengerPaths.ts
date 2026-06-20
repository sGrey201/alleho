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

export function messengerConversationUrl(mode: "group" | "channel", conversationId: string): string {
  const path = `/messenger/${mode}/${conversationId}`;
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export async function shareMessengerConversation(options: {
  mode: "group" | "channel";
  conversationId: string;
  title: string;
}): Promise<"shared" | "copied"> {
  const url = messengerConversationUrl(options.mode, options.conversationId);
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title: options.title,
        text: options.mode === "group" ? "Группа в hovial:" : "Канал в hovial:",
        url,
      });
      return "shared";
    } catch {
      // user cancelled or share failed
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}
