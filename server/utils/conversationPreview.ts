/** Denormalized list preview for messenger rows (matches health-wall preview rules). */
export function previewFromConversationMessageParts(
  content: string | null | undefined,
  imageUrl: string | null | undefined
): string | null {
  const text = content?.trim();
  if (text) {
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  }
  if (imageUrl) {
    return "Фото";
  }
  return null;
}
