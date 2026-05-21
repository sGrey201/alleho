/** Denormalized list preview for messenger rows (matches health-wall preview rules). */
export function previewFromConversationMessageParts(
  content: string | null | undefined,
  imageUrl: string | null | undefined,
  messageType?: string | null
): string | null {
  if (messageType === "poll" && content?.trim()) {
    try {
      const parsed = JSON.parse(content) as { question?: string };
      const q = typeof parsed.question === "string" ? parsed.question.trim() : "";
      if (q) {
        const labeled = `Опрос: ${q}`;
        return labeled.length > 500 ? `${labeled.slice(0, 500)}…` : labeled;
      }
    } catch {
      return "Опрос";
    }
    return "Опрос";
  }
  const text = content?.trim();
  if (text) {
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  }
  if (imageUrl) {
    return "Фото";
  }
  return null;
}
