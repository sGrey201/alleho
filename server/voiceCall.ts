import type { Request, Response } from "express";
import {
  AccessToken,
  TrackSource,
  TrackType,
  WebhookReceiver,
  type WebhookEvent,
} from "livekit-server-sdk";
import { storage } from "./storage";
import {
  invalidateConversationRecent,
  publishConversationCallEvent,
  publishConversationMessage,
  publishConversationMessageEdited,
  pushConversationRecentMessage,
  type ConversationMessageWithAuthor,
} from "./redis";
import { sendPushToUsers, formatSenderName, conversationPath } from "./push";
import { notifyMessengerConversationActivity } from "./doctorChatsNotify";
import {
  markTrackEgressEnded,
  markTrackEgressStarted,
  resolveCallRecordingRole,
  startMicrophoneTrackRecording,
  isCallRecordingDownloadPath,
  tryBuildCallRecordingPackage,
} from "./callRecording";
import {
  deleteLiveKitRoom,
  fetchLiveKitRoomSnapshot,
  getLiveKitParticipantCount,
  type LiveKitRoomSnapshot,
} from "./livekitRoom";
import type {
  ConversationCall,
  CallParticipantStatus,
  User,
} from "@shared/schema";

/** How long an unanswered call keeps ringing before it is auto-cancelled. */
export const RING_TTL_MS = 60_000;

/** Grace after call creation before treating an empty LiveKit room as abandoned. */
const CONNECT_GRACE_MS = 20_000;

/** Debounce room-empty webhook reconciliation to batch rapid disconnects. */
const ROOM_EMPTY_DEBOUNCE_MS = 2_000;

/** Conversation types that support voice conferences (channels are excluded). */
const CALLABLE_TYPES = new Set(["direct", "patient", "group", "consilium"]);

/** One-to-one chats where camera and call recording are allowed. */
const PRIVATE_CALL_TYPES = new Set(["direct", "patient"]);

const roomEmptyTimers = new Map<string, NodeJS.Timeout>();

export function isCallableConversationType(type: string): boolean {
  return CALLABLE_TYPES.has(type);
}

export function isPrivateCallConversationType(type: string): boolean {
  return PRIVATE_CALL_TYPES.has(type);
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

/**
 * Issues a LiveKit access token scoped to a single call room.
 * Private chats may publish microphone and camera. Groups stay audio-only.
 */
export async function createCallAccessToken(
  callId: string,
  user: User,
  conversationType: string
): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("LiveKit is not configured");
  }
  const call = await storage.getCallById(callId);
  const conv = call ? await storage.getConversation(call.conversationId) : null;
  const role = resolveCallRecordingRole(user, conv);
  const at = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: formatSenderName(user),
    ttl: "2h",
    metadata: JSON.stringify({ role }),
  });
  at.addGrant({
    roomJoin: true,
    room: callId,
    canPublish: true,
    canSubscribe: true,
    canPublishSources: isPrivateCallConversationType(conversationType)
      ? [TrackSource.MICROPHONE, TrackSource.CAMERA]
      : [TrackSource.MICROPHONE],
  });
  return at.toJwt();
}

async function markCallActive(call: ConversationCall): Promise<void> {
  if (call.status === "ringing") {
    await storage.markCallActive(call.id);
  }
}

function participantCountFromSnapshot(
  callId: string,
  snapshot: LiveKitRoomSnapshot
): number {
  return snapshot.get(callId) ?? 0;
}

async function resolveParticipantCount(
  callId: string,
  snapshot?: LiveKitRoomSnapshot
): Promise<number | null> {
  if (snapshot) {
    return participantCountFromSnapshot(callId, snapshot);
  }
  return getLiveKitParticipantCount(callId);
}

async function cancelUnansweredCall(call: ConversationCall): Promise<void> {
  const rows = await storage.getCallParticipants(call.id);
  for (const row of rows) {
    if (row.status === "invited") {
      await storage.setCallParticipantStatus(call.id, row.userId, "missed");
    } else if (row.userId === call.initiatedByUserId && row.status === "joined") {
      await storage.setCallParticipantStatus(call.id, row.userId, "left");
    }
  }
  await endCall(call, "cancelled");
  void deleteLiveKitRoom(call.id);
}

/**
 * Reconciles a DB call row with LiveKit room occupancy.
 * Returns true when the call was ended as stale.
 */
