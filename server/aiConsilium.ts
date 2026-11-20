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
    exported = await buildConversationExport(conversation);
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
      ? `Фотографии приложены к запросу отдельными изображениями в таком порядке: ${exported.photos
          .map((photo) => photo.filename)
          .join(", ")}. Смотри каждое вместе с тем местом материалов, где оно указано.`
      : "Фотографий в материалах нет.";
  return `${PROMPT}\n\nОтветь готовым текстом по форме выше. Файлы создавать не нужно.\n\n${photoNote}\n\nМатериалы случая:\n\n${exported.markdown}`;
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
