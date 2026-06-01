const PREVIEW_MAX_LEN = 500;

const LEGACY_TAG_PREFIXES = ["Анкета: ", "Назначение: ", "Follow Up: ", "Опрос: "] as const;

function truncate(text: string): string {
  return text.length > PREVIEW_MAX_LEN ? `${text.slice(0, PREVIEW_MAX_LEN)}…` : text;
}

function templateNameFromQuestionnaireJson(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as {
      templateName?: string;
      instanceId?: string;
      templateId?: string;
    };
    const name = typeof parsed.templateName === "string" ? parsed.templateName.trim() : "";
    if (name && (parsed.instanceId || parsed.templateId)) return name;
  } catch {
    // not JSON
  }
  return null;
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
    if (text) return truncate(text);
    return null;
  }

  if (text?.startsWith("{")) {
    const name = templateNameFromQuestionnaireJson(text);
    if (name) return truncate(name);
  }

  if (text) return truncate(text);
  if (imageUrl) return "Фото";
  return null;
}

/** Fixes legacy rows (raw JSON or old tagged previews). */
export function normalizeMessengerListPreview(preview: string | null | undefined): string | null {
  if (!preview?.trim()) return null;
  let trimmed = preview.trim();
  if (trimmed.startsWith("{")) {
    const name = templateNameFromQuestionnaireJson(trimmed);
    if (name) return name;
  }
  trimmed = stripLegacyTaggedPrefix(trimmed);
  return trimmed || null;
}
