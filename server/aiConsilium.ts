import { PutObjectCommand } from "@aws-sdk/client-s3";
import { Agent, Cursor, CursorAgentError, type ModelListItem, type ModelSelection } from "@cursor/sdk";
import type { Conversation, User } from "@shared/schema";
import { buildConversationExport, type ConversationExportResult } from "./chatExport";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import {
  publishConversationMessage,
  publishConversationMessageEdited,
  type ConversationMessageWithAuthor,
} from "./redis";
import { storage } from "./storage";

const PROMPT = [
  "Нужен AI консилиум от эксперта по гомеопатии. Изучи содержимое архива, там есть анкета и переписка, назначения и фолоу апы, а также фотографии. Задача номер 1 — назначить препарат и обосновать выбор исходя из имеющихся данных. Задача номер 2 — если данных для уверенного назначения недостаточно, сформировать список уточняющих вопросов. Делая назначения, опирайся на основные материи медики и лучшие практики. Каждое фото смотри вместе с сообщением, к которому оно относится.",
  "Начни ответ с короткого вывода: препарат или список вопросов. Подробности напиши после него.",
  "Ответь готовым текстом заключения. Файлы создавать не нужно.",
].join("\n\n");

const FAILURE_TEXT = "Не удалось подготовить AI консилиум.";
const ARCHIVE_PREFIX = "ai-consilium";

const running = new Set<string>();

export type AiConsiliumStart =
  | { started: true; message: ConversationMessageWithAuthor }
  | { busy: true };

export async function startAiConsilium(input: {
  conversation: Conversation;
  author: User;
}): Promise<AiConsiliumStart> {
  const conversationId = input.conversation.id;
  if (running.has(conversationId)) return { busy: true };
  running.add(conversationId);
  try {
    const pending = await createPendingConsilium(conversationId, input.author);
    void runAiConsilium(input.conversation, pending.id).finally(() => {
      running.delete(conversationId);
    });
    return { started: true, message: pending };
  } catch (error) {
    running.delete(conversationId);
    throw error;
  }
}

async function runAiConsilium(conversation: Conversation, messageId: string): Promise<void> {
  const startedAt = new Date().toISOString();
  let exported: ConversationExportResult | null = null;
  let prompt: string | null = null;
  let model: ModelSelection | null = null;
  try {
    exported = await buildConversationExport(conversation, {
      excludeMessageTypes: ["ai_consilium"],
    });
    if (exported.missingTranscripts > 0) {
      const text = missingTranscriptText(exported.missingTranscripts);
      await saveArchive({
        messageId,
        conversationId: conversation.id,
        startedAt,
        status: "missing_transcripts",
        missingTranscripts: exported.missingTranscripts,
        exported,
        response: text,
      });
      await fillConsilium(conversation.id, messageId, text);
      return;
    }
    prompt = buildPrompt(exported);
    const answer = await askCursor(prompt, exported);
    model = answer.model;
    const text = answer.text.trim() || FAILURE_TEXT;
    await saveArchive({
      messageId,
      conversationId: conversation.id,
      startedAt,
      status: "finished",
      model,
      runId: answer.runId,
      agentId: answer.agentId,
      prompt,
      exported,
      response: text,
    });
    await fillConsilium(conversation.id, messageId, text);
  } catch (error) {
    console.error("[AiConsilium] failed", { conversationId: conversation.id, messageId, error });
    const message = error instanceof Error ? error.message : "Unknown error";
    await saveArchive({
      messageId,
      conversationId: conversation.id,
      startedAt,
      status: "error",
      model,
      prompt,
      exported,
      error: message,
      response: FAILURE_TEXT,
    });
    try {
      await fillConsilium(conversation.id, messageId, FAILURE_TEXT);
    } catch (postError) {
      console.error("[AiConsilium] failure text was not saved", { conversationId: conversation.id, postError });
    }
  }
}

function missingTranscriptText(count: number): string {
  return count === 1
    ? "1 голосовое или созвон ещё без транскрипта. AI консилиум не подготовлен."
    : `${count} голосовых или созвонов ещё без транскрипта. AI консилиум не подготовлен.`;
}

function buildPrompt(exported: ConversationExportResult): string {
  const photoNote =
    exported.photos.length > 0
      ? `Фотографии приложены отдельными изображениями в таком порядке: ${exported.photos
          .map((photo) => photo.filename)
          .join(", ")}.`
      : "Фотографий в архиве нет.";
  return `${PROMPT}\n\n${photoNote}\n\n${exported.markdown}`;
}

