import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
const HEALTH_WALL_RECENT_PREFIX = "health-wall:recent:";
const HEALTH_WALL_CHANNEL_PREFIX = "health-wall:channel:";
const CONVERSATION_RECENT_PREFIX = "conversation:recent:";
const CONVERSATION_CHANNEL_PREFIX = "conversation:channel:";
const DOCTOR_EVENTS_CHANNEL_PREFIX = "doctor:events:";
const RECENT_LIMIT = 100;

export type MessageAuthor = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isAdmin?: boolean | null;
};

export type MessageReactionSummary = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export type HealthWallMessageWithAuthor = {
  id: string;
  patientUserId: string;
  authorUserId: string;
  messageType: string;
  content?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  pinnedByUserId?: string | null;
  replyToMessageId?: string | null;
  forwardedFromMessageId?: string | null;
  forwardedFromUserId?: string | null;
  replyTo?: {
    id: string;
    authorUserId: string;
    content?: string | null;
    imageUrl?: string | null;
    deletedAt?: string | null;
    author?: MessageAuthor | null;
  } | null;
  forwardedFromAuthor?: MessageAuthor | null;
  reactions?: MessageReactionSummary[];
  author: MessageAuthor;
};

export type HealthWallMessageEditedPayload = {
  patientUserId: string;
  messageId: string;
  content: string | null;
  editedAt: string;
};

export type HealthWallMessageDeletedPayload = {
  patientUserId: string;
  messageId: string;
  deletedAt: string;
};

export type HealthWallMessagePinnedPayload = {
  patientUserId: string;
  messageId: string;
  pinnedAt: string;
  pinnedByUserId: string;
};

export type HealthWallMessageUnpinnedPayload = {
  patientUserId: string;
  messageId: string;
};

let client: Redis | null = null;
let subscriber: Redis | null = null;

function getClient(): Redis | null {
  if (!REDIS_URL) return null;
  if (!client) {
    client = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    client.on("error", (err) => console.error("[Redis] client error:", err));
  }
  return client;
}

export function getRedisSubscriber(): Redis | null {
  if (!REDIS_URL) return null;
  if (!subscriber) {
    subscriber = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    subscriber.on("error", (err) => console.error("[Redis] subscriber error:", err));
  }
  return subscriber;
}

export async function getHealthWallRecentMessages(patientUserId: string): Promise<HealthWallMessageWithAuthor[]> {
  const c = getClient();
  if (!c) return [];
  try {
    const raw = await c.lrange(HEALTH_WALL_RECENT_PREFIX + patientUserId, 0, -1);
    const list = raw.map((s) => {
      try {
        return JSON.parse(s) as HealthWallMessageWithAuthor;
      } catch {
        return null;
      }
    }).filter(Boolean) as HealthWallMessageWithAuthor[];
    return list;
  } catch (err) {
    console.error("[Redis] getHealthWallRecentMessages error:", err);
    return [];
  }
}

export async function pushHealthWallRecentMessage(patientUserId: string, message: HealthWallMessageWithAuthor): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    const key = HEALTH_WALL_RECENT_PREFIX + patientUserId;
    const payload = JSON.stringify(message);
    await c.lpush(key, payload);
    await c.ltrim(key, 0, RECENT_LIMIT - 1);
  } catch (err) {
    console.error("[Redis] pushHealthWallRecentMessage error:", err);
  }
}

export async function publishHealthWallMessage(patientUserId: string, message: HealthWallMessageWithAuthor): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    const channel = HEALTH_WALL_CHANNEL_PREFIX + patientUserId;
    await c.publish(channel, JSON.stringify({ type: "health_wall_message", payload: message }));
  } catch (err) {
    console.error("[Redis] publishHealthWallMessage error:", err);
  }
}

export async function invalidateHealthWallRecent(patientUserId: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.del(HEALTH_WALL_RECENT_PREFIX + patientUserId);
  } catch (err) {
    console.error("[Redis] invalidateHealthWallRecent error:", err);
  }
}

