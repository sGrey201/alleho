import { storage } from "./storage";
import { publishConversationSeen } from "./redis";
import { cancelDeferredPushesForConversation } from "./pushDefer";
import { broadcastConversationWsEvent } from "./wsBroadcast";

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
