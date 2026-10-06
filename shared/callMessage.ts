import { callPayloadSchema, type CallPayload } from "./schema";

export function parseCallMessagePayload(content: string | null | undefined): CallPayload | null {
  if (!content?.trim()) return null;
  try {
    return callPayloadSchema.parse(JSON.parse(content));
  } catch {
    return null;
  }
}

/** Compact Russian duration for a finished call: "12 мин", "1 мин 5 с", "40 с". */
export function formatCallDuration(durationSec: number): string {
  const total = Math.max(0, Math.floor(durationSec));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes} мин ${seconds} с` : `${minutes} мин`;
  }
  return `${seconds} с`;
}

export function callMessagePreview(content: string | null | undefined): string {
  const parsed = parseCallMessagePayload(content);
  if (!parsed) return "Звонок";
  return `Звонок · ${formatCallDuration(parsed.durationSec)}`;
}
