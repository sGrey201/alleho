import { PutObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { aiConsiliumRequests, type Conversation, type User } from "@shared/schema";
import { buildConversationExport, type ConversationExportResult } from "./chatExport";
import { db } from "./db";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import {
  publishConversationMessage,
  publishConversationMessageEdited,
  type ConversationMessageWithAuthor,
} from "./redis";
import { storage } from "./storage";

const PROMPT = `Ты — опытный гомеопат классической школы (Ганеман, Кент, Бённингхаузен, Геринг), глубоко знающий материи медики, репертории и клиническую практику. Гомеопатическое сообщество просит твоё второе мнение по случаю. Назначение делает ведущий гомеопат; от тебя — какие препараты рассматривать и почему, и какие вопросы помогут выйти на симиллимум.

В материалах: анкета, переписка, анализы фото, транскрипции голосовых сообщений и созвонов; могут быть назначения, фолоу-апы, твои прошлые мнения и ответы на твои вопросы. Сначала изучи всё. Снимки сами не приложены: их описание бери из сообщений «Анализ фото». И только потом анализируй. Твоё прошлое мнение учитывай, но не держись за него: если вывод изменился, прямо скажи, что изменилось и почему.

АЛГОРИТМ

Шаг 0. Определи тип: первичный приём (назначений не было) или повторный (есть назначение и фолоу-ап) — и какой по счёту консилиум. Далее — сценарий А или Б.

А. ПЕРВИЧНЫЙ ПРИЁМ
А1. Оцени полноту картины. Достаточно, если: есть характерные (странные, редкие, своеобразные) симптомы; ясны психика и общие симптомы с модальностями; ведущие жалобы описаны полно (локализация, ощущение, модальности, сопутствующие); по возможности известна этиология.
А2. Клинических данных нет вовсе (только имя, пол, бессодержательный текст) — не разбирай архив и не объясняй методику: одной фразой скажи, что данных нет, и сразу дай вопросы. Симптомы есть, но их недостаточно — препаратов не предлагай, задай только недостающие вопросы. Форма 1.
А3. Появились ответы — анализируй заново. Пока картины недостаточно — следующие вопросы (Форма 1), уже отвеченные не повторяй.
А4. Картина ясна — 3–5 препаратов с обоснованием и дифдиагностикой. Форма 2.

Б. ПОВТОРНЫЙ ПРИЁМ
Б1. Мягко и коллегиально: сначала — что в случае говорило за назначение (симптомы, рубрики); затем реакция по наблюдениям Кента и закону Геринга (что улучшилось, ухудшилось, не изменилось, новые или вернувшиеся старые симптомы, динамика общего и психического состояния); затем новые данные.
Б2. Данных для решения о тактике не хватает — только вопросы, без рекомендации (Форма 1). Фолоу-ап полный и картина однозначна — сразу Б3 (Форма 2), а в разделе 0 одной фразой объясни, почему уточнять нечего.
Б3. Ответы на вопросы появились — сначала разбери случай заново. Затем мнение: остаться на препарате (ждать / повторить / сменить потенцию) с обоснованием — или картина сменилась, и тогда 3–5 новых препаратов с дифдиагностикой. О смене препарата скажи прямо и корректно, объяснив, что изменилось. Форма 2. Данных всё ещё мало — Форма 1.

МЕТОДИКА
- Строго классическая гомеопатия: Органон; материи медики Hering, Allen, Clarke, Boericke, Kent, Phatak; репертории Kent, Synthesis, Complete, Boenninghausen's Therapeutic Pocket Book, Boger. Без Шанкарана, Шольтена, теории царств и миазматических схем за пределами учения Ганемана.
- Иерархия симптомов: главный вес — характерным (странным, редким, своеобразным), этиологии, психике, общим с модальностями. Местные — только с полной характеристикой.
- Опирайся только на материалы, ничего не додумывай, отделяй факты от своих интерпретаций.
- Не упоминай негомеопатическое лечение. Исключение — признаки состояния, требующего срочной медицинской помощи: одна строка в начале ответа.

ВОПРОСЫ
- Симптомов нет — вопросы собирают основу: главная жалоба, этиология, модальности, общие и психические симптомы. Симптомы есть — никаких анкетных вопросов, только достраивающие неполный симптом или различающие препараты.
- Приоритет тем: этиология, модальности, сопутствующие, ощущения, психика, общие (термика, жажда, желания и отвращения в еде, сон, потливость). Порядок — по убыванию влияния на выбор препарата.
- Открытые, без подсказки ответа, чтобы их можно было задать пациенту дословно.
- Никаких пояснений к вопросам. Каждый вопрос — одна строка, целиком в [[двойных квадратных скобках]], без ** и переносов внутри; следующая строка — сразу следующий вопрос.

ФОРМЫ ОТВЕТА (неприменимый раздел — «нет данных»)
Если клинических данных нет вовсе, разделы 0–3 не пиши: одна фраза, что данных для назначения нет, и сразу вопросы.
Разделы 0–2 общие для обеих форм:
0. Тип консультации и этап: первичный / повторный приём; какой по счёту консилиум.
1. Саммари по иерархии: этиология; психика; общие симптомы и модальности; характерные / странные, редкие, своеобразные; местные с полной характеристикой. При продолжении консилиума — отдельно, что нового дали ответы на вопросы.
2. Только для повторного приёма — оценка реакции: препарат и потенция; что в случае было за назначение; реакция пациента. В Форме 2 добавь мнение о тактике: остаться (ждать / повторить / сменить потенцию) или рассмотреть новый препарат — с обоснованием.

ФОРМА 1 (уточнение): разделы 0–2, затем
3. Оценка полноты: чего не хватает, какие симптомы неполные. Если клинических данных нет — раздел не пиши, хватит фразы перед вопросами.
4. Уточняющие вопросы.

ФОРМА 2 (мнение): разделы 0–2, затем
3. Если мнение изменилось по сравнению с прошлым консилиумом — что именно и почему.
4. Реперторизация: выбранные рубрики с указанием репертория.
5. Препараты: 3–5 по убыванию вероятности. По каждому: почему в списке; что за, что против; какой ключевой симптом его подтвердил бы. Если на повторном приёме мнение — остаться, достаточно обоснования.
6. Контрольные вопросы (если остались), различающие ведущие препараты.

ОФОРМЛЕНИЕ
- Русский язык, профессиональная терминология. Препараты — латинскими сокращениями (Nat-m., Puls.), можно жирным. Рубрики — на английском с переводом.
- Ответ — обычное сообщение в чат. Разрешены только переносы строк, **жирный** и [[вопросы]]. Без решёток, таблиц, курсива, цитат, блоков кода и звёздочек внутри жирного.
- Первые две строки — вывод, целиком жирным. Форма 1: чего не хватает и сколько вопросов ниже. Форма 2: остаться на препарате или какие 3–5 препаратов рассматривать, в порядке вероятности.
- Затем пустая строка и форма. Заголовок раздела — жирным отдельной строкой: **0. Тип консультации**. Пункты — с новой строки через «- », вложенные — с отступом в два пробела. Между разделами — одна пустая строка.`;

const FAILURE_TEXT = "Не удалось подготовить AI консилиум.";
const EMPTY_CASE_TEXT =
  "В чате нет материалов для разбора: нет сообщений, анкеты и фотографий. AI консилиум не подготовлен.";
const ARCHIVE_PREFIX = "ai-consilium";

const running = new Set<string>();

export type AiConsiliumStart =
  | { started: true; message: ConversationMessageWithAuthor }
  | { busy: true };

const MISSING_TRANSCRIPT_MARK = "ещё без транскрипта";

export function isMissingTranscriptConsilium(content: string | null | undefined): boolean {
  return !!content?.includes(MISSING_TRANSCRIPT_MARK);
}

export async function retryAiConsilium(input: {
  conversation: Conversation;
  author: User;
  messageId: string;
}): Promise<AiConsiliumStart | { missing: true }> {
  const conversationId = input.conversation.id;
  if (running.has(conversationId)) return { busy: true };
  const existing = await storage.getConversationMessageById(input.messageId);
  if (
    !existing ||
    existing.conversationId !== conversationId ||
    existing.deletedAt ||
    existing.messageType !== "ai_consilium" ||
    !isMissingTranscriptConsilium(existing.content)
  ) {
    return { missing: true };
  }
  running.add(conversationId);
  try {
    await storage.setConversationMessageContent(input.messageId, "");
    await publishConversationMessageEdited(conversationId, {
      conversationId,
      messageId: input.messageId,
      content: "",
      messageType: "ai_consilium",
      editedAt: "",
    });
    void runAiConsilium(input.conversation, input.messageId, input.author.id).finally(() => {
      running.delete(conversationId);
    });
    return {
      started: true,
      message: consiliumPayload({ ...existing, content: null }, input.author),
    };
  } catch (error) {
    running.delete(conversationId);
    throw error;
  }
}

export async function startAiConsilium(input: {
  conversation: Conversation;
  author: User;
}): Promise<AiConsiliumStart> {
  const conversationId = input.conversation.id;
  if (running.has(conversationId)) return { busy: true };
  running.add(conversationId);
  try {
    const pending = await createPendingConsilium(conversationId, input.author);
    void runAiConsilium(input.conversation, pending.id, input.author.id).finally(() => {
      running.delete(conversationId);
    });
    return { started: true, message: pending };
  } catch (error) {
    running.delete(conversationId);
    throw error;
  }
}

async function runAiConsilium(
  conversation: Conversation,
  messageId: string,
  requestedByUserId: string
): Promise<void> {
  const startedAt = new Date().toISOString();
  const logId = await openConsiliumLog({
    conversationId: conversation.id,
    messageId,
    requestedByUserId,
    patientUserId: conversation.patientUserId,
  });
  let exported: ConversationExportResult | null = null;
  let prompt: string | null = null;
  let model: string | null = null;
  try {
    exported = await buildConversationExport(conversation, { includePhotos: false });
    if (!caseHasMaterial(exported)) {
      await saveArchive({
        messageId,
        conversationId: conversation.id,
        startedAt,
        status: "empty_case",
        exported,
        response: EMPTY_CASE_TEXT,
      });
      await finishConsiliumLog(logId, {
        status: "empty_case",
        exported,
        response: EMPTY_CASE_TEXT,
      });
      await fillConsilium(conversation.id, messageId, EMPTY_CASE_TEXT);
      return;
    }
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
      await finishConsiliumLog(logId, {
        status: "missing_transcripts",
        exported,
        response: text,
        missingTranscripts: exported.missingTranscripts,
      });
      await fillConsilium(conversation.id, messageId, text);
      return;
    }
    prompt = buildPrompt(exported);
    const answer = await askRegCloud(prompt, exported);
    model = answer.model;
    const text = answer.text.trim() || `${FAILURE_TEXT} Модель вернула пустой ответ.`;
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
    await finishConsiliumLog(logId, {
      status: "finished",
      exported,
      prompt,
      response: text,
      model,
      usage: answer.usage,
      providerRequestId: answer.runId,
      photosSent: answer.photosSent,
      attemptCount: answer.attemptCount,
      finishReason: answer.finishReason,
    });
    await fillConsilium(conversation.id, messageId, text);
  } catch (error) {
    console.error("[AiConsilium] failed", { conversationId: conversation.id, messageId, error });
    const message = error instanceof Error ? error.message : "Unknown error";
    const text = consiliumFailureText(message);
    const failed = consiliumFailureMeta(error);
    await saveArchive({
      messageId,
      conversationId: conversation.id,
      startedAt,
      status: "error",
      model: model ?? failed.model,
      prompt,
      exported,
      error: message,
      response: text,
    });
    await finishConsiliumLog(logId, {
      status: "error",
      exported,
      prompt,
      response: text,
      model: model ?? failed.model,
      error: message,
      attemptCount: failed.attemptCount,
      httpStatus: error instanceof RegCloudError ? error.status : null,
    });
    try {
      await fillConsilium(conversation.id, messageId, text);
    } catch (postError) {
      console.error("[AiConsilium] failure text was not saved", { conversationId: conversation.id, postError });
    }
  }
}

