import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type PaidContentSubscription = {
  conversationId: string;
  name: string | null;
  expiresAt: string;
  isActive: boolean;
};

type ChannelSubscriptionsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectChannel?: (conversationId: string) => void;
};

function parsePaidUntilDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatPaidUntilDate(iso: string): string | null {
  const date = parsePaidUntilDate(iso);
  if (!date) return null;
  return format(date, "d MMMM yyyy", { locale: ru });
}

export function ChannelSubscriptionsDialog({
  open,
  onOpenChange,
  onSelectChannel,
}: ChannelSubscriptionsDialogProps) {
  const { data, isLoading, isError } = useQuery<{ subscriptions: PaidContentSubscription[] }>({
    queryKey: ["/api/me/channel-subscriptions", "paid-content", "v3"],
    queryFn: async () => {
      const res = await fetch("/api/me/channel-subscriptions", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { subscriptions?: PaidContentSubscription[] };
      return {
        subscriptions: (json.subscriptions ?? []).filter(
          (sub) => parsePaidUntilDate(sub.expiresAt) !== null
        ),
      };
    },
    enabled: open,
  });

  const subscriptions = useMemo(
    () =>
      (data?.subscriptions ?? []).flatMap((sub) => {
        const paidUntil = formatPaidUntilDate(sub.expiresAt);
        if (!paidUntil) return [];
        return [{ ...sub, paidUntil }];
      }),
    [data]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.paidContentTitle}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t.somethingWrong}</p>
        ) : subscriptions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t.noPaidContent}</p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {subscriptions.map((sub) => {
              const channelName = sub.name?.trim() || t.channelSub;
              return (
                <li key={sub.conversationId}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-xl border-2 px-4 py-3 text-left transition-colors hover:bg-muted/30",
                      sub.isActive
                        ? "border-green-600 bg-green-500/10 dark:border-green-500"
                        : "border-destructive bg-destructive/10"
                    )}
                    onClick={() => {
                      onSelectChannel?.(sub.conversationId);
                      onOpenChange(false);
                    }}
                  >
                    <span className="block text-sm font-medium leading-snug">{channelName}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {t.paidContentUntil(sub.paidUntil)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
