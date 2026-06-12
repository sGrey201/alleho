import { storage } from "./storage";
import {
  sendPushToUsers,
  type PushPayload,
  formatSenderName,
  messagePreview,
  conversationPath,
} from "./push";

/**
 * Простая очередь push:
 * 1. Новое сообщение → ставим в очередь на 5 с.
 * 2. Пришло «прочитано» (seen) → снимаем с очереди, push не уходит.
 * 3. За 5 с «прочитано» не пришло → отправляем push.
 */
const PUSH_DELAY_MS = Number(process.env.PUSH_DELAY_MS ?? 5000);

const queue = new Map<string, NodeJS.Timeout>();

function dequeueByPrefix(prefix: string): void {
  for (const key of Array.from(queue.keys())) {
    if (!key.startsWith(prefix)) continue;
    const timer = queue.get(key);
    if (timer) clearTimeout(timer);
    queue.delete(key);
  }
}

/** Получатель отметил чат прочитанным — отменить все его отложенные push в этом диалоге. */
export function cancelDeferredPushesForConversation(conversationId: string, userId: string): void {
  dequeueByPrefix(`conv:${conversationId}:user:${userId}:`);
}

function enqueuePush(key: string, send: () => Promise<void>): void {
  const existing = queue.get(key);
  if (existing) clearTimeout(existing);
  queue.set(
    key,
    setTimeout(() => {
      queue.delete(key);
      void send().catch((err) => console.error("[PushQueue] send error:", err));
    }, PUSH_DELAY_MS)
  );
}

type MessageAuthorLike = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

export function scheduleConversationMessagePush(
  conversationId: string,
  recipientUserId: string,
  message: {
    id: string;
    createdAt: string | Date;
    content?: string | null;
    imageUrl?: string | null;
    messageType?: string | null;
    author: MessageAuthorLike;
  },
  conv: { type: string; name?: string | null }
): void {
  const key = `conv:${conversationId}:user:${recipientUserId}:msg:${message.id}`;
  const createdAt = new Date(message.createdAt);
  const sender = formatSenderName(message.author);
  const convLabel =
    conv.type === "patient"
      ? conv.name?.trim() || "Чат с пациентом"
      : conv.type === "direct"
        ? sender
        : conv.name?.trim() || "Новое сообщение";
  const payload: PushPayload = {
    title: conv.type === "direct" ? sender : convLabel,
    body:
      conv.type === "direct" || conv.type === "patient"
        ? messagePreview(message.content, message.imageUrl, message.messageType)
        : `${sender}: ${messagePreview(message.content, message.imageUrl, message.messageType)}`,
    url: conversationPath(conv.type, conversationId),
    tag: `conversation:${conversationId}`,
  };

  enqueuePush(key, async () => {
    if (await storage.isConversationMessageReadByUser(conversationId, recipientUserId, createdAt)) {
      return;
    }
    await sendPushToUsers([recipientUserId], payload);
  });
}
