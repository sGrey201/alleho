import { GetObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { aiPhotoAnalysisRequests, type Conversation, type ConversationMessage, type User } from "@shared/schema";
import {
  completeRegCloudWithFallback,
  readRegCloudCallMeta,
  type RegCloudTokenUsage,
} from "./aiConsilium";
import { db } from "./db";
import { objectStorageClient } from "./replit_integrations/object_storage/objectStorage";
import {
  publishConversationMessage,
  publishConversationMessageEdited,
  type ConversationMessageWithAuthor,
} from "./redis";
import { storage } from "./storage";

const PHOTO_MODEL = "qwen-3.8-flash-next";
const PHOTO_FALLBACK_MODEL = "deepseek-v4.1-flash";
const FAILURE_TEXT = "Не удалось подготовить анализ фото.";

const PROMPT = `Ты помогаешь гомеопату: описываешь фотографии, присланные пациентом. Твоя задача — точное и нейтральное наблюдение. Ты не ставишь диагнозов и не предлагаешь препаратов: выводы делает врач.

ЧТО ОПИСЫВАТЬ
Только тело человека и его части. Фон, одежду и предметы не описывай. Исключение — то, что закрывает или искажает нужный участок (повязка, пластырь, макияж, лак, украшения): просто отметь, что это мешает оценке.

ПОРЯДОК РАБОТЫ
Объект. Определи, что демонстрирует пациент: человек во весь рост, лицо, глаза, язык, кисть, ногти, стопа, участок кожи и т.д.

Локализация и сторона. Сторону указывай анатомически — со стороны пациента («правая кисть пациента»), а не зрителя. Учитывай, что селфи на фронтальную камеру часто зеркальны. Если сторону нельзя определить надёжно — не указывай.

Признаки. Опиши всё, что видно:
- цвет, оттенки, равномерность;
- форма, размер (относительно ориентиров: «с ноготь мизинца»), границы, рельеф;
- фактура: сухость или влажность, блеск, шелушение, трещины, корки, отёчность;
- высыпания, налёт, выделения: вид, расположение, распределение;
- симметрия и асимметрия, преобладание одной стороны;
- всё необычное, характерное, бросающееся в глаза, не ограничивайся этим списком:

Подсказки для частых объектов:
- Язык: цвет; налёт (цвет, толщина, где — корень, середина, края, кончик, одна половина); отпечатки зубов по краям; трещины, «географический» рисунок; сосочки; влажность; отклонение в сторону.
- Ногти: на каких пальцах; форма; продольные и поперечные борозды; белые пятна; цвет; расслоение, ломкость; лунки; кутикула и околоногтевые валики.
- Лицо: цвет кожи; румянец (одно- или двусторонний); отёчность; круги под глазами; губы (цвет, сухость, трещины в уголках); высыпания; асимметрия. Выражение лица описывай нейтрально, без психологических выводов.
- Глаза: склеры, веки, покраснения, отёки.
- Кожа: тип элементов (пятно, узелок, пузырёк, корка, рубец), их число, распределение, границы.
- Во весь рост: телосложение, осанка, пропорции, видимые особенности.

Не додумывай того, чего на снимке не видно.

ФОРМАТ ОТВЕТА
Лаконично перечисляй списком то, что видишь на демонстрируемом объекте`;

const running = new Set<string>();

const NON_PHOTO_TYPES = new Set(["voice", "video", "file", "call"]);

export async function startPhotoAnalysis(input: {
  conversation: Conversation;
  author: User;
  photoMessageId: string;
}): Promise<{ busy: true } | { invalid: true } | { started: true; message: ConversationMessageWithAuthor }> {
  const photo = await storage.getConversationMessageById(input.photoMessageId);
  if (
    !photo ||
    photo.conversationId !== input.conversation.id ||
    photo.deletedAt ||
    !photo.imageUrl ||
    NON_PHOTO_TYPES.has(photo.messageType)
  ) {
    return { invalid: true };
  }
  if (running.has(photo.id)) return { busy: true };
  const photoAt = photo.createdAt ?? new Date();
  const later = await storage.listConversationMessagesAfter(input.conversation.id, photoAt);
  const pending = later.some(
    (message) =>
      message.messageType === "photo_analysis" &&
      message.replyToMessageId === photo.id &&
      !message.content?.trim()
  );
  if (pending) return { busy: true };

  running.add(photo.id);
  try {
    const createdAt = analysisCreatedAt(photoAt, later, photo.id);
    const message = await storage.createConversationMessageAt(
      {
        conversationId: input.conversation.id,
        authorUserId: input.author.id,
        messageType: "photo_analysis",
        content: null,
        replyToMessageId: photo.id,
      },
      createdAt
    );
    const payload = analysisPayload(message, input.author, photo);
    await publishConversationMessage(input.conversation.id, payload);
    void runPhotoAnalysis({
      conversation: input.conversation,
      author: input.author,
      messageId: message.id,
      photo,
    }).finally(() => {
      running.delete(photo.id);
    });
    return { started: true, message: payload };
  } catch (error) {
    running.delete(photo.id);
    throw error;
  }
}

function analysisCreatedAt(photoAt: Date, later: ConversationMessage[], photoId: string): Date {
  let cursor = photoAt.getTime();
  let boundary: number | null = null;
  for (const message of later) {
    if (!message.createdAt) continue;
    const at = message.createdAt.getTime();
    if (message.messageType === "photo_analysis" && message.replyToMessageId === photoId) {
      cursor = Math.max(cursor, at);
      continue;
    }
    boundary = at;
    break;
  }
  if (boundary == null || boundary - cursor <= 1) return new Date(cursor + 1);
  return new Date(cursor + Math.floor((boundary - cursor) / 2));
}

async function runPhotoAnalysis(input: {
  conversation: Conversation;
  author: User;
  messageId: string;
  photo: ConversationMessage;
}): Promise<void> {
  const logId = await openPhotoAnalysisLog({
    conversationId: input.conversation.id,
    messageId: input.messageId,
    photoMessageId: input.photo.id,
    requestedByUserId: input.author.id,
    patientUserId: input.conversation.patientUserId,
  });
  try {
    const image = await readChatImage(input.photo.imageUrl);
    if (!image) {
      const text = `${FAILURE_TEXT} Фото недоступно.`;
      await fillPhotoAnalysis(input.conversation.id, input.messageId, text);
      await finishPhotoAnalysisLog(logId, { status: "error", error: text, response: text });
      return;
    }
    const prompt = PROMPT;
    const model = process.env.REG_CLOUD_PHOTO_MODEL?.trim() || PHOTO_MODEL;
    const fallback = process.env.REG_CLOUD_PHOTO_FALLBACK_MODEL?.trim() || PHOTO_FALLBACK_MODEL;
    const answer = await completeRegCloudWithFallback({
      model,
      fallbackModel: fallback,
      skipSameRetryOn400: true,
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.bytes.toString("base64")}` } },
      ],
    });
    const text = answer.text.trim() || `${FAILURE_TEXT} Модель вернула пустой ответ.`;
    await fillPhotoAnalysis(input.conversation.id, input.messageId, text);
    await finishPhotoAnalysisLog(logId, {
      status: text.startsWith(FAILURE_TEXT) ? "error" : "finished",
      model: answer.model,
      usage: answer.usage,
      attemptCount: answer.attemptCount,
      finishReason: answer.finishReason,
      runId: answer.runId,
      httpStatus: answer.httpStatus,
      prompt: prompt,
      response: text,
      error: text.startsWith(FAILURE_TEXT) ? text : null,
    });
  } catch (error) {
    console.error("[PhotoAnalysis] failed", { conversationId: input.conversation.id, messageId: input.messageId, error });
    const message = error instanceof Error ? error.message : "Unknown error";
    const text = failureText(message);
    try {
      await fillPhotoAnalysis(input.conversation.id, input.messageId, text);
    } catch (fillError) {
      console.error("[PhotoAnalysis] failure text was not saved", { messageId: input.messageId, fillError });
    }
    const meta = readRegCloudCallMeta(error);
    await finishPhotoAnalysisLog(logId, {
      status: "error",
      model: meta?.model,
      usage: meta?.usage,
      attemptCount: meta?.attemptCount,
      finishReason: meta?.finishReason,
      runId: meta?.runId,
      httpStatus: meta?.httpStatus,
      response: text,
      error: text,
    });
  }
}

async function openPhotoAnalysisLog(input: {
  conversationId: string;
  messageId: string;
  photoMessageId: string;
  requestedByUserId: string;
  patientUserId: string | null;
}): Promise<string | null> {
  try {
    const [row] = await db
      .insert(aiPhotoAnalysisRequests)
      .values({
        conversationId: input.conversationId,
        messageId: input.messageId,
        photoMessageId: input.photoMessageId,
        requestedByUserId: input.requestedByUserId,
        patientUserId: input.patientUserId,
        status: "started",
      })
      .returning({ id: aiPhotoAnalysisRequests.id });
    return row?.id ?? null;
  } catch (error) {
    console.error("[PhotoAnalysis] log was not opened", { messageId: input.messageId, error });
    return null;
  }
}

type PhotoAnalysisLogFinish = {
  status: "finished" | "error";
  model?: string | null;
  usage?: RegCloudTokenUsage | null;
  attemptCount?: number;
  finishReason?: string | null;
  runId?: string | null;
  httpStatus?: number | null;
  prompt?: string | null;
  response?: string | null;
  error?: string | null;
};

async function finishPhotoAnalysisLog(id: string | null, patch: PhotoAnalysisLogFinish): Promise<void> {
  if (!id) return;
  try {
    await db
      .update(aiPhotoAnalysisRequests)
      .set({
        status: patch.status,
        answeredAt: new Date(),
        model: patch.model ?? null,
        providerRequestId: patch.runId ?? null,
        promptTokens: patch.usage?.promptTokens ?? null,
        completionTokens: patch.usage?.completionTokens ?? null,
        totalTokens: patch.usage?.totalTokens ?? null,
        reasoningTokens: patch.usage?.reasoningTokens ?? null,
        cachedPromptTokens: patch.usage?.cachedPromptTokens ?? null,
        ...(patch.attemptCount != null ? { attemptCount: patch.attemptCount } : {}),
        promptChars: patch.prompt?.length ?? null,
        responseChars: patch.response?.length ?? null,
        httpStatus: patch.httpStatus ?? null,
        finishReason: patch.finishReason ?? null,
        error: patch.error ? sanitizePhotoError(patch.error) : null,
      })
      .where(eq(aiPhotoAnalysisRequests.id, id));
  } catch (error) {
    console.error("[PhotoAnalysis] log was not finished", { id, error });
  }
}

function sanitizePhotoError(message: string): string {
  return message
    .replace(/crsr_[a-z0-9]+/gi, "ключ")
    .replace(/sk-[A-Za-z0-9_-]+/g, "ключ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

async function fillPhotoAnalysis(conversationId: string, messageId: string, content: string): Promise<void> {
  const updated = await storage.setConversationMessageContent(messageId, content);
  if (!updated) return;
  await publishConversationMessageEdited(conversationId, {
    conversationId,
    messageId,
    content,
    messageType: "photo_analysis",
    editedAt: "",
  });
}

function analysisPayload(
  message: ConversationMessage,
  author: User,
  photo: ConversationMessage
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
    replyToMessageId: message.replyToMessageId ?? photo.id,
    reactions: [],
    commentsCount: 0,
    author: {
      id: author.id,
      email: author.email ?? null,
      firstName: author.firstName ?? null,
      lastName: author.lastName ?? null,
      isAdmin: author.isAdmin ?? null,
    },
    replyTo: {
      id: photo.id,
      authorUserId: photo.authorUserId,
      content: photo.content,
      imageUrl: photo.imageUrl,
      deletedAt: null,
    },
  };
}

async function readChatImage(
  objectPath: string | null
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!objectPath?.startsWith("/objects/")) return null;
  const key = objectPath.slice("/objects/".length);
  if (!key || key.includes("..")) return null;
  const bucket = process.env.YC_BUCKET?.trim();
  if (!bucket) return null;
  try {
    const res = await objectStorageClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    const bytes = Buffer.from(await res.Body.transformToByteArray());
    return { bytes, mimeType: imageMime(bytes, res.ContentType ?? null) };
  } catch {
    return null;
  }
}

function imageMime(bytes: Buffer, contentType: string | null): string {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mime === "image/png" || mime === "image/webp" || mime === "image/gif" || mime === "image/jpeg") return mime;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
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
    return "image/webp";
  }
  return "image/jpeg";
}

function failureText(message: string): string {
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