function caseHasMaterial(exported: ConversationExportResult): boolean {
  if (exported.photos.length > 0) return true;
  return exported.markdown.includes(" — ");
}

function consiliumFailureText(message: string): string {
  const detail = message
    .replace(/crsr_[a-z0-9]+/gi, "ключ")
    .replace(/sk-[A-Za-z0-9_-]+/g, "ключ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  if (/REG_CLOUD_API_KEY/i.test(message)) {
    return `${FAILURE_TEXT} Техническая ошибка: на сервере не задан ключ доступа к модели.`;
  }
  if (!detail) return FAILURE_TEXT;
  return `${FAILURE_TEXT} Техническая ошибка: ${detail}`;
}

function missingTranscriptText(count: number): string {
  const subject =
    count === 1
      ? "1 голосовое или созвон ещё без транскрипта"
      : `${count} голосовых или созвонов ещё без транскрипта`;
  return `${subject}. AI консилиум не подготовлен.`;
}

function buildPrompt(exported: ConversationExportResult): string {
  const photoNote =
    "Фотографии к запросу не приложены. Описание снимков бери только из сообщений «Анализ фото». Если такого сообщения нет, снимок тебе не виден.";
  return `${PROMPT}\n\nОтветь готовым текстом по форме выше. Файлы создавать не нужно.\n\n${photoNote}\n\nМатериалы случая:\n\n${exported.markdown}`;
}

