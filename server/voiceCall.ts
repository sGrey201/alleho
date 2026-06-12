import { AccessToken } from "livekit-server-sdk";
import { storage } from "./storage";
import { publishConversationCallEvent } from "./redis";
import { sendPushToUsers, formatSenderName, conversationPath } from "./push";
import type {
  ConversationCall,
  CallParticipantStatus,
  User,
} from "@shared/schema";

/** How long an unanswered call keeps ringing before it is auto-cancelled. */
export const RING_TTL_MS = 60_000;

/** Conversation types that support voice conferences (channels are excluded). */
const CALLABLE_TYPES = new Set(["direct", "patient", "group", "consilium"]);

export function isCallableConversationType(type: string): boolean {
  return CALLABLE_TYPES.has(type);
}

export function isLiveKitConfigured(): boolean {
  return !!(
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET &&
    process.env.LIVEKIT_URL
  );
}

export function getLiveKitUrl(): string | null {
  return process.env.LIVEKIT_URL ?? null;
}

export type CallParticipantDto = {
  userId: string;
  status: CallParticipantStatus;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    profileImageUrl: string | null;
  };
};

export type CallStateDto = {
  id: string;
  conversationId: string;
  status: string;
  initiatedByUserId: string;
  startedAt: string | null;
  ringExpiresAt: string | null;
  participants: CallParticipantDto[];
};

function toUserDto(user: User) {
  return {
    id: user.id,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    email: user.email ?? null,
    profileImageUrl: user.profileImageUrl ?? null,
  };
}

/** Builds the serializable call snapshot sent to clients and over WebSocket. */
export async function getCallStateDto(callId: string): Promise<CallStateDto | null> {
  const call = await storage.getCallById(callId);
  if (!call) return null;
  return buildCallStateDto(call);
}

async function buildCallStateDto(call: ConversationCall): Promise<CallStateDto> {
  const rows = await storage.getCallParticipants(call.id);
  const participants: CallParticipantDto[] = [];
  for (const row of rows) {
    const user = await storage.getUser(row.userId);
    if (!user) continue;
    participants.push({
      userId: row.userId,
      status: row.status as CallParticipantStatus,
      user: toUserDto(user),
    });
  }
  return {
    id: call.id,
    conversationId: call.conversationId,
    status: call.status,
    initiatedByUserId: call.initiatedByUserId,
    startedAt: call.startedAt ? call.startedAt.toISOString() : null,
    ringExpiresAt: call.ringExpiresAt ? call.ringExpiresAt.toISOString() : null,
    participants,
  };
}

/** Issues a LiveKit access token scoped to a single call room (audio only). */
export async function createCallAccessToken(callId: string, user: User): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit is not configured");
  }
  const at = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: formatSenderName(user),
    ttl: "2h",
  });
  at.addGrant({
    roomJoin: true,
    room: callId,
    canPublish: true,
    canSubscribe: true,
  });
  return at.toJwt();
}

/**
 * Creates a ringing call in a conversation, notifies the other participants
 * over WebSocket, and schedules a push to everyone who is not the initiator.
 */
export async function startCall(
  conversationId: string,
  initiator: User
): Promise<CallStateDto> {
  const participants = await storage.getConversationParticipants(conversationId);
  const participantUserIds = participants.map((p) => p.userId);
  const ringExpiresAt = new Date(Date.now() + RING_TTL_MS);

  const call = await storage.createCall({
    conversationId,
    initiatedByUserId: initiator.id,
    participantUserIds,
    ringExpiresAt,
  });

  const state = await buildCallStateDto(call);
  await publishConversationCallEvent(conversationId, "conversation_call_started", state);

  void notifyIncomingCall(conversationId, initiator, participantUserIds).catch((err) =>
    console.error("[VoiceCall] incoming call push error:", err)
  );

  return state;
}

async function notifyIncomingCall(
  conversationId: string,
  initiator: User,
  participantUserIds: string[]
): Promise<void> {
  const conv = await storage.getConversation(conversationId);
  if (!conv) return;
  const targets = participantUserIds.filter((uid) => uid !== initiator.id);
  if (targets.length === 0) return;
  await sendPushToUsers(targets, {
    title: "Входящий звонок",
    body: `${formatSenderName(initiator)} приглашает в голосовую конференцию`,
    url: conversationPath(conv.type, conversationId),
    tag: `call-${conversationId}`,
  });
}

/** Marks a participant joined, flips the call to active, and broadcasts. */
export async function acceptCall(call: ConversationCall, userId: string): Promise<void> {
  await storage.setCallParticipantStatus(call.id, userId, "joined");
  await storage.markCallActive(call.id);
  await publishConversationCallEvent(call.conversationId, "conversation_call_accepted", {
    callId: call.id,
    conversationId: call.conversationId,
    userId,
  });
}

export async function declineCall(call: ConversationCall, userId: string): Promise<void> {
  await storage.setCallParticipantStatus(call.id, userId, "declined");
  await publishConversationCallEvent(call.conversationId, "conversation_call_declined", {
    callId: call.id,
    conversationId: call.conversationId,
    userId,
  });
  await endCallIfEmpty(call);
}

/**
 * Handles a participant leaving. Ends the whole call when no joined
 * participants remain.
 */
export async function leaveCall(call: ConversationCall, userId: string): Promise<void> {
  await storage.setCallParticipantStatus(call.id, userId, "left");
  await publishConversationCallEvent(call.conversationId, "conversation_call_left", {
    callId: call.id,
    conversationId: call.conversationId,
    userId,
  });
  await endCallIfEmpty(call);
}

export async function endCall(
  call: ConversationCall,
  reason: "ended" | "cancelled" = "ended"
): Promise<void> {
  const ended = await storage.endCall(call.id, reason);
  if (!ended) return;
  await publishConversationCallEvent(call.conversationId, "conversation_call_ended", {
    callId: call.id,
    conversationId: call.conversationId,
    reason,
  });
}

async function endCallIfEmpty(call: ConversationCall): Promise<void> {
  const rows = await storage.getCallParticipants(call.id);
  const stillJoined = rows.some((r) => r.status === "joined");
  if (!stillJoined) {
    await endCall(call, "ended");
  }
}

/**
 * Sweeps calls whose ring window expired without anyone joining and cancels
 * them. Invoked periodically from the server bootstrap.
 */
export async function sweepExpiredCalls(): Promise<void> {
  const now = new Date();
  const expired = await storage.getExpiredRingingCalls(now);
  for (const call of expired) {
    const rows = await storage.getCallParticipants(call.id);
    const someoneJoinedAfterInitiator = rows.some(
      (r) => r.status === "joined" && r.userId !== call.initiatedByUserId
    );
    if (someoneJoinedAfterInitiator) {
      // Someone answered; promote to active instead of cancelling.
      await storage.markCallActive(call.id);
      continue;
    }
    // Mark everyone who never answered as missed, then cancel the call.
    for (const r of rows) {
      if (r.status === "invited") {
        await storage.setCallParticipantStatus(call.id, r.userId, "missed");
      }
    }
    await endCall(call, "cancelled");
  }
}