async function publishHealthWallEvent(patientUserId: string, type: string, payload: unknown): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.publish(HEALTH_WALL_CHANNEL_PREFIX + patientUserId, JSON.stringify({ type, payload }));
  } catch (err) {
    console.error(`[Redis] ${type} error:`, err);
  }
}

export async function publishHealthWallMessageEdited(
  patientUserId: string,
  payload: HealthWallMessageEditedPayload
): Promise<void> {
  await publishHealthWallEvent(patientUserId, "health_wall_message_edited", payload);
}

export async function publishHealthWallMessageDeleted(
  patientUserId: string,
  payload: HealthWallMessageDeletedPayload
): Promise<void> {
  await publishHealthWallEvent(patientUserId, "health_wall_message_deleted", payload);
}

export async function publishHealthWallMessagePinned(
  patientUserId: string,
  payload: HealthWallMessagePinnedPayload
): Promise<void> {
  await publishHealthWallEvent(patientUserId, "health_wall_message_pinned", payload);
}

export async function publishHealthWallMessageUnpinned(
  patientUserId: string,
  payload: HealthWallMessageUnpinnedPayload
): Promise<void> {
  await publishHealthWallEvent(patientUserId, "health_wall_message_unpinned", payload);
}

export async function backfillHealthWallRecent(patientUserId: string, messages: HealthWallMessageWithAuthor[]): Promise<void> {
  const c = getClient();
  if (!c || messages.length === 0) return;
  try {
    const key = HEALTH_WALL_RECENT_PREFIX + patientUserId;
    const toPush = messages.slice(-RECENT_LIMIT).map((m) => JSON.stringify(m));
    if (toPush.length === 0) return;
    await c.del(key);
    if (toPush.length > 0) {
      await c.rpush(key, ...toPush);
    }
  } catch (err) {
    console.error("[Redis] backfillHealthWallRecent error:", err);
  }
}

export function isRedisAvailable(): boolean {
  return !!REDIS_URL;
}

export async function publishDoctorChatsUpdated(doctorUserId: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.publish(
      DOCTOR_EVENTS_CHANNEL_PREFIX + doctorUserId,
      JSON.stringify({ type: "doctor_chats_updated", doctorUserId, timestamp: new Date().toISOString() })
    );
  } catch (err) {
    console.error("[Redis] publishDoctorChatsUpdated error:", err);
  }
}

// Conversation messages (for doctor-to-doctor, groups, consiliums, channels)
export type ConversationMessageAuthor = {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isAdmin?: boolean | null;
};

export type ConversationMessageWithAuthor = {
  id: string;
  conversationId: string;
  authorUserId: string;
  messageType: string;
  content?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  pinnedByUserId?: string | null;
  replyToMessageId?: string | null;
  forwardedFromMessageId?: string | null;
  forwardedFromUserId?: string | null;
  replyTo?: {
    id: string;
    authorUserId: string;
    content?: string | null;
    imageUrl?: string | null;
    deletedAt?: string | null;
    author?: ConversationMessageAuthor | null;
  } | null;
  forwardedFromAuthor?: ConversationMessageAuthor | null;
  reactions?: MessageReactionSummary[];
  author: ConversationMessageAuthor;
};

export type ConversationSeenPayload = {
  conversationId: string;
  userId: string;
  lastSeenAt: string;
};

export type ConversationMessageEditedPayload = {
  conversationId: string;
  messageId: string;
  content: string | null;
  editedAt: string;
};

export type ConversationMessageDeletedPayload = {
  conversationId: string;
  messageId: string;
  deletedAt: string;
};

export type ConversationMessagePinnedPayload = {
  conversationId: string;
  messageId: string;
  pinnedAt: string;
  pinnedByUserId: string;
};

export type ConversationMessageUnpinnedPayload = {
  conversationId: string;
  messageId: string;
};

