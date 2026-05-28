import { storage } from "./storage";
import { publishConversationSeen, publishHealthWallSeen } from "./redis";
import {
  cancelDeferredPushesForConversation,
  cancelDeferredPushesForHealthWall,
} from "./pushDefer";
import {
  broadcastConversationWsEvent,
  broadcastHealthWallWsEvent,
} from "./wsBroadcast";

export async function notifyConversationSeen(
  conversationId: string,
  userId: string
): Promise<void> {
  cancelDeferredPushesForConversation(conversationId, userId);
  const lastSeenAt = await storage.markConversationSeen(conversationId, userId);
  if (!lastSeenAt) return;
  const payload = {
    conversationId,
    userId,
    lastSeenAt: lastSeenAt.toISOString(),
  };
  await publishConversationSeen(conversationId, payload);
  broadcastConversationWsEvent(conversationId, "conversation_seen", payload);
}

export async function notifyHealthWallSeen(
  patientUserId: string,
  userId: string
): Promise<void> {
  cancelDeferredPushesForHealthWall(patientUserId, userId);
  const now = new Date();
  if (userId === patientUserId) {
    await storage.updatePatientLastVisit(patientUserId);
    const payload = {
      patientUserId,
      userId,
      lastVisitedAt: now.toISOString(),
      role: "patient" as const,
    };
    await publishHealthWallSeen(patientUserId, payload);
    broadcastHealthWallWsEvent(patientUserId, "health_wall_seen", payload);
    return;
  }

  const isConnected = await storage.isHealthWallDoctorConnected(patientUserId, userId);
  if (!isConnected) return;

  await storage.updateDoctorLastVisit(patientUserId, userId);
  const payload = {
    patientUserId,
    userId,
    lastVisitedAt: now.toISOString(),
    role: "doctor" as const,
  };
  await publishHealthWallSeen(patientUserId, payload);
  broadcastHealthWallWsEvent(patientUserId, "health_wall_seen", payload);
}
