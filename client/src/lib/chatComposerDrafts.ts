/** In-memory composer drafts keyed by conversation id (survives chat switches). */
const drafts = new Map<string, string>();

export function getChatComposerDraft(conversationId: string): string {
  return drafts.get(conversationId) ?? "";
}

export function setChatComposerDraft(conversationId: string, text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    drafts.delete(conversationId);
    return;
  }
  drafts.set(conversationId, text);
}

export function clearChatComposerDraft(conversationId: string): void {
  drafts.delete(conversationId);
}