const REG_CLOUD_URL = "https://ai.reg.cloud/v1/chat/completions";
const REG_CLOUD_MODEL = "qwen-3.8-flash-next";
const REG_CLOUD_FALLBACK_MODEL = "deepseek-v4.1-flash";

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ConsiliumCompletion = {
  text: string;
  model: string;
  runId: string;
  agentId: string;
  usage: TokenUsage | null;
  photosSent: boolean;
  attemptCount: number;
  finishReason: string | null;
};

async function askRegCloud(
  prompt: string,
  exported: ConversationExportResult
): Promise<ConsiliumCompletion> {
  const apiKey = process.env.REG_CLOUD_API_KEY?.trim();
  if (!apiKey) throw new Error("REG_CLOUD_API_KEY is not set");

  const model = process.env.REG_CLOUD_MODEL?.trim() || REG_CLOUD_MODEL;
  const fallback = process.env.REG_CLOUD_FALLBACK_MODEL?.trim() || REG_CLOUD_FALLBACK_MODEL;
  const content = chatContent(prompt, exported);
  const state: AttemptState = { attemptCount: 0, usage: null };

  const runModel = (targetModel: string) => completeModel(apiKey, targetModel, prompt, exported, content, state);

  try {
    return await runModel(model);
  } catch (error) {
    if (!isUnreachableModelError(error)) noteAttemptFailure(error, state, model);
    console.error("[AiConsilium] model was unreachable, retrying once", { model });
    try {
      return await runModel(model);
    } catch (retryError) {
      if (!isUnreachableModelError(retryError) || !fallback || fallback === model) {
        noteAttemptFailure(retryError, state, model);
      }
      console.error("[AiConsilium] retry failed, trying fallback model", { model, fallback });
      try {
        return await runModel(fallback);
      } catch (fallbackError) {
        noteAttemptFailure(fallbackError, state, fallback);
      }
    }
  }
}