export async function reconcileStaleCall(
  call: ConversationCall,
  snapshot?: LiveKitRoomSnapshot
): Promise<boolean> {
  if (!isLiveKitConfigured()) return false;

  const participantCount = await resolveParticipantCount(call.id, snapshot);
  if (participantCount === null) return false;

  if (participantCount > 0) {
    if (call.status === "ringing") {
      await markCallActive(call);
    }
    return false;
  }

  const now = Date.now();
  const createdAt = call.createdAt?.getTime() ?? now;
  const ringExpiresAt = call.ringExpiresAt?.getTime() ?? 0;

  if (call.status === "ringing") {
    if (now < ringExpiresAt && now - createdAt < CONNECT_GRACE_MS) {
      return false;
    }
    await cancelUnansweredCall(call);
    return true;
  }

  if (call.status === "active") {
    await endCall(call, "ended");
    void deleteLiveKitRoom(call.id);
    return true;
  }

  return false;
}

/** Clears zombie calls in a conversation before starting a new one. */
export async function reconcileConversationCallBeforeStart(conversationId: string): Promise<void> {
  const existing = await storage.getActiveCallForConversation(conversationId);
  if (!existing) return;
  await reconcileStaleCall(existing);
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
  if (!isPrivateCallConversationType(
    (await storage.getConversation(conversationId))?.type ?? ""
  )) {
    await storage.skipCallRecording(call.id);
  }
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
  await markCallActive(call);
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
  const timer = roomEmptyTimers.get(call.id);
  if (timer) {
    clearTimeout(timer);
    roomEmptyTimers.delete(call.id);
  }

  const ended = await storage.endCall(call.id, reason);
  if (!ended) return;

  try {
    await postPrivateCallChatMessage(ended);
  } catch (err) {
    console.error("[VoiceCall] call chat message error:", err);
  }
  void tryBuildCallRecordingPackage(ended.id).catch((err) =>
    console.error("[VoiceCall] recording package error:", err)
  );

  await publishConversationCallEvent(call.conversationId, "conversation_call_ended", {
    callId: call.id,
    conversationId: call.conversationId,
    reason,
  });
}

async function endCallIfEmpty(
  call: ConversationCall,
  snapshot?: LiveKitRoomSnapshot
): Promise<void> {
  const rows = await storage.getCallParticipants(call.id);
  const invited = rows.filter((r) => r.status === "invited");

  if (invited.length > 0) {
    if (isLiveKitConfigured()) {
      const participantCount = await resolveParticipantCount(call.id, snapshot);
      if (participantCount === 0) {
        for (const row of invited) {
          await storage.setCallParticipantStatus(call.id, row.userId, "missed");
        }
        const joined = rows.filter((r) => r.status === "joined");
        for (const row of joined) {
          await storage.setCallParticipantStatus(call.id, row.userId, "left");
        }
        await endCall(call, "ended");
        void deleteLiveKitRoom(call.id);
      }
    }
    return;
  }

  const joined = rows.filter((r) => r.status === "joined");
  if (joined.length === 0) {
    await endCall(call, "ended");
    void deleteLiveKitRoom(call.id);
    return;
  }

  // Only the initiator remains — everyone else declined, left, or missed.
  if (
    joined.length === 1 &&
    joined[0].userId === call.initiatedByUserId &&
    rows.every(
      (r) =>
        r.userId === call.initiatedByUserId ||
        r.status === "declined" ||
        r.status === "left" ||
        r.status === "missed"
    )
  ) {
    await endCall(call, "ended");
    void deleteLiveKitRoom(call.id);
  }
}

/**
 * Cleans up calls that are still marked active/ringing but have no one left to
 * invite or join. Uses one listRooms call per sweep when LiveKit is configured.
 */
export async function sweepOrphanedCalls(): Promise<void> {
  const calls = await storage.getActiveCalls();
  if (calls.length === 0) return;

  const snapshot = isLiveKitConfigured() ? await fetchLiveKitRoomSnapshot() : null;

  for (const call of calls) {
    if (snapshot) {
      const ended = await reconcileStaleCall(call, snapshot);
      if (!ended) {
        await endCallIfEmpty(call, snapshot);
      }
    } else {
      await endCallIfEmpty(call);
    }
  }
}

