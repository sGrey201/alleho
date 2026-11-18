import { GetObjectCommand } from "@aws-sdk/client-s3";
import JSZip from "jszip";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import { storage } from "./storage";
import {
  callPayloadSchema,
  filePayloadSchema,
  pollPayloadSchema,
  type Conversation,
  type ConversationMessage,
  type User,
} from "@shared/schema";
import {
  questionnaireInstanceDataSchema,
  questionnaireMessageContentSchema,
  questionnaireTemplateMessageContentSchema,
  questionnaireTemplateStructureSchema,
  type QuestionnaireInstanceData,
  type QuestionnaireNode,
  type QuestionnaireTemplateStructure,
} from "@shared/questionnaireTypes";

const TRANSCRIPT_PENDING = "Транскрипт ещё не готов";
const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const MONTHS_NOMINATIVE = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

export type ConversationExportPhoto = {
  filename: string;
  bytes: Buffer;
  mimeType: string;
};

export type ConversationExportOptions = {
  excludeMessageTypes?: readonly string[];
};

export type ConversationExportResult = {
  zip: Buffer;
  missingTranscripts: number;
  filename: string;
  markdown: string;
  photos: ConversationExportPhoto[];
};

function formatExportDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const month = MONTHS_GENITIVE[Number(get("month")) - 1] ?? get("month");
  return `${get("day")} ${month} ${get("year")}, ${get("hour")}:${get("minute")}`;
}

function roleLabel(user: User | undefined, conversation: Conversation): string {
  if (conversation.patientUserId && user?.id === conversation.patientUserId) return "Пациент";
  return "Гомеопат";
}

function callHeading(message: ConversationMessage): string {
  const duration = callPayloadSchema.safeParse(parseJson(message.content));
  return duration.success ? `Созвон, ${formatDuration(duration.data.durationSec)}` : "Созвон";
}

function messageHeader(
  message: ConversationMessage,
  user: User | undefined,
  conversation: Conversation
): string {
  const when = message.createdAt instanceof Date ? formatExportDate(message.createdAt) : "";
  if (message.messageType === "call" && !message.deletedAt) {
    return `${when} — ${callHeading(message)}`;
  }
  if (message.messageType === "voice" && !message.deletedAt) {
    return `${when} — Голосовое сообщение`;
  }
  return `${when} — ${roleLabel(user, conversation)}`;
}

function objectKeyFromAppPath(objectPath: string | null | undefined): string | null {
  if (!objectPath?.startsWith("/objects/")) return null;
  const key = objectPath.slice("/objects/".length);
  if (!key || key.includes("..")) return null;
  return key;
}

function callIdFromRecordingPath(objectPath: string | null | undefined): string | null {
  const key = objectKeyFromAppPath(objectPath);
  if (!key) return null;
  const match = /^call-recordings\/([^/]+)\//.exec(key);
  return match?.[1] ?? null;
}

async function readObjectBytes(key: string): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  const bucket = process.env.YC_BUCKET?.trim();
  if (!bucket) return null;
  try {
    const res = await objectStorageClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    return {
      bytes: await res.Body.transformToByteArray(),
      contentType: res.ContentType ?? null,
    };
  } catch {
    return null;
  }
}

async function readObjectText(key: string): Promise<string | null> {
  const object = await readObjectBytes(key);
  if (!object) return null;
  const text = Buffer.from(object.bytes).toString("utf8").replace(/^\uFEFF/, "").trim();
  return text.length > 0 ? text : null;
}

function firstLine(text: string, max = 180): string {
  const line = text
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) return "";
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

function imageExtension(bytes: Uint8Array, contentType: string | null): string {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/jpeg") return "jpg";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return "jpg";
}