type AttemptState = { attemptCount: number; usage: TokenUsage | null };

async function completeModel(
  apiKey: string,
  model: string,
  prompt: string,
  exported: ConversationExportResult,
  content: string | ChatContentPart[],
  state: AttemptState
): Promise<ConsiliumCompletion> {
  try {
    const first = await trackedCompletion(apiKey, model, content, state);
    return { ...first, usage: state.usage, photosSent: exported.photos.length > 0, attemptCount: state.attemptCount };
  } catch (error) {
    if (exported.photos.length === 0 || !(error instanceof RegCloudError) || error.status !== 400) {
      throw error;
    }
    console.error("[AiConsilium] model rejected photos, retrying with text only", { model });
    const second = await trackedCompletion(
      apiKey,
      model,
      `${prompt}\n\nФотографии модель не приняла. Разбирай случай по тексту материалов.`,
      state
    );
    return { ...second, usage: state.usage, photosSent: false, attemptCount: state.attemptCount };
  }
}

async function trackedCompletion(
  apiKey: string,
  model: string,
  content: string | ChatContentPart[],
  state: AttemptState
): Promise<Omit<ConsiliumCompletion, "photosSent" | "attemptCount">> {
  state.attemptCount += 1;
  try {
    const result = await completeRegCloud(apiKey, model, content);
    state.usage = addTokenUsage(state.usage, result.usage);
    return result;
  } catch (error) {
    if (error instanceof RegCloudError) state.usage = addTokenUsage(state.usage, error.usage);
    throw error;
  }
}

