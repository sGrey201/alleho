import { useMemo } from "react";
import { differenceInCalendarDays, startOfDay } from "date-fns";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { messengerProfilePath } from "@/lib/messengerPaths";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const VISIBLE_ROWS = 5;
const ROW_HEIGHT_REM = 2.75;

export type ChannelSubscriber = {
  userId: string;
  role: string;
  membershipStatus?: string | null;
  sponsorExpiresAt?: string | null;
  sponsorListingExpiresAt?: string | null;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    isAdmin?: boolean;
  };
};

type Props = {
  participants: ChannelSubscriber[];
  profileReturnTo?: string;
  conversationId?: string;
  isOwner?: boolean;
  isHiddenChannel?: boolean;
  onApproveSubscription?: (userId: string) => void;
  isApproving?: boolean;
};

type SubscriptionInfo = {
  hasSubscription: boolean;
  sortDays: number;
  contentDays: number | null;
  sponsorDays: number | null;
};

function displayName(entry: ChannelSubscriber) {
  const name = [entry.user?.firstName, entry.user?.lastName].filter(Boolean).join(" ").trim();
  return name || entry.user?.email || entry.userId;
}

function daysLeftUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const expiry = new Date(iso);
  const today = startOfDay(new Date());
  const days = differenceInCalendarDays(startOfDay(expiry), today);
  return days > 0 ? days : null;
}

function getSubscriptionInfo(subscriber: ChannelSubscriber): SubscriptionInfo {
  const contentDays = daysLeftUntil(subscriber.sponsorExpiresAt);
  const sponsorDays = daysLeftUntil(subscriber.sponsorListingExpiresAt);
  const activeDays = [contentDays, sponsorDays].filter((days): days is number => days !== null);

  if (activeDays.length === 0) {
    return { hasSubscription: false, sortDays: Number.POSITIVE_INFINITY, contentDays, sponsorDays };
  }

  return {
    hasSubscription: true,
    sortDays: Math.min(...activeDays),
    contentDays,
    sponsorDays,
  };
}

function compareSubscribers(a: ChannelSubscriber, b: ChannelSubscriber) {
  const infoA = getSubscriptionInfo(a);
  const infoB = getSubscriptionInfo(b);

  if (infoA.hasSubscription !== infoB.hasSubscription) {
    return infoA.hasSubscription ? -1 : 1;
  }

  if (infoA.hasSubscription && infoB.hasSubscription && infoA.sortDays !== infoB.sortDays) {
    return infoA.sortDays - infoB.sortDays;
  }

  return displayName(a).localeCompare(displayName(b), "ru", { sensitivity: "base" });
}

export default function ChannelSubscribersList({
  participants,
  profileReturnTo,
  isOwner = false,
  isHiddenChannel = false,
  onApproveSubscription,
  isApproving = false,
}: Props) {
  const [, setLocation] = useLocation();

  const subscribers = useMemo(
    () => [...participants].sort(compareSubscribers),
    [participants]
  );

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">{t.channelSubscribersTitle}</p>
      {subscribers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.channelSubscribersEmpty}</p>
      ) : (
        <ul
          className="divide-y overflow-y-auto"
          style={{ maxHeight: `calc(${ROW_HEIGHT_REM}rem * ${VISIBLE_ROWS})` }}
        >
          {subscribers.map((subscriber) => {
            const isHomeopath = !!subscriber.user?.isAdmin;
            const roleLabel = isHomeopath ? t.channelSubscriberHomeopath : t.channelSubscriberPatient;
            const roleLetter = isHomeopath ? t.channelSubscriberRoleHomeopath : t.channelSubscriberRolePatient;
            const { contentDays, sponsorDays } = getSubscriptionInfo(subscriber);
            const isPending =
              isHiddenChannel &&
              subscriber.role === "member" &&
              subscriber.membershipStatus === "pending";

            return (
              <li key={subscriber.userId} className="flex items-start gap-2 py-2.5 first:pt-0 last:pb-0">
                <span
                  className={cn(
                    "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    isHomeopath
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                  title={roleLabel}
                  aria-label={roleLabel}
                >
                  {roleLetter}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <button
                    type="button"
                    className="text-sm font-medium text-primary hover:underline truncate max-w-full text-left"
                    onClick={() =>
                      setLocation(messengerProfilePath(subscriber.userId, profileReturnTo))
                    }
                  >
                    {displayName(subscriber)}
                  </button>
                  {(contentDays !== null || sponsorDays !== null) && (
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      {contentDays !== null && (
                        <p>{t.channelSubscriberContentDaysLeft(contentDays)}</p>
                      )}
                      {sponsorDays !== null && (
                        <p>{t.channelSubscriberSponsorDaysLeft(sponsorDays)}</p>
                      )}
                    </div>
                  )}
                  {isPending && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {t.channelSubscriptionPendingOwner}
                    </p>
                  )}
                </div>
                {isOwner && isPending && onApproveSubscription && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={isApproving}
                    onClick={() => onApproveSubscription(subscriber.userId)}
                  >
                    {t.channelSubscriptionApprove}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
