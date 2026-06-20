import type { Conversation } from "@shared/schema";

/** Whether an authenticated homeopath may read group content without being a member. */
export function canUserReadGroup(
  conv: Conversation,
  isMember: boolean,
  isAdmin: boolean
): boolean {
  if (conv.type !== "group") return false;
  if (isMember) return true;
  if (conv.isClosed) return false;
  if (!isAdmin) return false;
  return true;
}

/** Whether a homeopath may self-join a public group. */
export function canUserJoinGroup(
  conv: Conversation,
  isMember: boolean,
  isAdmin: boolean
): boolean {
  if (conv.type !== "group" || isMember) return false;
  if (conv.isClosed) return false;
  if (!isAdmin) return false;
  return true;
}