/**
 * Sweeps calls whose ring window expired. Uses LiveKit occupancy instead of
 * trusting the initiator's pre-joined DB status.
 */
export async function sweepExpiredCalls(): Promise<void> {
  const now = new Date();
  const expired = await storage.getExpiredRingingCalls(now);
  if (expired.length === 0) return;

  const snapshot = isLiveKitConfigured() ? await fetchLiveKitRoomSnapshot() : null;

  for (const call of expired) {
    if (snapshot) {
      const participantCount = participantCountFromSnapshot(call.id, snapshot);
      if (participantCount > 0) {
        await markCallActive(call);
        continue;
      }
      await cancelUnansweredCall(call);
      continue;
    }

    const rows = await storage.getCallParticipants(call.id);
    const someoneJoinedAfterInitiator = rows.some(
      (r) => r.status === "joined" && r.userId !== call.initiatedByUserId
    );
    if (someoneJoinedAfterInitiator) {
      await markCallActive(call);
      continue;
    }
    await cancelUnansweredCall(call);
  }
}

function scheduleRoomEmptyReconcile(callId: string): void {
  const existing = roomEmptyTimers.get(callId);
  if (existing) clearTimeout(existing);

  roomEmptyTimers.set(
    callId,
    setTimeout(() => {
      roomEmptyTimers.delete(callId);
      void reconcileEmptyRoom(callId).catch((err) =>
        console.error("[VoiceCall] room-empty reconcile error:", err)
      );
    }, ROOM_EMPTY_DEBOUNCE_MS)
  );
}

async function reconcileEmptyRoom(callId: string): Promise<void> {
  const call = await storage.getCallById(callId);
  if (!call || call.status === "ended" || call.status === "cancelled") return;

  const participantCount = await getLiveKitParticipantCount(callId);
  if (participantCount === null || participantCount > 0) return;

  await endCall(call, "ended");
  void deleteLiveKitRoom(callId);
}

