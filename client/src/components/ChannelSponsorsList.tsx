import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Heart, Loader2 } from "lucide-react";
import ChannelSponsorSection from "@/components/ChannelSponsorSection";
import { t } from "@/lib/i18n";

type ChannelSponsorEntry = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
};

type Props = {
  conversationId: string;
  monetizationEnabled: boolean;
  isOwner?: boolean;
  scrollPaymentOnMount?: boolean;
};

function displayName(entry: ChannelSponsorEntry) {
  const name = [entry.firstName, entry.lastName].filter(Boolean).join(" ").trim();
  return name || entry.userId;
}

export default function ChannelSponsorsList({
  conversationId,
  monetizationEnabled,
  isOwner = false,
  scrollPaymentOnMount = false,
}: Props) {
  const [, setLocation] = useLocation();
  const blockRef = useRef<HTMLDivElement>(null);

  const { data: sponsors = [], isLoading: sponsorsLoading } = useQuery<ChannelSponsorEntry[]>({
    queryKey: ["/api/conversations", conversationId, "channel-sponsors"],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${conversationId}/channel-sponsors`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!conversationId && monetizationEnabled,
  });

  useEffect(() => {
    if (!scrollPaymentOnMount || !blockRef.current) return;
    blockRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scrollPaymentOnMount, sponsorsLoading]);

  if (!monetizationEnabled) {
    return null;
  }

  return (
    <div ref={blockRef} className="space-y-4">
      <div className="space-y-4 rounded-xl border-2 border-amber-500/40 p-4">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0">
            <p className="text-base font-semibold">{t.channelSponsorsTitle}</p>
            {!isOwner && (
              <p className="text-xs text-muted-foreground">{t.sponsorBecomePrompt}</p>
            )}
          </div>
        </div>

        {sponsorsLoading ? (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : sponsors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.channelSponsorsEmpty}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sponsors.map((sponsor) => (
              <button
                key={sponsor.userId}
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setLocation(`/profile/${sponsor.userId}`)}
              >
                {displayName(sponsor)}
              </button>
            ))}
          </div>
        )}

        {!isOwner && (
          <ChannelSponsorSection
            conversationId={conversationId}
            isOwner={false}
            embedded
            tierTypes={["content_thanks"]}
          />
        )}
      </div>
    </div>
  );
}
