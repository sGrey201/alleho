import type { ChannelMembershipStatus, Conversation } from "@shared/schema";

type ChannelAccessContext = {
  isMember: boolean;
  isAdmin: boolean;
  role?: string;
  membershipStatus?: ChannelMembershipStatus;
};

function isActiveChannelMember(ctx: ChannelAccessContext): boolean {
  if (!ctx.isMember) return false;
  if (ctx.role === "owner" || ctx.role === "admin") return true;
  return ctx.membershipStatus !== "pending";
}

/** Whether an authenticated user may open channel profile (including via direct link). */
export function canUserViewChannelProfile(
  conv: Conversation,
  ctx: ChannelAccessContext
): boolean {
  if (conv.type !== "channel") return false;
  if (ctx.isMember) return true;
  if (conv.isHidden) return true;
  if (conv.isClosed) return false;
  if (!ctx.isAdmin && !conv.patientAvailable) return false;
  return true;
}

/** Whether an authenticated user may read channel content without being an active member. */
export function canUserReadChannel(
  conv: Conversation,
  ctx: ChannelAccessContext
): boolean {
  if (conv.type !== "channel") return false;
  if (isActiveChannelMember(ctx)) return true;
  if (conv.isHidden) return false;
  if (conv.isClosed) return false;
  if (!ctx.isAdmin && !conv.patientAvailable) return false;
  return true;
}

/** Whether a user may request or complete subscription to a channel. */
export function canUserSubscribeToChannel(
  conv: Conversation,
  ctx: ChannelAccessContext
): boolean {
  if (conv.type !== "channel") return false;
  if (ctx.isMember) return false;
  if (conv.isHidden) return true;
  if (conv.isClosed) return false;
  if (!ctx.isAdmin && !conv.patientAvailable) return false;
  return true;
}

export function isChannelSubscriptionPending(ctx: ChannelAccessContext): boolean {
  return ctx.isMember && ctx.role === "member" && ctx.membershipStatus === "pending";
}

export function buildChannelAccessContext(
  isMember: boolean,
  isAdmin: boolean,
  role?: string,
  membershipStatus?: string | null
): ChannelAccessContext {
  return {
    isMember,
    isAdmin,
    role,
    membershipStatus:
      membershipStatus === "pending"
        ? "pending"
        : membershipStatus === "active"
          ? "active"
          : isMember
            ? "active"
            : undefined,
  };
}
