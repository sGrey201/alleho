import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { Conversation, ConversationMessage, User } from "@shared/schema";
import { questionnaireInstanceDataSchema, type PatientProfileBlock } from "@shared/questionnaireTypes";
import { completeRegCloudWithFallback } from "./aiConsilium";
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

const PROMPT = `Ты помогаешь специалисту документировать внешний осмотр пациента по фотографиям.
Твоя задача — точное, нейтральное описание того, что видно на снимках.

КОНТЕКСТ (без персональных данных):
- Возраст: {age}, пол: {gender}

ПРАВИЛА:
1. Сначала пойми, что на снимке. Описывай только это. Не ставь диагнозов, не предлагай лечение и препараты.
2. Если на снимке нет человека, частей тела или пациента, весь ответ — ровно одна строка и ничего больше: **Людей, частей тела или пациента на фотографии нет.** Не описывай пейзаж, предметы, здания и не заполняй схему.
3. Если человек или часть тела есть, пиши только про видимые области. Пункты схемы, которых нет в кадре, пропускай целиком: не пиши, что их нет, и не ставь «неразличимо».
4. У видимого признака укажи уверенность: «чётко видно» / «вероятно». Если деталь внутри видимой области не читается, напиши «неразличимо на снимке» только про неё.
5. Если качество снимка мешает оценке (освещение, фильтр, размытость, ракурс), скажи об этом прямо, а не додумывай.
6. Указывай часть и сторону тела (справа / слева) и локализацию максимально точно.
7. Используй точные описательные термины (цвет, форма, размер, граница, поверхность), а не оценки вроде «нормально» или «плохо».

СХЕМА — только для областей, которые есть в кадре:

0. Качество снимков — освещение, резкость, цветопередача, что мешает оценке.

1. Общее впечатление и конституция — телосложение, упитанность, осанка, соответствие видимого возраста указанному.

2. Лицо и выражение — мимика, выражение глаз, цвет лица, румянец (где, с какой стороны), асимметрия, отёчность, морщины, признаки усталости.

3. Кожа — цвет, оттенок, влажность или сухость, блеск, шелушение, высыпания (тип, цвет, размер, расположение, группировка), пигментация, сосудистые звёздочки, бородавки, рубцы, трещины.

4. Волосы и кожа головы — густота, блеск, сухость, перхоть, выпадение, ранняя седина.

5. Глаза — склеры (цвет, сосуды), веки (отёк, краснота, ячмени), тёмные круги, слезотечение.

6. Губы и рот — цвет, сухость, трещины, заеды в углах рта, герпес, состояние дёсен (если видны).

7. Язык (если есть снимок) — цвет, налёт (цвет, толщина, где расположен), влажность, трещины, отпечатки зубов, «географический» рисунок, кончик и края, дрожание или отклонение (если видно).

8. Ногти — цвет, форма, бороздки (продольные / поперечные), пятна, ломкость, расслоение, состояние кутикулы, обкусанные ногти.

9. Кисти и стопы — цвет, потливость (если заметна), отёки, трещины, мозоли, деформации суставов.

10. Внешний вид и самоподача — одежда (тёплая / лёгкая по сезону, аккуратность), украшения, особенности, которые бросаются в глаза.

11. Латеральность — какие признаки выражены преимущественно с одной стороны тела.

12. Необычные и характерные детали — всё, что выглядит странным, редким или необычно выраженным для этого возраста и контекста. Перечисли отдельным списком.

13. ⚠️ Признаки, требующие осмотра врача — отметь любое из следующего, если видно: желтушность кожи или склер; родинки или образования с неровными краями, неоднородным цветом, кровоточивостью или изъязвлением; синюшность губ или ногтей; выраженная бледность; быстро распространяющаяся краснота или отёк; незаживающие язвы; асимметрия лица, похожая на неврологическую; признаки обезвоживания. Если ничего такого нет, напиши «не выявлено».

ФОРМАТ ОТВЕТА:
Если человека на снимке нет — только строка из правила 2.
Если есть — сначала одна строка, что именно в кадре. Затем только подходящие пункты схемы: признак — локализация — уверенность. В конце — резюме из 3–5 наблюдений по видимому, без перечисления отсутствующих областей. Пункт 13 пиши только когда в кадре есть человек: если тревожных признаков не видно, одна строка «не выявлено».`;

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
      conversationId: input.conversation.id,
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
  conversationId: string;
  messageId: string;
  photo: ConversationMessage;
}): Promise<void> {
  try {
    const image = await readChatImage(input.photo.imageUrl);
    if (!image) {
      await fillPhotoAnalysis(input.conversationId, input.messageId, `${FAILURE_TEXT} Фото недоступно.`);
      return;
    }
    const context = await patientContext(input.conversationId);
    const prompt = PROMPT.replace("{age}", context.age).replace("{gender}", context.gender);
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
    await fillPhotoAnalysis(input.conversationId, input.messageId, text);
  } catch (error) {
    console.error("[PhotoAnalysis] failed", { conversationId: input.conversationId, messageId: input.messageId, error });
    const message = error instanceof Error ? error.message : "Unknown error";
    await fillPhotoAnalysis(input.conversationId, input.messageId, failureText(message));
  }
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

async function patientContext(conversationId: string): Promise<{ age: string; gender: string }> {
  const instances = await storage.getQuestionnaireInstancesByConversation(conversationId);
  const latest = [...instances].sort((left, right) => stamp(right) - stamp(left))[0];
  const parsed = latest ? questionnaireInstanceDataSchema.safeParse(latest.data) : null;
  return describePatient(parsed?.success ? parsed.data.patientProfile : null);
}

function stamp(instance: { updatedAt: Date | null; createdAt: Date | null }): number {
  return (instance.updatedAt ?? instance.createdAt)?.getTime() ?? 0;
}

function describePatient(profile: PatientProfileBlock | null): { age: string; gender: string } {
  const gender =
    profile?.gender === "male"
      ? "мужской"
      : profile?.gender === "female"
        ? "женский"
        : profile?.gender === "other"
          ? "другой"
          : "не указан";
  const year = profile?.birthYear;
  if (year == null) return { age: "не указан", gender };
  const now = new Date();
  let age = now.getFullYear() - year;
  const month = profile?.birthMonth;
  if (month != null && month > now.getMonth() + 1) age -= 1;
  if (age < 0) age = 0;
  return { age: String(age), gender };
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
