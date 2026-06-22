import { readFileSync } from "node:fs";
import { db } from "../../server/db.ts";
import { users, type UpsertUser } from "../../shared/schema.ts";
import { USER_BATCH_SIZE } from "./constants.ts";
import { parseDate } from "./parseDate.ts";
import type { ImportPhaseResult, SourceUser } from "./types.ts";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapSourceUser(row: SourceUser): UpsertUser {
  const email = normalizeEmail(row.email);
  return {
    id: row.id,
    email,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    profileImageUrl: row.profile_image_url ?? null,
    passwordHash: row.password_hash ?? null,
    resetToken: row.reset_token ?? null,
    resetTokenExpiresAt: parseDate(row.reset_token_expires_at),
    gender: row.gender ?? null,
    birthMonth: row.birth_month ?? null,
    birthYear: row.birth_year ?? null,
    height: row.height ?? null,
    weight: row.weight ?? null,
    country: null,
    city: row.city ?? null,
    isAdmin: row.is_admin ?? false,
    requiresRoleSelection: true,
    subscriptionExpiresAt: parseDate(row.subscription_expires_at),
    questionnaireHintsMode: "icon",
    createdAt: parseDate(row.created_at) ?? undefined,
    updatedAt: parseDate(row.updated_at) ?? undefined,
  };
}

export async function importUsers(options: {
  dryRun: boolean;
  filePath?: string;
  sourceRows?: SourceUser[];
}): Promise<ImportPhaseResult> {
  const sourceRows =
    options.sourceRows ??
    (() => {
      if (!options.filePath) {
        throw new Error("filePath or sourceRows is required");
      }
      const raw = JSON.parse(readFileSync(options.filePath, "utf8"));
      if (!Array.isArray(raw)) {
        throw new Error("Expected JSON array of users.");
      }
      return raw as SourceUser[];
    })();

  const existing = await db.select({ id: users.id, email: users.email }).from(users);
  const existingEmails = new Set(
    existing.map((u) => (u.email ? normalizeEmail(u.email) : "")).filter(Boolean)
  );
  const existingIds = new Set(existing.map((u) => u.id));

  let skippedEmail = 0;
  let skippedId = 0;
  let skippedInvalid = 0;
  const toInsert: UpsertUser[] = [];

  for (const row of sourceRows) {
    if (!row.email?.trim()) {
      skippedInvalid += 1;
      continue;
    }
    const email = normalizeEmail(row.email);
    if (existingEmails.has(email)) {
      skippedEmail += 1;
      continue;
    }
    if (existingIds.has(row.id)) {
      skippedId += 1;
      continue;
    }
    toInsert.push(mapSourceUser(row));
  }

  const result: ImportPhaseResult = {
    total: sourceRows.length,
    inserted: 0,
    skipped: skippedEmail + skippedId + skippedInvalid,
    failed: 0,
    details: {
      skippedEmail,
      skippedId,
      skippedInvalid,
    },
  };

  if (options.dryRun || toInsert.length === 0) {
    result.inserted = toInsert.length;
    return result;
  }

  for (let i = 0; i < toInsert.length; i += USER_BATCH_SIZE) {
    const batch = toInsert.slice(i, i + USER_BATCH_SIZE);
    try {
      const inserted = await db
        .insert(users)
        .values(batch)
        .onConflictDoNothing({ target: users.email })
        .returning({ id: users.id });
      result.inserted += inserted.length;
      if (inserted.length < batch.length) {
        result.skipped += batch.length - inserted.length;
        result.details!.skippedEmail += batch.length - inserted.length;
      }
    } catch {
      result.failed += batch.length;
    }
  }

  return result;
}
