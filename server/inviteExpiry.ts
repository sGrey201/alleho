/** Patient invite links do not expire (column stays NOT NULL). */
export const PATIENT_INVITE_EXPIRES_AT = new Date("9999-12-31T23:59:59.000Z");

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export function inviteExpiresAtForType(inviteType: string): Date {
  if (inviteType === "patient") {
    return new Date(PATIENT_INVITE_EXPIRES_AT);
  }
  return new Date(Date.now() + INVITE_TTL_MS);
}

/** Patient invites never expire, including legacy rows with a short expiresAt. */
export function isInviteExpired(invite: {
  inviteType: string;
  expiresAt: Date | string;
}): boolean {
  if (invite.inviteType === "patient") return false;
  return new Date(invite.expiresAt).getTime() <= Date.now();
}

/**
 * Patient links stay usable even if previously marked expired by the old 24h rule.
 * Accepted / revoked remain inactive.
 */
export function isInviteInactive(invite: {
  inviteType: string;
  status: string;
}): boolean {
  if (invite.status === "pending") return false;
  if (invite.inviteType === "patient" && invite.status === "expired") return false;
  return true;
}
