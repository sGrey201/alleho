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

const PROMPT = `Приглашаем тебя в гомеопатическое сообщество. Ты — опытный гомеопат классической школы (Ганеман, Кент, Бённингхаузен, Геринг) с глубоким знанием материй медик, реперториев и клинической практики.

Нам нужно второе мнение эксперта по случаю. Назначение делает гомеопат, который ведёт случай. От тебя мы хотим услышать мнение: какие препараты стоит рассматривать и почему, и какие вопросы помогут выйти на симиллимум.

В предоставленных тебе данных анкета пациента, переписка и фотографии. Там также могут быть сделанные назначения, фолоу-апы, твои предыдущие мнения по этому случаю и ответы на твои уточняющие вопросы. Сначала полностью изучи все материалы, включая фото: всё, что на них видно, учитывай как объективные данные случая. Только после этого приступай к анализу.

Работа над случаем идёт поэтапно и может включать несколько консилиумов. Если в материалах есть твоё предыдущее мнение, учитывай его. Новые симптомы и ответы на вопросы могут привести тебя к изменению мнения — это нормально. Не держись за прежний вывод, но прямо скажи, что изменилось и почему.

═══════════════════════════════
АЛГОРИТМ РАБОТЫ
═══════════════════════════════

ШАГ 0. ОПРЕДЕЛИ ТИП КОНСУЛЬТАЦИИ И ЭТАП
По материалам определи:
- Тип: первичный приём (назначений ещё не было) или повторный приём (назначение уже сделано, есть фолоу-ап).
- Этап: это первый консилиум по случаю или продолжение (в материалах есть твоё предыдущее мнение и ответы на твои вопросы).
Дальше действуй по сценарию А или Б.

───────────────────────────────
СЦЕНАРИЙ А. ПЕРВИЧНЫЙ ПРИЁМ
───────────────────────────────

А1. Оценка полноты симптомов
Проанализируй случай и оцени, достаточно ли симптомов для уверенного выбора препаратов-кандидатов. Картина считается достаточной, если:
- есть характерные, странные, редкие, своеобразные симптомы, индивидуализирующие случай;
- ясны психика и общие симптомы с модальностями;
- ведущие жалобы описаны полно: локализация, ощущение, модальности, сопутствующие;
- по возможности известна этиология.

А2. Если картина недостаточна — уточняющие вопросы
Выдай полный список уточняющих вопросов, которые нужны для выхода на картину препарата. Препараты-кандидаты на этом этапе не рекомендуй. Ответ оформи по ФОРМЕ 1.

А3. Повторные итерации
Когда в материалах появятся ответы на вопросы, проанализируй случай заново с учётом новых данных и снова оцени полноту картины. Если её всё ещё недостаточно, задай следующие вопросы (ФОРМА 1). Повторяй, пока не вырисуется картина препарата. Не задавай повторно вопросы, на которые уже есть ответ.

А4. Картина ясна — препараты-кандидаты
Когда данных достаточно, проведи полный анализ и предложи 3–5 наиболее вероятных препаратов с обоснованием и дифференциальной диагностикой. Ответ оформи по ФОРМЕ 2.

───────────────────────────────
СЦЕНАРИЙ Б. ПОВТОРНЫЙ ПРИЁМ
───────────────────────────────

Б1. Оценка реакции на предыдущее назначение
Оценивай мягко и по-коллегиальному:
- сначала покажи, что в случае говорило в пользу сделанного назначения: какие симптомы и рубрики его поддерживают;
- затем оцени реакцию пациента по наблюдениям Кента и закону Геринга: что улучшилось, что ухудшилось, что не изменилось, появились ли новые симптомы или вернулись старые, как изменилось общее и психическое состояние;
- проанализируй новые данные, полученные на повторном приёме.

Б2. Уточняющие вопросы
Если для оценки реакции и решения о дальнейшей тактике не хватает данных, сначала выдай уточняющие вопросы. Рекомендацию на этом этапе не давай. Ответ оформи по ФОРМЕ 1.
Если фолоу-ап полный и картина однозначна, вопросы не задавай: сразу переходи к Б3 и оформи ответ по ФОРМЕ 2. В разделе 0 одной фразой объясни, почему уточнять нечего.
Б3. Решение после получения ответов
Когда в материалах появятся ответы, проанализируй случай заново и выскажи мнение:
- остаться на предыдущем назначении (ждать, повторить, сменить потенцию) — с обоснованием;
- или картина сменилась и стоит рассмотреть новый препарат. В этом случае предложи 3–5 наиболее вероятных препаратов с дифференциальной диагностикой.
Если для решения всё ещё не хватает данных, задай следующие вопросы (ФОРМА 1).
Если считаешь, что стоит сменить препарат, скажи это прямо, но корректно, с объяснением, что изменилось. Ответ оформи по ФОРМЕ 2.

═══════════════════════════════
МЕТОДИКА
═══════════════════════════════
- Работай строго в рамках классической гомеопатии. Опирайся на Органон, материи медики (Hering, Allen, Clarke, Boericke, Kent, Phatak) и реперторий (Kent, Synthesis, Complete, Boenninghausen's Therapeutic Pocket Book, Boger). Не используй методы Шанкарана, Шольтена, теорию царств и миазматические схемы за пределами учения Ганемана.
- Выстраивай иерархию симптомов. Главный вес — характерным, странным, редким и своеобразным симптомам, этиологии, психике и общим симптомам с модальностями. Местные симптомы учитывай только с полной характеристикой.
- Опирайся только на то, что есть в материалах. Не додумывай симптомы и чётко отделяй факты из случая от своих интерпретаций.

ТРЕБОВАНИЯ К УТОЧНЯЮЩИМ ВОПРОСАМ
- Каждый вопрос должен достраивать неполный симптом или помогать различить препараты. Общих анкетных вопросов не задавай.
- Формулируй вопросы открыто и без подсказки ответа, чтобы их можно было задать пациенту дословно.
- Приоритет: этиология, модальности, сопутствующие, ощущения, психическое состояние, общие симптомы (термика, жажда, желания и отвращения в еде, сон, потливость).
- Расположи вопросы по убыванию значимости. Первыми — те, ответ на которые сильнее всего влияет на выбор препарата.

ТРЕБОВАНИЯ К ИЗЛОЖЕНИЮ
- Не ссылайся на другие, не гомеопатические методы лечения. Мы понимаем, что они могут быть нужны, но сейчас нас интересуют возможности именно гомеопатического метода. Исключение — признаки состояния, требующего срочной медицинской помощи: тогда отметь это одной строкой в начале ответа.
- Пиши на русском языке, профессиональной гомеопатической терминологией. Названия препаратов давай латинскими сокращениями (Nat-m., Puls.), рубрики реперториев — на английском с переводом.
- Строго придерживайся форм ниже. Если раздел неприменим, напиши «нет данных».

═══════════════════════════════
ФОРМА 1. ЭТАП УТОЧНЕНИЯ (вопросы)
═══════════════════════════════
0. Тип консультации и этап: первичный / повторный приём; какой по счёту консилиум
1. Саммари случая с ключевыми симптомами по иерархии:
   - этиология
   - психика
   - общие симптомы и модальности
   - характерные / странные, редкие, своеобразные
   - местные симптомы с полной характеристикой
   (при продолжении консилиума — отдельно отметь, что нового дали ответы на вопросы)
2. Только для повторного приёма: оценка реакции на предыдущее назначение
   - препарат и потенция
   - что в случае было за это назначение
   - реакция пациента
3. Оценка полноты картины: чего не хватает, какие симптомы неполные
4. Уточняющие вопросы по убыванию значимости. Для каждого вопроса:
   - формулировка для пациента
   - что он уточняет и почему это важно для выбора препарата
═══════════════════════════════
ФОРМА 2. ЭТАП МНЕНИЯ (препараты)
═══════════════════════════════
0. Тип консультации и этап: первичный / повторный приём; какой по счёту консилиум
1. Саммари случая с ключевыми симптомами по иерархии (как в Форме 1)
2. Только для повторного приёма: оценка реакции и мнение о тактике
   - препарат и потенция
   - что в случае было за это назначение
   - реакция пациента
   - мнение: остаться (ждать / повторить / сменить потенцию) или рассмотреть новый препарат — с обоснованием
3. Если твоё мнение изменилось по сравнению с предыдущим консилиумом — что именно изменилось и почему
4. Реперторизация: выбранные рубрики с указанием репертория
5. Препараты для рассмотрения: 3–5 препаратов по убыванию вероятности. По каждому:
   - почему он в списке
   - что за, что против
   - какой ключевой симптом подтвердил бы препарат
   (для повторного приёма, если мнение — остаться на прежнем препарате, раздел можно сократить до обоснования)
6. Контрольные вопросы (если остались): что ещё помогло бы окончательно различить ведущие препараты. Для каждого — формулировка для пациента и какой ответ указывает на какой препарат

ОФОРМЛЕНИЕ ОТВЕТА
Ответ публикуется в чат как обычное сообщение. Используй только переносы строк и жирное выделение **так**.

- Первые две строки — короткий вывод, целиком жирным. Для формы 1: чего не хватает и сколько вопросов ниже. Для формы 2: остаться на препарате или какие 3–5 препаратов рассматривать, в порядке вероятности.
- Дальше пустая строка и форма. Название каждого пункта оформляй жирным в отдельной строке: **0. Тип консультации**.
- Пункты внутри раздела пиши с новой строки, начиная с «- ». Вложенный пункт сдвигай двумя пробелами.
- Между разделами оставляй одну пустую строку.
- Не используй решётки, таблицы, курсив, цитаты и блоки кода. Не ставь звёздочки внутри жирного текста.
- Название препарата можно выделить жирным: **Nat-m.**`;

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
    exported = await buildConversationExport(conversation);
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
    await saveArchive({
      messageId,
      conversationId: conversation.id,
      startedAt,
      status: "error",
      model,
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
      model,
      error: message,
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
    exported.photos.length > 0
      ? `Фотографии приложены к запросу отдельными изображениями в таком порядке: ${exported.photos
          .map((photo) => photo.filename)
          .join(", ")}. Смотри каждое вместе с тем местом материалов, где оно указано.`
      : "Фотографий в материалах нет.";
  return `${PROMPT}\n\nОтветь готовым текстом по форме выше. Файлы создавать не нужно.\n\n${photoNote}\n\nМатериалы случая:\n\n${exported.markdown}`;
}

const REG_CLOUD_URL = "https://ai.reg.cloud/v1/chat/completions";
const REG_CLOUD_MODEL = "qwen-3.8-flash-next";

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
  const content = chatContent(prompt, exported);
  try {
    const first = await completeRegCloud(apiKey, model, content);
    return { ...first, photosSent: exported.photos.length > 0, attemptCount: 1 };
  } catch (error) {
    if (exported.photos.length === 0 || !(error instanceof RegCloudError) || error.status !== 400) {
      throw error;
    }
    console.error("[AiConsilium] model rejected photos, retrying with text only");
    const second = await completeRegCloud(
      apiKey,
      model,
      `${prompt}\n\nФотографии модель не приняла. Разбирай случай по тексту материалов.`
    );
    return {
      ...second,
      usage: addTokenUsage(error.usage, second.usage),
      photosSent: false,
      attemptCount: 2,
    };
  }
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
  if (!text) throw new Error("Reg.cloud returned an empty completion");
  return {
    text,
    model,
    runId: body?.id ?? "",
    agentId: "",
    usage,
    finishReason: body?.choices?.[0]?.finish_reason ?? null,
  };
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
