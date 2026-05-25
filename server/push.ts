import webpush from "web-push";
import { storage } from "./storage";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "https://hovial.com";

let vapidConfigured = false;

function ensureVapid(): boolean {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  }
  return true;
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY ?? null;
}

export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

/** User IDs that received at least one successful push for this payload. */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<string[]> {
  if (!ensureVapid() || userIds.length === 0) return [];

  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const subscriptions = await storage.getPushSubscriptionsByUserIds(uniqueIds);
  if (subscriptions.length === 0) return [];

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  });

  const deliveredUserIds = new Set<string>();

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
        deliveredUserIds.add(sub.userId);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await storage.deletePushSubscriptionByEndpoint(sub.endpoint);
        } else {
          console.error("[Push] send error:", err);
        }
      }
    })
  );

  return Array.from(deliveredUserIds);
}

export function formatSenderName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  return user.email?.split("@")[0] ?? "Сообщение";
}

export function messagePreview(content?: string | null, imageUrl?: string | null): string {
  if (imageUrl && !content?.trim()) return "Фото";
  const text = (content ?? "").trim();
  if (!text) return "Новое сообщение";
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export function conversationPath(type: string, conversationId: string): string {
  const t = type === "group" || type === "channel" || type === "direct" ? type : "direct";
  return `/messenger/${t}/${conversationId}`;
}

type MessageAuthorLike = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

export async function notifyHealthWallNewMessage(
  patientUserId: string,
  authorUserId: string,
  message: {
    id: string;
    content?: string | null;
    imageUrl?: string | null;
    author: MessageAuthorLike;
  }
): Promise<void> {
  const recipientIds: string[] = [];
  if (authorUserId === patientUserId) {
    const doctors = await storage.getHealthWallDoctors(patientUserId);
    recipientIds.push(...doctors.map((d) => d.user.id));
  } else {
    recipientIds.push(patientUserId);
  }
  const targets = recipientIds.filter((id) => id !== authorUserId);
  if (targets.length === 0) return;

  const sender = formatSenderName(message.author);
  await sendPushToUsers(targets, {
    title: sender,
    body: messagePreview(message.content, message.imageUrl),
    url: authorUserId === patientUserId ? `/health-wall/${patientUserId}` : "/health-wall",
    tag: `health-wall:${patientUserId}`,
  });
}

export async function notifyConversationNewMessage(
  conversationId: string,
  authorUserId: string,
  message: {
    id: string;
    content?: string | null;
    imageUrl?: string | null;
    author: MessageAuthorLike;
  }
): Promise<void> {
  const conv = await storage.getConversation(conversationId);
  if (!conv) return;

  const participants = await storage.getConversationParticipants(conversationId);
  const targets = participants.map((p) => p.userId).filter((id) => id !== authorUserId);
  if (targets.length === 0) return;

  const sender = formatSenderName(message.author);
  const convLabel =
    conv.type === "direct"
      ? sender
      : conv.name?.trim() || "Новое сообщение";

  await sendPushToUsers(targets, {
    title: conv.type === "direct" ? sender : convLabel,
    body:
      conv.type === "direct"
        ? messagePreview(message.content, message.imageUrl)
        : `${sender}: ${messagePreview(message.content, message.imageUrl)}`,
    url: conversationPath(conv.type, conversationId),
    tag: `conversation:${conversationId}`,
  });
}
