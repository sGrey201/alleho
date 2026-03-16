import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
const HEALTH_WALL_RECENT_PREFIX = "health-wall:recent:";
const HEALTH_WALL_CHANNEL_PREFIX = "health-wall:channel:";
const CONVERSATION_RECENT_PREFIX = "conversation:recent:";
const CONVERSATION_CHANNEL_PREFIX = "conversation:channel:";
const RECENT_LIMIT = 100;

export type HealthWallMessageWithAuthor = {
  id: string;
  patientUserId: string;
  authorUserId: string;
  messageType: string;
  content?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  author: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    isAdmin?: boolean | null;
  };
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
    await c.publish(channel, JSON.stringify(message));
  } catch (err) {
    console.error("[Redis] publishHealthWallMessage error:", err);
  }
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

// Conversation messages (for doctor-to-doctor, groups, consiliums, channels)
export type ConversationMessageWithAuthor = {
  id: string;
  conversationId: string;
  authorUserId: string;
  messageType: string;
  content?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  author: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    isAdmin?: boolean | null;
  };
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
    await c.publish(CONVERSATION_CHANNEL_PREFIX + conversationId, JSON.stringify(message));
  } catch (err) {
    console.error("[Redis] publishConversationMessage error:", err);
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
