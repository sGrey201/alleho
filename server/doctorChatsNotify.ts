import { storage } from "./storage";
import { publishDoctorChatsUpdated, type HealthWallMessageWithAuthor } from "./redis";

/** Notify all doctors linked to a patient after a new health wall message. */
export async function notifyDoctorsHealthWallMessage(
  patientUserId: string,
  message: HealthWallMessageWithAuthor,
  _authorUserId: string
): Promise<void> {
  const doctors = await storage.getHealthWallDoctors(patientUserId);
  if (doctors.length === 0) return;

  const createdAt = message.createdAt;

  await Promise.all(
    doctors.map(async ({ user }) => {
      const stats = await storage.getPatientHealthWallStats(patientUserId, user.id);
      await publishDoctorChatsUpdated(user.id, {
        patientUserId,
        message,
        lastMessageAt: createdAt,
        lastMessagePreview: stats.lastMessagePreview,
        unreadCount: stats.unreadCount,
      });
    })
  );
}