async function askCursor(
  prompt: string,
  exported: ConversationExportResult
): Promise<{ text: string; model: ModelSelection; runId: string; agentId: string }> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) throw new Error("CURSOR_API_KEY is not set");

  const model = await selectOpusHigh(apiKey);
  if (!model) throw new Error("Claude Opus 5.5 High is not available for this key");

  const agent = await Agent.create({
    apiKey,
    model,
    cloud: { repos: [] },
  });
  try {
    const run = await agent.send({
      text: prompt,
      images: exported.photos.map((photo) => ({
        data: photo.bytes.toString("base64"),
        mimeType: photo.mimeType,
      })),
    });
    console.info("[AiConsilium] run started", { runId: run.id, agentId: run.agentId, model: model.id });
    const result = await run.wait();
    if (result.status !== "finished" || !result.result?.trim()) {
      throw new Error(result.error?.message || `run status ${result.status}`);
    }
    return { text: result.result, model, runId: run.id, agentId: run.agentId };
  } catch (error) {
    if (error instanceof CursorAgentError) {
      throw new Error(`Cursor startup failed: ${error.message}`);
    }
    throw error;
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

type ConsiliumArchive = {
  messageId: string;
  conversationId: string;
  startedAt: string;
  status: "finished" | "missing_transcripts" | "error";
  missingTranscripts?: number;
  model?: ModelSelection | null;
  runId?: string;
  agentId?: string;
  prompt?: string | null;
  exported?: ConversationExportResult | null;
  response?: string;
  error?: string;
};

async function saveArchive(archive: ConsiliumArchive): Promise<void> {
  try {
    await archiveConsilium(archive);
  } catch (error) {
    console.error("[AiConsilium] archive was not saved", { messageId: archive.messageId, error });
  }
}

async function archiveConsilium(archive: ConsiliumArchive): Promise<void> {
  const bucket = process.env.YC_BUCKET?.trim();
  if (!bucket) {
    console.error("[AiConsilium] YC_BUCKET is not set, archive skipped", { messageId: archive.messageId });
    return;
  }
  const request = {
    messageId: archive.messageId,
    conversationId: archive.conversationId,
    startedAt: archive.startedAt,
    finishedAt: new Date().toISOString(),
    status: archive.status,
    missingTranscripts: archive.missingTranscripts ?? 0,
    model: archive.model ?? null,
    runId: archive.runId ?? null,
    agentId: archive.agentId ?? null,
    error: archive.error ?? null,
  };
  const files: Array<{ name: string; body: Buffer | string; contentType: string }> = [
    { name: "request.json", body: JSON.stringify(request, null, 2), contentType: "application/json; charset=utf-8" },
  ];
  if (archive.prompt) {
    files.push({ name: "prompt.txt", body: archive.prompt, contentType: "text/plain; charset=utf-8" });
  }
  if (archive.exported?.markdown && !archive.prompt) {
    files.push({ name: "chat.md", body: archive.exported.markdown, contentType: "text/markdown; charset=utf-8" });
  }
  for (const photo of archive.exported?.photos ?? []) {
    if (!photo.filename || photo.filename.includes("..") || photo.filename.startsWith("/")) continue;
    files.push({ name: photo.filename, body: photo.bytes, contentType: photo.mimeType });
  }
  if (archive.response !== undefined) {
    files.push({ name: "response.txt", body: archive.response, contentType: "text/plain; charset=utf-8" });
  }
  await Promise.all(files.map((file) => putArchiveObject(bucket, archive.messageId, file)));
}

async function putArchiveObject(
  bucket: string,
  messageId: string,
  file: { name: string; body: Buffer | string; contentType: string }
): Promise<void> {
  await objectStorageClient.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${ARCHIVE_PREFIX}/${messageId}/${file.name}`,
      Body: file.body,
      ContentType: file.contentType,
    })
  );
}

async function selectOpusHigh(apiKey: string): Promise<ModelSelection | null> {
  const models = await Cursor.models.list({ apiKey });
  const opus = models.filter(isOpus55);
  for (const model of opus) {
    const selection = highSelection(model);
    if (selection) return selection;
  }
  console.error(
    "[AiConsilium] Opus 5.5 High was not in the model list",
    models.map((model) => model.id)
  );
  return null;
}

function isOpus55(model: ModelListItem): boolean {
  const haystack = [model.id, model.displayName, ...(model.aliases ?? [])].join(" ").toLowerCase();
  const opus = haystack.includes("opus");
  const version = haystack.includes("5.5") || haystack.includes("5-5") || haystack.includes("5_5");
  return opus && version;
}

function highSelection(model: ModelListItem): ModelSelection | null {
  const variant = model.variants?.find((item) => isHighLabel(item.displayName));
  if (variant) return { id: model.id, params: variant.params };

  for (const parameter of model.parameters ?? []) {
    if (!/effort|reasoning/i.test(parameter.id)) continue;
    const value = parameter.values.find(
      (item) => item.value.toLowerCase() === "high" || isHighLabel(item.displayName ?? "")
    );
    if (value) return { id: model.id, params: [{ id: parameter.id, value: value.value }] };
  }

  if (
    isHighLabel(model.id) ||
    isHighLabel(model.displayName) ||
    (model.aliases ?? []).some((alias) => isHighLabel(alias))
  ) {
    return { id: model.id };
  }
  return null;
}

function isHighLabel(label: string): boolean {
  return /\bhigh\b/i.test(label) && !/xhigh|extra/i.test(label);
}

async function createPendingConsilium(
  conversationId: string,
  author: User
): Promise<ConversationMessageWithAuthor> {
  const message = await storage.createConversationMessage({
    conversationId,
    authorUserId: author.id,
    messageType: "ai_consilium",
    content: null,
  });
  const payload = consiliumPayload(message, author);
  await publishConversationMessage(conversationId, payload);
  return payload;
}

async function fillConsilium(conversationId: string, messageId: string, content: string): Promise<void> {
  const updated = await storage.setConversationMessageContent(messageId, content);
  if (!updated) return;
  await publishConversationMessageEdited(conversationId, {
    conversationId,
    messageId,
    content,
    messageType: "ai_consilium",
    editedAt: "",
  });
}

function consiliumPayload(
  message: { id: string; conversationId: string; authorUserId: string; messageType: string; content: string | null; imageUrl: string | null; createdAt: Date | null },
  author: User
): ConversationMessageWithAuthor {
  return {
    id: message.id,
    conversationId: message.conversationId,
    authorUserId: message.authorUserId,
    messageType: message.messageType,
    content: message.content,
    imageUrl: message.imageUrl ?? null,
    createdAt: (message.createdAt ?? new Date()).toISOString(),
    editedAt: null,
    deletedAt: null,
    reactions: [],
    commentsCount: 0,
    author: {
      id: author.id,
      email: author.email ?? null,
      firstName: author.firstName ?? null,
      lastName: author.lastName ?? null,
      isAdmin: author.isAdmin ?? null,
    },
  };
}