async function publishCallChatMessage(
  message: {
    id: string;
    conversationId: string;
    authorUserId: string;
    messageType: string;
    content: string | null;
    imageUrl: string | null;
    createdAt: Date | null;
  },
  author: User
): Promise<void> {
  const payload: ConversationMessageWithAuthor = {
    id: message.id,
    conversationId: message.conversationId,
    authorUserId: message.authorUserId,
    messageType: message.messageType,
    content: message.content,
    imageUrl: message.imageUrl,
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
  await pushConversationRecentMessage(message.conversationId, payload);
  await publishConversationMessage(message.conversationId, payload);
  void notifyMessengerConversationActivity(message.conversationId, author.id).catch((err) =>
    console.error("[VoiceCall] chat list refresh error:", err)
  );
}

/** Attach (or update) the recording download path on an existing call chat message. */
export async function attachCallRecordingToChatMessage(
  messageId: string,
  conversationId: string,
  objectPath: string
): Promise<void> {
  const updated = await storage.editConversationMessage(messageId, { imageUrl: objectPath });
  if (!updated) return;
  await invalidateConversationRecent(conversationId);
  await publishConversationMessageEdited(conversationId, {
    conversationId,
    messageId,
    content: updated.content ?? null,
    imageUrl: updated.imageUrl ?? null,
    editedAt: (updated.editedAt ?? new Date()).toISOString(),
  });
}

/** Writes a chat line for a private call that actually connected. */
async function postPrivateCallChatMessage(ended: ConversationCall): Promise<void> {
  if (!ended.startedAt) return;
  const conv = await storage.getConversation(ended.conversationId);
  if (!conv || !isPrivateCallConversationType(conv.type)) return;

  const latest = (await storage.getCallById(ended.id)) ?? ended;
  if (latest.recordingMessageId) return;

  const author = await storage.getUser(ended.initiatedByUserId);
  if (!author) return;

  const endedAt = latest.endedAt?.getTime() ?? ended.endedAt?.getTime() ?? Date.now();
  const durationSec = Math.max(0, Math.round((endedAt - ended.startedAt.getTime()) / 1000));
  const imageUrl =
    (latest.recordingStatus === "ready" || latest.recordingStatus === "ready_for_transcription") &&
    isCallRecordingDownloadPath(latest.recordingObjectPath)
      ? latest.recordingObjectPath
      : null;
  const message = await storage.createConversationMessage({
    conversationId: ended.conversationId,
    authorUserId: author.id,
    messageType: "call",
    content: JSON.stringify({ durationSec }),
    imageUrl,
  });
  const linked = await storage.setCallRecordingMessageId(ended.id, message.id);
  await publishCallChatMessage(message, author);

  const recordingPath = linked?.recordingObjectPath;
  if (
    recordingPath &&
    recordingPath !== imageUrl &&
    isCallRecordingDownloadPath(recordingPath)
  ) {
    await attachCallRecordingToChatMessage(message.id, ended.conversationId, recordingPath);
  }
}

function isMicrophoneAudioTrack(event: WebhookEvent): boolean {
  const track = event.track;
  if (!track) return false;
  const type = track.type as unknown;
  const source = track.source as unknown;
  const isAudio =
    type === TrackType.AUDIO || type === "AUDIO" || Number(type) === TrackType.AUDIO;
  const isMic =
    source === TrackSource.MICROPHONE ||
    source === "MICROPHONE" ||
    Number(source) === TrackSource.MICROPHONE;
  return isAudio && isMic;
}

async function processLiveKitWebhookEvent(event: WebhookEvent): Promise<void> {
  if (event.event === "egress_started" && event.egressInfo) {
    await markTrackEgressStarted(event.egressInfo);
    return;
  }
  if (event.event === "egress_ended" && event.egressInfo) {
    const call = await markTrackEgressEnded(event.egressInfo);
    if (call) {
      await tryBuildCallRecordingPackage(call.id);
    }
    return;
  }

  const roomName = event.room?.name;
  if (!roomName) return;

  const call = await storage.getCallById(roomName);
  if (!call) return;

  if (event.event === "track_published") {
    if (call.status !== "ringing" && call.status !== "active") return;
    const conv = await storage.getConversation(call.conversationId);
    if (!conv || !isPrivateCallConversationType(conv.type)) return;
    if (!isMicrophoneAudioTrack(event)) return;
    const trackSid = event.track?.sid;
    const identity = event.participant?.identity;
    if (!trackSid || !identity) return;
    await startMicrophoneTrackRecording({
      call,
      conv,
      trackSid,
      participantIdentity: identity,
      participantMetadata: event.participant?.metadata,
    });
    return;
  }

  if (call.status !== "ringing" && call.status !== "active") return;

  const userId = event.participant?.identity;

  switch (event.event) {
    case "participant_joined": {
      if (!userId) return;
      await storage.setCallParticipantStatus(call.id, userId, "joined");
      await markCallActive(call);
      await publishConversationCallEvent(call.conversationId, "conversation_call_accepted", {
        callId: call.id,
        conversationId: call.conversationId,
        userId,
      });
      break;
    }
    case "participant_left":
    case "participant_connection_aborted": {
      if (userId) {
        await storage.setCallParticipantStatus(call.id, userId, "left");
        await publishConversationCallEvent(call.conversationId, "conversation_call_left", {
          callId: call.id,
          conversationId: call.conversationId,
          userId,
        });
      }
      const remaining = event.room?.numParticipants ?? 0;
      if (remaining === 0) {
        scheduleRoomEmptyReconcile(call.id);
      } else {
        await endCallIfEmpty(call);
      }
      break;
    }
    case "room_finished": {
      await endCall(call, "ended");
      break;
    }
    default:
      break;
  }
}

/** LiveKit webhook endpoint — must receive the raw POST body for signature verification. */
export async function handleLiveKitWebhook(req: Request, res: Response): Promise<void> {
  if (!isLiveKitConfigured()) {
    res.status(503).json({ message: "LiveKit is not configured" });
    return;
  }

  const apiKey = process.env.LIVEKIT_API_KEY!;
  const apiSecret = process.env.LIVEKIT_API_SECRET!;
  const receiver = new WebhookReceiver(apiKey, apiSecret);

  try {
    const body =
      req.body instanceof Buffer
        ? req.body.toString("utf8")
        : typeof req.body === "string"
          ? req.body
          : "";
    const event = await receiver.receive(body, req.get("Authorization") ?? undefined);
    res.sendStatus(200);
    void processLiveKitWebhookEvent(event).catch((err) =>
      console.error("[VoiceCall] webhook process error:", err)
    );
  } catch (err) {
    console.error("[VoiceCall] webhook verify error:", err);
    res.status(400).json({ message: "Invalid webhook" });
  }
}