export async function getConversationRecentMessages(conversationId: string): Promise<ConversationMessageWithAuthor[]> {
  const c = getClient();
  if (!c) return [];
  try {
    const raw = await c.lrange(CONVERSATION_RECENT_PREFIX + conversationId, 0, -1);
    return raw
      .map((s) => {
        try {
          return JSON.parse(s) as ConversationMessageWithAuthor;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as ConversationMessageWithAuthor[];
  } catch (err) {
    console.error("[Redis] getConversationRecentMessages error:", err);
    return [];
  }
}

export async function pushConversationRecentMessage(
  conversationId: string,
  message: ConversationMessageWithAuthor
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    const key = CONVERSATION_RECENT_PREFIX + conversationId;
    await c.lpush(key, JSON.stringify(message));
    await c.ltrim(key, 0, RECENT_LIMIT - 1);
  } catch (err) {
    console.error("[Redis] pushConversationRecentMessage error:", err);
  }
}

export async function publishConversationMessage(
  conversationId: string,
  message: ConversationMessageWithAuthor
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.publish(
      CONVERSATION_CHANNEL_PREFIX + conversationId,
      JSON.stringify({ type: "conversation_message", payload: message })
    );
  } catch (err) {
    console.error("[Redis] publishConversationMessage error:", err);
  }
}

export async function publishConversationSeen(
  conversationId: string,
  payload: ConversationSeenPayload
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.publish(
      CONVERSATION_CHANNEL_PREFIX + conversationId,
      JSON.stringify({ type: "conversation_seen", payload })
    );
  } catch (err) {
    console.error("[Redis] publishConversationSeen error:", err);
  }
}

export async function backfillConversationRecent(
  conversationId: string,
  messages: ConversationMessageWithAuthor[]
): Promise<void> {
  const c = getClient();
  if (!c || messages.length === 0) return;
  try {
    const key = CONVERSATION_RECENT_PREFIX + conversationId;
    const toPush = messages.slice(-RECENT_LIMIT).map((m) => JSON.stringify(m));
    await c.del(key);
    if (toPush.length > 0) await c.rpush(key, ...toPush);
  } catch (err) {
    console.error("[Redis] backfillConversationRecent error:", err);
  }
}

export async function invalidateConversationRecent(conversationId: string): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.del(CONVERSATION_RECENT_PREFIX + conversationId);
  } catch (err) {
    console.error("[Redis] invalidateConversationRecent error:", err);
  }
}

export async function publishConversationMessageEdited(
  conversationId: string,
  payload: ConversationMessageEditedPayload
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.publish(
      CONVERSATION_CHANNEL_PREFIX + conversationId,
      JSON.stringify({ type: "conversation_message_edited", payload })
    );
  } catch (err) {
    console.error("[Redis] publishConversationMessageEdited error:", err);
  }
}

export async function publishConversationMessageDeleted(
  conversationId: string,
  payload: ConversationMessageDeletedPayload
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.publish(
      CONVERSATION_CHANNEL_PREFIX + conversationId,
      JSON.stringify({ type: "conversation_message_deleted", payload })
    );
  } catch (err) {
    console.error("[Redis] publishConversationMessageDeleted error:", err);
  }
}

export async function publishConversationMessagePinned(
  conversationId: string,
  payload: ConversationMessagePinnedPayload
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.publish(
      CONVERSATION_CHANNEL_PREFIX + conversationId,
      JSON.stringify({ type: "conversation_message_pinned", payload })
    );
  } catch (err) {
    console.error("[Redis] publishConversationMessagePinned error:", err);
  }
}

export async function publishConversationMessageUnpinned(
  conversationId: string,
  payload: ConversationMessageUnpinnedPayload
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.publish(
      CONVERSATION_CHANNEL_PREFIX + conversationId,
      JSON.stringify({ type: "conversation_message_unpinned", payload })
    );
  } catch (err) {
    console.error("[Redis] publishConversationMessageUnpinned error:", err);
  }
}
