import { db } from "../../server/db.ts";
import { storage } from "../../server/storage.ts";
import { users } from "../../shared/schema.ts";
import { CHANNEL_ID } from "./constants.ts";
import { loadLegacyUsers } from "./loadJson.ts";
import { normalizeEmail } from "./importUsers.ts";
import type { ImportPhaseResult, SourceUser } from "./types.ts";

/** Add user to channel without self-subscribe access checks (legacy import). */
export async function ensureChannelMemberForImport(userId: string): Promise<void> {
  const inConv = await storage.isUserInConversation(userId, CHANNEL_ID);
  if (inConv) return;
  await storage.addConversationParticipant(CHANNEL_ID, userId, "member");
}

function resolveDbUserId(
  legacy: SourceUser,
  byId: Map<string, string>,
  byEmail: Map<string, string>
): string | null {
  const byLegacyId = byId.get(legacy.id);
  if (byLegacyId) return byLegacyId;

  const email = legacy.email?.trim() ? normalizeEmail(legacy.email) : "";
  if (email) {
    const byLegacyEmail = byEmail.get(email);
    if (byLegacyEmail) return byLegacyEmail;
  }

  return null;
}

export async function importChannelSubscribers(options: {
  dryRun: boolean;
}): Promise<ImportPhaseResult> {
  const legacyUsers = loadLegacyUsers();

  const dbUsers = await db.select({ id: users.id, email: users.email }).from(users);
  const byId = new Map(dbUsers.map((u) => [u.id, u.id]));
  const byEmail = new Map(
    dbUsers
      .filter((u) => u.email)
      .map((u) => [normalizeEmail(u.email!), u.id] as const)
  );

  const existingMembers = new Set(
    (
      await storage.getConversationParticipants(CHANNEL_ID)
    ).map((p) => p.userId)
  );

  const result: ImportPhaseResult = {
    total: legacyUsers.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    details: { missingUser: 0, alreadyMember: 0 },
  };

  const seenUserIds = new Set<string>();

  for (const legacy of legacyUsers) {
    const userId = resolveDbUserId(legacy, byId, byEmail);
    if (!userId) {
      result.skipped += 1;
      result.details!.missingUser += 1;
      continue;
    }
    if (seenUserIds.has(userId)) {
      result.skipped += 1;
      continue;
    }
    seenUserIds.add(userId);

    if (existingMembers.has(userId)) {
      result.skipped += 1;
      result.details!.alreadyMember += 1;
      continue;
    }

    if (options.dryRun) {
      result.inserted += 1;
      continue;
    }

    try {
      await ensureChannelMemberForImport(userId);
      result.inserted += 1;
      existingMembers.add(userId);
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
