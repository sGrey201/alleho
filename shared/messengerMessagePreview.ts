import { stripMessageFormatting, stripSponsorSections } from "./messageFormatting";

const PREVIEW_MAX_LEN = 500;

const LEGACY_TAG_PREFIXES = ["Анкета: ", "Назначение: ", "Follow Up: ", "Опрос: "] as const;

function truncate(text: string): string {
  return text.length > PREVIEW_MAX_LEN ? `${text.slice(0, PREVIEW_MAX_LEN)}…` : text;
}

const QUESTIONNAIRE_JSON_MARKER_RE = /"(?:templateId|instanceId)"\s*:/;
const TEMPLATE_NAME_JSON_RE = /"templateName"\s*:\s*"((?:\\.|[^"\\])*)"/;

function unescapeJsonStringFragment(value: string): string {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function templateNameFromQuestionnaireJson(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") || !QUESTIONNAIRE_JSON_MARKER_RE.test(trimmed)) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      templateName?: string;
      instanceId?: string;
      templateId?: string;
    };
    const name = typeof parsed.templateName === "string" ? parsed.templateName.trim() : "";
    if (name && (parsed.instanceId || parsed.templateId)) return name;
  } catch {
    // truncated or invalid JSON — fall back to regex (legacy LEFT(content, 500) previews)
  }

  const match = trimmed.match(TEMPLATE_NAME_JSON_RE);
  if (!match) return null;
  const name = unescapeJsonStringFragment(match[1]).trim();
  return name || null;
}

function looksLikeQuestionnaireJson(content: string): boolean {
  return content.trim().startsWith("{") && QUESTIONNAIRE_JSON_MARKER_RE.test(content);
}

function stripLegacyTaggedPrefix(text: string): string {
  for (const prefix of LEGACY_TAG_PREFIXES) {
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length).trim();
    }
  }
  return text;
}

/** Denormalized list preview when storing or displaying conversation last messages. */
export function formatConversationMessagePreview(
  content: string | null | undefined,
  imageUrl: string | null | undefined,
  messageType?: string | null
): string | null {
  const text = content?.trim();

  if (messageType === "voice") {
    return "Голосовое сообщение";
  }

  if (messageType === "poll" && text) {
    try {
      const parsed = JSON.parse(text) as { question?: string };
      const q = typeof parsed.question === "string" ? parsed.question.trim() : "";
      if (q) return truncate(`Опрос: ${q}`);
    } catch {
      return "Опрос";
    }
    return "Опрос";
  }

  if (messageType === "questionnaire" || messageType === "questionnaire_template") {
    const name = text ? templateNameFromQuestionnaireJson(text) : null;
    return truncate(name ?? "Анкета");
  }

  if (messageType === "prescription" || messageType === "followup") {
    if (text) return truncate(stripMessageFormatting(text));
    return null;
  }

  if (looksLikeQuestionnaireJson(text ?? "")) {
    const name = templateNameFromQuestionnaireJson(text!);
    return truncate(name ?? "Анкета");
  }

  if (text) return truncate(stripSponsorSections(stripMessageFormatting(text)));
  if (imageUrl) return "Фото";
  return null;
}

/** Fixes legacy rows (raw JSON or old tagged previews). */
export function normalizeMessengerListPreview(preview: string | null | undefined): string | null {
  if (!preview?.trim()) return null;
  let trimmed = preview.trim();
  if (looksLikeQuestionnaireJson(trimmed)) {
    const name = templateNameFromQuestionnaireJson(trimmed);
    return name ?? "Анкета";
  }
  trimmed = stripLegacyTaggedPrefix(trimmed);
  return trimmed || null;
}
