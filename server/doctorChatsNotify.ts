import { storage } from "./storage";
import { publishDoctorChatsUpdated } from "./redis";

/** Refresh doctor chat lists after activity in a patient conversation. */
export async function notifyPatientConversationActivity(
  conversationId: string,
  authorUserId: string
): Promise<void> {
  const conv = await storage.getConversation(conversationId);
  if (!conv || conv.type !== "patient") return;

  const participants = await storage.getConversationParticipants(conversationId);
  await Promise.all(
    participants
      .filter((p) => p.userId !== authorUserId && p.user.isAdmin)
      .map((p) => publishDoctorChatsUpdated(p.userId))
  );
}