function mimeTypeForExtension(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function parseJson(content: string | null): unknown {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const PROFILE_LABELS: Array<{
  key: keyof QuestionnaireInstanceData["patientProfile"];
  label: string;
}> = [
  { key: "lastName", label: "Фамилия" },
  { key: "firstName", label: "Имя" },
  { key: "birthMonth", label: "Месяц рождения" },
  { key: "birthYear", label: "Год рождения" },
  { key: "gender", label: "Пол" },
  { key: "height", label: "Рост" },
  { key: "weight", label: "Вес" },
  { key: "city", label: "Город" },
];

function profileAnswer(key: (typeof PROFILE_LABELS)[number]["key"], data: QuestionnaireInstanceData): string | null {
  const profile = data.patientProfile;
  if (key === "birthMonth") {
    const month = profile.birthMonth;
    if (month == null) return null;
    return MONTHS_NOMINATIVE[month - 1] ?? String(month);
  }
  if (key === "gender") {
    if (profile.gender === "male") return "Мужской";
    if (profile.gender === "female") return "Женский";
    if (profile.gender === "other") return "Другой";
    return null;
  }
  const value = profile[key];
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function renderFilledNodes(
  nodes: QuestionnaireNode[],
  sections: QuestionnaireInstanceData["sections"],
  depth: number
): string {
  let out = "";
  for (const node of nodes) {
    const entries = (sections[node.id] ?? []).filter((entry) => entry.description.trim());
    const children = node.children?.length ? renderFilledNodes(node.children, sections, depth + 1) : "";
    if (entries.length === 0 && !children.trim()) continue;
    const marks = "#".repeat(Math.min(depth + 2, 6));
    out += `${marks} ${node.title}\n\n`;
    const tagById = new Map((node.tags ?? []).map((tag) => [tag.id, tag.label]));
    for (const entry of entries) {
      const label = tagById.get(entry.tagKey) ?? entry.tagKey;
      out += `Вопрос: ${label}\nОтвет: ${entry.description.trim()}\n\n`;
    }
    out += children;
  }
  return out;
}

function questionnaireBody(
  templateName: string,
  structure: QuestionnaireTemplateStructure | null,
  data: QuestionnaireInstanceData | null
): string {
  if (!structure || !data) {
    return `Анкета «${templateName}»\n\nНет заполненных полей\n\nКонец анкеты...`;
  }
  const parts: string[] = [`Анкета «${templateName}»`, ""];
  let filled = false;
  for (const field of PROFILE_LABELS) {
    const answer = profileAnswer(field.key, data);
    if (!answer) continue;
    filled = true;
    parts.push(`Вопрос: ${field.label}`, `Ответ: ${answer}`, "");
  }
  const sections = renderFilledNodes(structure.root, data.sections, 1);
  if (sections.trim()) {
    filled = true;
    parts.push(sections.trimEnd(), "");
  }
  const notes = data.homeopathNotes?.trim();
  if (notes) {
    filled = true;
    parts.push("Заметки гомеопата", notes, "");
  }
  if (!filled) parts.push("Нет заполненных полей", "");
  parts.push("Конец анкеты...");
  return parts.join("\n").trimEnd();
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "chat").slice(0, 80);
}

export async function buildConversationExport(
  conversation: Conversation,
  options?: ConversationExportOptions
): Promise<ConversationExportResult> {
  const messages = await storage.getAllConversationMessages(conversation.id);
  const userIds = new Set<string>();
  for (const message of messages) {
    userIds.add(message.authorUserId);
    if (message.forwardedFromUserId) userIds.add(message.forwardedFromUserId);
  }
  const users = new Map<string, User>();
  await Promise.all(
    Array.from(userIds).map(async (userId) => {
      const user = await storage.getUser(userId);
      if (user) users.set(userId, user);
    })
  );

  const instances = await storage.getQuestionnaireInstancesByConversation(conversation.id);
  const instanceByMessageId = new Map(
    instances.filter((instance) => instance.messageId).map((instance) => [instance.messageId as string, instance])
  );

  const callMessages = messages.filter((message) => message.messageType === "call" && !message.deletedAt);
  const calls = await storage.getCallsByRecordingMessageIds(callMessages.map((message) => message.id));
  const callIdByMessageId = new Map<string, string>();
  for (const call of calls) {
    if (call.recordingMessageId) callIdByMessageId.set(call.recordingMessageId, call.id);
  }

  const transcripts = new Map<string, string | null>();
  async function transcriptFor(message: ConversationMessage): Promise<string | null> {
    if (transcripts.has(message.id)) return transcripts.get(message.id) ?? null;
    let key: string | null = null;
    if (message.messageType === "voice") {
      key = `voice-messages/${message.id}/transcript.txt`;
    } else if (message.messageType === "call") {
      const callId = callIdByMessageId.get(message.id) ?? callIdFromRecordingPath(message.imageUrl);
      key = callId ? `call-recordings/${callId}/transcript.txt` : null;
    }
    const text = key ? await readObjectText(key) : null;
    transcripts.set(message.id, text);
    return text;
  }

  await Promise.all(
    messages
      .filter((message) => !message.deletedAt && (message.messageType === "voice" || message.messageType === "call"))
      .map((message) => transcriptFor(message))
  );

  const byId = new Map(messages.map((message) => [message.id, message]));
  let missingTranscripts = 0;
  for (const message of messages) {
    if (message.deletedAt) continue;
    if (message.messageType !== "voice" && message.messageType !== "call") continue;
    if (!transcripts.get(message.id)) missingTranscripts += 1;
  }

  function quoteFor(message: ConversationMessage): string {
    if (message.deletedAt) return "Сообщение удалено";
    if (message.messageType === "voice" || message.messageType === "call") {
      const transcript = transcripts.get(message.id);
      return transcript ? firstLine(transcript) || TRANSCRIPT_PENDING : TRANSCRIPT_PENDING;
    }
    if (message.messageType === "questionnaire" || message.messageType === "questionnaire_template") {
      const parsed = questionnaireMessageContentSchema.safeParse(parseJson(message.content));
      const template = questionnaireTemplateMessageContentSchema.safeParse(parseJson(message.content));
      const name = parsed.success
        ? parsed.data.templateName
        : template.success
          ? template.data.templateName
          : "Анкета";
      return `Анкета «${name}»`;
    }
    if (message.messageType === "file") {
      const parsed = filePayloadSchema.safeParse(parseJson(message.content));
      return parsed.success ? `Файл: ${parsed.data.name}` : "Файл";
    }
    if (message.messageType === "ai_consilium") return "AI консилиум";
    if (message.messageType === "video") return "Видео";
    if (message.messageType === "poll") {
      const parsed = pollPayloadSchema.safeParse(parseJson(message.content));
      return parsed.success ? firstLine(parsed.data.question) : "Опрос";
    }
    if (message.messageType === "message" && message.imageUrl && !message.content?.trim()) return "Фото";
    const text = message.content?.trim();
    return text ? firstLine(text) : "Сообщение";
  }

  const zip = new JSZip();
  const blocks: string[] = [];
  const photos: ConversationExportPhoto[] = [];
  const excluded = new Set(options?.excludeMessageTypes ?? []);
  const title = conversation.name?.trim() || "Чат";
  blocks.push(`# ${title}`, "", `Экспорт: ${formatExportDate(new Date())}`, "");

  let photoIndex = 0;
  for (const message of messages) {
    if (excluded.has(message.messageType)) continue;
    const author = users.get(message.authorUserId);
    const header = messageHeader(message, author, conversation);
    const plainText =
      message.messageType === "message" && !message.deletedAt && !message.replyToMessageId
        ? message.content?.trim() ?? ""
        : "";
    if (plainText && !message.imageUrl) {
      blocks.push(`${header}: ${plainText}`);
      continue;
    }

    const lines: string[] = [plainText ? `${header}: ${plainText}` : header, ""];

    if (message.deletedAt) {
      lines.push("Сообщение удалено");
      blocks.push(lines.join("\n").trimEnd());
      continue;
    }

    if (message.replyToMessageId) {
      const target = byId.get(message.replyToMessageId);
      if (!target) {
        lines.push("В ответ на удалённое сообщение:", "> Сообщение удалено", "");
      } else {
        const targetAuthor = users.get(target.authorUserId);
        const targetWhen = target.createdAt instanceof Date ? formatExportDate(target.createdAt) : "";
        lines.push(
          `В ответ на ${roleLabel(targetAuthor, conversation)}${targetWhen ? `, ${targetWhen}` : ""}:`,
          `> ${quoteFor(target)}`,
          ""
        );
      }
    }

    if (!plainText) lines.push(await messageBody(message));
    if (message.messageType === "message" && message.imageUrl && !message.deletedAt) {
      const key = objectKeyFromAppPath(message.imageUrl);
      const object = key ? await readObjectBytes(key) : null;
      if (object) {
        photoIndex += 1;
        const ext = imageExtension(object.bytes, object.contentType);
        const filename = `photos/${String(photoIndex).padStart(3, "0")}.${ext}`;
        const photoBytes = Buffer.from(object.bytes);
        zip.file(filename, photoBytes);
        photos.push({ filename, bytes: photoBytes, mimeType: mimeTypeForExtension(ext) });
        lines.push("", `![Фото](${filename})`);
      } else {
        lines.push("", "Фото недоступно");
      }
    }

    blocks.push(lines.join("\n").trimEnd());
  }

  const markdown = blocks.join("\n\n");
  zip.file("chat.md", markdown);
  const zipBytes = await zip.generateAsync({ type: "nodebuffer" });
  return {
    zip: zipBytes,
    missingTranscripts,
    filename: `${safeFilename(title)}.zip`,
    markdown,
    photos,
  };

  async function messageBody(message: ConversationMessage): Promise<string> {
    if (message.messageType === "voice") {
      const transcript = transcripts.get(message.id);
      const body = transcript ?? TRANSCRIPT_PENDING;
      return `${body}\n\nКонец голосового сообщения...`;
    }
    if (message.messageType === "call") {
      const transcript = transcripts.get(message.id);
      const body = transcript ?? TRANSCRIPT_PENDING;
      return `${body}\n\nКонец созвона...`;
    }
    if (message.messageType === "video") return "Видео";
    if (message.messageType === "file") {
      const parsed = filePayloadSchema.safeParse(parseJson(message.content));
      return parsed.success ? `Файл: ${parsed.data.name}` : "Файл";
    }
    if (message.messageType === "poll") {
      const parsed = pollPayloadSchema.safeParse(parseJson(message.content));
      if (!parsed.success) return "Опрос";
      return [`Опрос: ${parsed.data.question}`, ...parsed.data.options.map((option) => `- ${option}`)].join("\n");
    }
    if (message.messageType === "questionnaire") {
      const parsed = questionnaireMessageContentSchema.safeParse(parseJson(message.content));
      const templateName = parsed.success ? parsed.data.templateName : "Анкета";
      const instance = instanceByMessageId.get(message.id);
      const structure = instance
        ? questionnaireTemplateStructureSchema.safeParse(instance.structureSnapshot)
        : null;
      const data = instance ? questionnaireInstanceDataSchema.safeParse(instance.data) : null;
      return questionnaireBody(
        templateName,
        structure?.success ? structure.data : null,
        data?.success ? data.data : null
      );
    }
    if (message.messageType === "questionnaire_template") {
      const parsed = questionnaireTemplateMessageContentSchema.safeParse(parseJson(message.content));
      const name = parsed.success ? parsed.data.templateName : "Анкета";
      return `Шаблон анкеты «${name}»\n\nКонец анкеты...`;
    }
    const text = message.content?.trim() ?? "";
    if (message.messageType === "ai_consilium") return text ? `AI консилиум\n\n${text}` : "AI консилиум";
    if (message.messageType === "prescription") return text ? `Назначение\n\n${text}` : "Назначение";
    if (message.messageType === "followup") return text ? `Follow Up\n\n${text}` : "Follow Up";
    return text;
  }
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
