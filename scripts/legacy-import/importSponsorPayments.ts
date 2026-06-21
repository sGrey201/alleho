import { and, eq } from "drizzle-orm";
import { db } from "../../server/db.ts";
import { storage } from "../../server/storage.ts";
import {
  channelSponsorPayments,
  conversationParticipants,
  users,
} from "../../shared/schema.ts";
import {
  CHANNEL_ID,
  DEFAULT_SUBSCRIPTION_FALLBACK_DAYS,
  LEGACY_RECEIPT_URL,
} from "./constants.ts";
import { ensureChannelMemberForImport } from "./channelMembers.ts";
import { loadLegacyPayments, loadLegacyUsers } from "./loadJson.ts";
import { addDays, daysBetween, parseDate } from "./parseDate.ts";
import type { ImportPhaseResult } from "./types.ts";

async function setActiveSponsorExpiry(
  userId: string,
  expiresAt: Date,
  dryRun: boolean
): Promise<void> {
  if (dryRun) return;
  await ensureChannelMemberForImport(userId);
  await db
    .update(conversationParticipants)
    .set({ sponsorExpiresAt: expiresAt })
    .where(
      and(
        eq(conversationParticipants.conversationId, CHANNEL_ID),
        eq(conversationParticipants.userId, userId)
      )
    );
}

export async function importSponsorPayments(options: {
  dryRun: boolean;
}): Promise<ImportPhaseResult> {
  const payments = loadLegacyPayments().filter((p) => p.status === "completed");
  const legacyUsers = loadLegacyUsers();
  const subscriptionByUserId = new Map(
    legacyUsers.map((u) => [u.id, parseDate(u.subscription_expires_at)])
  );

  const dbUsers = await db
    .select({
      id: users.id,
      subscriptionExpiresAt: users.subscriptionExpiresAt,
    })
    .from(users);
  const userIds = new Set(dbUsers.map((u) => u.id));
  const dbSubscriptionByUserId = new Map(
    dbUsers.map((u) => [u.id, u.subscriptionExpiresAt])
  );

  const existingPayments = await db
    .select({ id: channelSponsorPayments.id })
    .from(channelSponsorPayments)
    .where(eq(channelSponsorPayments.conversationId, CHANNEL_ID));
  const existingPaymentIds = new Set(existingPayments.map((p) => p.id));

  const now = new Date();
  const result: ImportPhaseResult = {
    total: payments.length,
    inserted: 0,
    skipped: 0,
    failed: 0,
    details: { missingUser: 0, duplicate: 0, activeSubsSynced: 0 },
  };

  for (const payment of payments) {
    if (!userIds.has(payment.user_id)) {
      result.skipped += 1;
      result.details!.missingUser += 1;
      continue;
    }
    if (existingPaymentIds.has(payment.id)) {
      result.skipped += 1;
      result.details!.duplicate += 1;
      continue;
    }

    const validFrom = parseDate(payment.created_at) ?? now;
    const subscriptionExpiresAt =
      dbSubscriptionByUserId.get(payment.user_id) ??
      subscriptionByUserId.get(payment.user_id) ??
      null;
    const validUntil =
      subscriptionExpiresAt ?? addDays(validFrom, DEFAULT_SUBSCRIPTION_FALLBACK_DAYS);
    const durationDays = daysBetween(validFrom, validUntil);

    if (options.dryRun) {
      result.inserted += 1;
      if (subscriptionExpiresAt && subscriptionExpiresAt > now) {
        result.details!.activeSubsSynced += 1;
      }
      continue;
    }

    try {
      await ensureChannelMemberForImport(payment.user_id);
      await db.insert(channelSponsorPayments).values({
        id: payment.id,
        conversationId: CHANNEL_ID,
        userId: payment.user_id,
        receiptUrl: payment.receipt_url?.trim() || LEGACY_RECEIPT_URL,
        amount: payment.amount,
        donationType: "content",
        status: "approved",
        durationDays,
        validFrom,
        validUntil,
        submittedAt: validFrom,
        reviewedAt: now,
        createdAt: validFrom,
        updatedAt: now,
      });
      result.inserted += 1;

      if (subscriptionExpiresAt && subscriptionExpiresAt > now) {
        await setActiveSponsorExpiry(payment.user_id, subscriptionExpiresAt, false);
        result.details!.activeSubsSynced += 1;
      }
    } catch {
      result.failed += 1;
    }
  }

  for (const user of dbUsers) {
    const expiresAt = user.subscriptionExpiresAt;
    if (!expiresAt || expiresAt <= now) continue;
    if (!userIds.has(user.id)) continue;

    const hasPayment = payments.some((p) => p.user_id === user.id);
    if (hasPayment) continue;

    if (options.dryRun) {
      result.details!.activeSubsSynced += 1;
      continue;
    }

    try {
      await setActiveSponsorExpiry(user.id, expiresAt, false);
      result.details!.activeSubsSynced += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}
