import { videoPayloadSchema, type VideoPayload } from "./schema";

export function parseVideoMessagePayload(
  content: string | null | undefined,
): VideoPayload | null {
  if (!content?.trim()) return null;
  try {
    return videoPayloadSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}