function isUnreachableModelError(error: unknown): boolean {
  if (error instanceof RegCloudError) {
    if (/empty completion/i.test(error.message)) return true;
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return true;
}

function noteAttemptFailure(error: unknown, state: AttemptState, model: string): never {
  if (error && typeof error === "object") {
    Object.assign(error, { consiliumAttempts: state.attemptCount, consiliumModel: model });
  }
  throw error;
}

function consiliumFailureMeta(error: unknown): { attemptCount?: number; model?: string } {
  if (!error || typeof error !== "object") return {};
  const meta = error as { consiliumAttempts?: unknown; consiliumModel?: unknown };
  return {
    attemptCount: typeof meta.consiliumAttempts === "number" ? meta.consiliumAttempts : undefined,
    model: typeof meta.consiliumModel === "string" ? meta.consiliumModel : undefined,
  };
}

class RegCloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly usage: TokenUsage | null = null
  ) {
    super(message);
  }
}

type TokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cachedPromptTokens: number | null;
};

function chatContent(prompt: string, exported: ConversationExportResult): string | ChatContentPart[] {
  if (exported.photos.length === 0) return prompt;
  return [
    { type: "text", text: prompt },
    ...exported.photos.map((photo) => ({
      type: "image_url" as const,
      image_url: { url: `data:${photo.mimeType};base64,${photo.bytes.toString("base64")}` },
    })),
  ];
}

async function completeRegCloud(
  apiKey: string,
  model: string,
  content: string | ChatContentPart[]
): Promise<Omit<ConsiliumCompletion, "photosSent" | "attemptCount">> {
  const response = await fetch(REG_CLOUD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      temperature: 0.5,
      presence_penalty: 0,
      top_p: 0.95,
      messages: [{ role: "user", content }],
    }),
  });
  const body = (await response.json().catch(() => null)) as RegCloudResponse | null;
  const usage = readTokenUsage(body?.usage);
  if (!response.ok) {
    throw new RegCloudError(
      body?.error?.message || `Reg.cloud HTTP ${response.status}`,
      response.status,
      usage
    );
  }
  const text = body?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new RegCloudError("Reg.cloud returned an empty completion", response.status, usage);
  return {
    text,
    model,
    runId: body?.id ?? "",
    agentId: "",
    usage,
    finishReason: body?.choices?.[0]?.finish_reason ?? null,
  };
}

export type RegCloudTokenUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cachedPromptTokens: number | null;
};

export type RegCloudFallbackResult = {
  text: string;
  model: string;
  usage: RegCloudTokenUsage | null;
  attemptCount: number;
  finishReason: string | null;
  runId: string | null;
  httpStatus: number | null;
};

