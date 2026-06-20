import { storage } from "./storage";
import { publishDoctorChatsUpdated } from "./redis";

/** Refresh doctor chat lists after activity in a patient conversation. */
export async function notifyPatientConversationActivity(
  conversationId: string,
  authorUserId: string
): Promise<void> {
  await notifyMessengerConversationActivity(conversationId, authorUserId);
}

/** Refresh messenger chat lists for admin participants after a new message. */
export async function notifyMessengerConversationActivity(
  conversationId: string,
  authorUserId: string
): Promise<void> {
  const conv = await storage.getConversation(conversationId);
  if (!conv) return;

  const participants = await storage.getConversationParticipants(conversationId);
  await Promise.all(
    participants
      .filter((participant) => {
        if (participant.userId === authorUserId) return false;
        if (conv.type === "patient") return participant.user.isAdmin;
        if (conv.type === "channel") return true;
        return !!participant.user.isAdmin;
      })
      .map((participant) => publishDoctorChatsUpdated(participant.userId))
  );
}
