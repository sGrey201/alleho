import Redis from "ioredis";
import { broadcastDoctorChatsUpdated, broadcastConversationWsEvent } from "./wsBroadcast";

const REDIS_URL =
  process.env.REDIS_URL ??
  (process.env.REDIS_HOST ? `redis://${process.env.REDIS_HOST}:6379` : undefined);
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

export function isRedisAvailable(): boolean {
  return !!REDIS_URL;
}

export async function publishDoctorChatsUpdated(doctorUserId: string): Promise<void> {
  const envelope = {
    type: "doctor_chats_updated" as const,
    doctorUserId,
    timestamp: new Date().toISOString(),
  };
  const serialized = JSON.stringify(envelope);
  const clientWire = JSON.stringify({
    type: "doctor_chats_updated",
    payload: {
      timestamp: envelope.timestamp,
    },
  });
  const c = getClient();
  if (c) {
    try {
      await c.publish(DOCTOR_EVENTS_CHANNEL_PREFIX + doctorUserId, serialized);
    } catch (err) {
      console.error("[Redis] publishDoctorChatsUpdated error:", err);
    }
  } else {
    broadcastDoctorChatsUpdated(doctorUserId, clientWire);
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
  commentsCount?: number;
  /** Present when messageType is `poll` (from REST enrich or after voting). */
  pollResults?: {
    voteCounts: number[];
    totalVotes: number;
    selectedOptionIndices: number[];
  };
  hasSponsorContent?: boolean;
  isContentTruncated?: boolean;
  author: ConversationMessageAuthor;
};

export type ConversationPollUpdatedPayload = {
  conversationId: string;
  messageId: string;
  voteCounts: number[];
  totalVotes: number;
};

export type ConversationCommentWithAuthor = {
  id: string;
  conversationId: string;
  messageId: string;
  authorUserId: string;
  content?: string | null;
  imageUrl?: string | null;
  replyToCommentId?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  commentsCount?: number;
  reactions?: MessageReactionSummary[];
  author: ConversationMessageAuthor;
  replyTo?: {
    id: string;
    authorUserId: string;
    content?: string | null;
    imageUrl?: string | null;
    deletedAt?: string | null;
    author?: ConversationMessageAuthor | null;
  } | null;
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
  imageUrl?: string | null;
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

export type ConversationCommentEditedPayload = {
  conversationId: string;
  messageId: string;
  commentId: string;
  content: string | null;
  editedAt: string;
};

export type ConversationCommentDeletedPayload = {
  conversationId: string;
  messageId: string;
  commentId: string;
  deletedAt: string;
};

export type ConversationCommentReactionPayload = {
  conversationId: string;
  messageId: string;
  commentId: string;
  reactions: MessageReactionSummary[];
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
  await publishConversationChannelEvent(conversationId, "conversation_message", message);
}

export async function publishConversationSeen(
  conversationId: string,
  payload: ConversationSeenPayload
): Promise<void> {
  await publishConversationChannelEvent(conversationId, "conversation_seen", payload);
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
  await publishConversationChannelEvent(conversationId, "conversation_message_edited", payload);
}

export async function publishConversationMessageDeleted(
  conversationId: string,
  payload: ConversationMessageDeletedPayload
): Promise<void> {
  await publishConversationChannelEvent(conversationId, "conversation_message_deleted", payload);
}

export async function publishConversationMessagePinned(
  conversationId: string,
  payload: ConversationMessagePinnedPayload
): Promise<void> {
  await publishConversationChannelEvent(conversationId, "conversation_message_pinned", payload);
}

export async function publishConversationMessageUnpinned(
  conversationId: string,
  payload: ConversationMessageUnpinnedPayload
): Promise<void> {
  await publishConversationChannelEvent(conversationId, "conversation_message_unpinned", payload);
}

async function publishConversationChannelEvent(
  conversationId: string,
  type: string,
  payload: unknown
): Promise<void> {
  const c = getClient();
  if (c) {
    try {
      await c.publish(
        CONVERSATION_CHANNEL_PREFIX + conversationId,
        JSON.stringify({ type, payload })
      );
    } catch (err) {
      console.error(`[Redis] ${type} error:`, err);
    }
    return;
  }
  broadcastConversationWsEvent(conversationId, type, payload);
}

async function publishConversationEvent(conversationId: string, type: string, payload: unknown): Promise<void> {
  await publishConversationChannelEvent(conversationId, type, payload);
}

export async function publishConversationComment(
  conversationId: string,
  payload: ConversationCommentWithAuthor
): Promise<void> {
  await publishConversationEvent(conversationId, "conversation_comment", payload);
}

export async function publishConversationCommentEdited(
  conversationId: string,
  payload: ConversationCommentEditedPayload
): Promise<void> {
  await publishConversationEvent(conversationId, "conversation_comment_edited", payload);
}

export async function publishConversationCommentDeleted(
  conversationId: string,
  payload: ConversationCommentDeletedPayload
): Promise<void> {
  await publishConversationEvent(conversationId, "conversation_comment_deleted", payload);
}

export async function publishConversationCommentReaction(
  conversationId: string,
  payload: ConversationCommentReactionPayload
): Promise<void> {
  await publishConversationEvent(conversationId, "conversation_comment_reaction", payload);
}

export async function publishConversationPollUpdated(
  conversationId: string,
  payload: ConversationPollUpdatedPayload
): Promise<void> {
  await publishConversationEvent(conversationId, "conversation_poll_updated", payload);
}

/**
 * Voice-conference signaling events. Unlike message events these are not
 * idempotent, so we publish via Redis when available (the subscriber loops the
 * event back to local + remote sockets) and only fall back to the in-process
 * broadcaster when Redis is absent — avoiding double delivery.
 */
export async function publishConversationCallEvent(
  conversationId: string,
  type:
    | "conversation_call_started"
    | "conversation_call_accepted"
    | "conversation_call_declined"
    | "conversation_call_joined"
    | "conversation_call_left"
    | "conversation_call_ended",
  payload: unknown
): Promise<void> {
  const c = getClient();
  if (c) {
    try {
      await c.publish(
        CONVERSATION_CHANNEL_PREFIX + conversationId,
        JSON.stringify({ type, payload })
      );
      return;
    } catch (err) {
      console.error(`[Redis] ${type} error:`, err);
    }
  }
  broadcastConversationWsEvent(conversationId, type, payload);
}