export type RegCloudCallMeta = Omit<RegCloudFallbackResult, "text">;

type FallbackTrack = {
  attemptCount: number;
  usage: TokenUsage | null;
  lastModel: string | null;
  finishReason: string | null;
  runId: string | null;
  httpStatus: number | null;
};

function fallbackMeta(track: FallbackTrack, model: string): RegCloudCallMeta {
  return {
    model: track.lastModel ?? model,
    usage: track.usage,
    attemptCount: track.attemptCount,
    finishReason: track.finishReason,
    runId: track.runId,
    httpStatus: track.httpStatus,
  };
}

export function readRegCloudCallMeta(error: unknown): RegCloudCallMeta | null {
  if (!error || typeof error !== "object" || !("regCloudMeta" in error)) return null;
  const meta = (error as { regCloudMeta?: RegCloudCallMeta }).regCloudMeta;
  return meta ?? null;
}

export async function completeRegCloudWithFallback(input: {
  model: string;
  fallbackModel: string;
  content: string | ChatContentPart[];
  skipSameRetryOn400?: boolean;
}): Promise<RegCloudFallbackResult> {
  const apiKey = process.env.REG_CLOUD_API_KEY?.trim();
  if (!apiKey) throw new Error("REG_CLOUD_API_KEY is not set");
  const model = input.model.trim() || REG_CLOUD_MODEL;
  const fallback = input.fallbackModel.trim() || REG_CLOUD_FALLBACK_MODEL;
  const track: FallbackTrack = {
    attemptCount: 0,
    usage: null,
    lastModel: null,
    finishReason: null,
    runId: null,
    httpStatus: null,
  };

  const once = async (target: string) => {
    track.attemptCount += 1;
    track.lastModel = target;
    try {
      const result = await completeRegCloud(apiKey, target, input.content);
      track.usage = addTokenUsage(track.usage, result.usage);
      track.finishReason = result.finishReason;
      track.runId = result.runId || null;
      track.httpStatus = 200;
      return result;
    } catch (error) {
      if (error instanceof RegCloudError) {
        track.usage = addTokenUsage(track.usage, error.usage);
        track.httpStatus = error.status;
      }
      throw error;
    }
  };
  const rejectedImage = (error: unknown) =>
    input.skipSameRetryOn400 === true && error instanceof RegCloudError && error.status === 400;
  const succeed = (result: { text: string; model: string }): RegCloudFallbackResult => ({
    text: result.text,
    ...fallbackMeta(track, result.model),
    model: result.model,
  });

  try {
    try {
      return succeed(await once(model));
    } catch (error) {
      if (rejectedImage(error)) {
        if (!fallback || fallback === model) throw error;
        console.error("[RegCloud] model rejected the image, trying fallback", { model, fallback });
        return succeed(await once(fallback));
      }
      if (!isUnreachableModelError(error)) throw error;
      console.error("[RegCloud] model was unreachable, retrying once", { model });
      try {
        return succeed(await once(model));
      } catch (retryError) {
        if (rejectedImage(retryError)) {
          if (!fallback || fallback === model) throw retryError;
          console.error("[RegCloud] retry rejected the image, trying fallback", { model, fallback });
          return succeed(await once(fallback));
        }
        if (!isUnreachableModelError(retryError) || !fallback || fallback === model) throw retryError;
        console.error("[RegCloud] retry failed, trying fallback model", { model, fallback });
        return succeed(await once(fallback));
      }
    }
  } catch (error) {
    if (error && typeof error === "object") {
      Object.assign(error, { regCloudMeta: fallbackMeta(track, model) });
    }
    throw error;
  }
}

