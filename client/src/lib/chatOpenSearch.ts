const storageKey = (conversationId: string) => `messenger:open-chat-search:${conversationId}`;

/** Survives React Strict Mode remounts within the same navigation. */
const pendingConversationIds = new Set<string>();

/** Signal ConversationChat to open in-chat search after navigating from profile/settings. */
export function requestChatSearch(conversationId: string): void {
  pendingConversationIds.add(conversationId);
  try {
    sessionStorage.setItem(storageKey(conversationId), "1");
  } catch {
    // ignore quota / private mode
  }
}

export function shouldOpenChatSearch(conversationId: string): boolean {
  if (pendingConversationIds.has(conversationId)) return true;
  try {
    return sessionStorage.getItem(storageKey(conversationId)) === "1";
  } catch {
    return false;
  }
}

/** Clear after search UI is open or when the user closes it. */
export function clearChatSearchRequest(conversationId: string): void {
  pendingConversationIds.delete(conversationId);
  try {
    sessionStorage.removeItem(storageKey(conversationId));
  } catch {
    // ignore
  }
}
