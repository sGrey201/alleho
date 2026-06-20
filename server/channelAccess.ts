import type { Conversation } from "@shared/schema";

/** Whether an authenticated user may read channel content without being a member. */
export function canUserReadChannel(
  conv: Conversation,
  isMember: boolean,
  isAdmin: boolean
): boolean {
  if (conv.type !== "channel") return false;
  if (isMember) return true;
  if (conv.isClosed) return false;
  if (!isAdmin && !conv.patientAvailable) return false;
  return true;
}

/** Whether a user may self-subscribe to a channel. */
export function canUserSubscribeToChannel(
  conv: Conversation,
  isMember: boolean,
  isAdmin: boolean
): boolean {
  if (conv.type !== "channel" || isMember) return false;
  if (conv.isClosed) return false;
  if (!isAdmin && !conv.patientAvailable) return false;
  return true;
}