type RegCloudResponse = {
  id?: string;
  error?: { message?: string };
  choices?: Array<{ finish_reason?: string | null; message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    reasoning_tokens?: number;
    cached_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
};

function readTokenUsage(usage: RegCloudResponse["usage"]): TokenUsage | null {
  if (!usage) return null;
  const promptTokens = finiteToken(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = finiteToken(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens =
    finiteToken(usage.total_tokens) ??
    (promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null);
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    reasoningTokens: finiteToken(
      usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens
    ),
    cachedPromptTokens: finiteToken(
      usage.prompt_tokens_details?.cached_tokens ?? usage.cached_tokens
    ),
  };
}

function finiteToken(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

async function openConsiliumLog(input: {
  conversationId: string;
  messageId: string;
  requestedByUserId: string;
  patientUserId: string | null;
}): Promise<string | null> {
  try {
    const [row] = await db
      .insert(aiConsiliumRequests)
      .values({
        conversationId: input.conversationId,
        messageId: input.messageId,
        requestedByUserId: input.requestedByUserId,
        patientUserId: input.patientUserId,
        status: "started",
      })
      .returning({ id: aiConsiliumRequests.id });
    return row?.id ?? null;
  } catch (error) {
    console.error("[AiConsilium] log was not opened", { messageId: input.messageId, error });
    return null;
  }
}

async function finishConsiliumLog(id: string | null, patch: ConsiliumLogFinish): Promise<void> {
  if (!id) return;
  try {
    await db
      .update(aiConsiliumRequests)
      .set({
        status: patch.status,
        answeredAt: new Date(),
        model: patch.model ?? null,
        providerRequestId: patch.providerRequestId ?? null,
        promptTokens: patch.usage?.promptTokens ?? null,
        completionTokens: patch.usage?.completionTokens ?? null,
        totalTokens: patch.usage?.totalTokens ?? null,
        reasoningTokens: patch.usage?.reasoningTokens ?? null,
        cachedPromptTokens: patch.usage?.cachedPromptTokens ?? null,
        photoCount: patch.exported?.photos.length ?? 0,
        photosSent: patch.photosSent ?? false,
        ...(patch.attemptCount != null ? { attemptCount: patch.attemptCount } : {}),
        missingTranscripts: patch.missingTranscripts ?? 0,
        promptChars: patch.prompt?.length ?? null,
        responseChars: patch.response?.length ?? null,
        httpStatus: patch.httpStatus ?? null,
        finishReason: patch.finishReason ?? null,
        error: patch.error ? sanitizeConsiliumError(patch.error) : null,
      })
      .where(eq(aiConsiliumRequests.id, id));
  } catch (error) {
    console.error("[AiConsilium] log was not finished", { id, error });
  }
}

type ConsiliumLogFinish = {
  status: "finished" | "missing_transcripts" | "empty_case" | "error";
  exported?: ConversationExportResult | null;
  prompt?: string | null;
  response?: string;
  model?: string | null;
  usage?: TokenUsage | null;
  providerRequestId?: string | null;
  photosSent?: boolean;
  attemptCount?: number;
  finishReason?: string | null;
  missingTranscripts?: number;
  error?: string | null;
  httpStatus?: number | null;
};

function sanitizeConsiliumError(message: string): string {
  return message
    .replace(/crsr_[a-z0-9]+/gi, "ключ")
    .replace(/sk-[A-Za-z0-9_-]+/g, "ключ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function addTokenUsage(left: TokenUsage | null, right: TokenUsage | null): TokenUsage | null {
  if (!left) return right;
  if (!right) return left;
  const sum = (a: number | null, b: number | null) =>
    a == null && b == null ? null : (a ?? 0) + (b ?? 0);
  return {
    promptTokens: sum(left.promptTokens, right.promptTokens),
    completionTokens: sum(left.completionTokens, right.completionTokens),
    totalTokens: sum(left.totalTokens, right.totalTokens),
    reasoningTokens: sum(left.reasoningTokens, right.reasoningTokens),
    cachedPromptTokens: sum(left.cachedPromptTokens, right.cachedPromptTokens),
  };
}

type ConsiliumArchive = {
  messageId: string;
  conversationId: string;
  startedAt: string;
  status: "finished" | "missing_transcripts" | "empty_case" | "error";
  missingTranscripts?: number;
  model?: string | null;
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
