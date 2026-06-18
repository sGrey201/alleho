import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { t } from "@/lib/i18n";

type SponsorThanksEntry = {
  userId: string;
  firstName: string | null;
  lastName: string | null;
};

type Props = {
  conversationId: string;
  monetizationEnabled: boolean;
};

function displayName(entry: SponsorThanksEntry) {
  const name = [entry.firstName, entry.lastName].filter(Boolean).join(" ").trim();
  return name || entry.userId;
}

export default function ChannelSponsorThanks({ conversationId, monetizationEnabled }: Props) {
  const [, setLocation] = useLocation();

  const { data: sponsors = [], isLoading } = useQuery<SponsorThanksEntry[]>({
    queryKey: ["/api/conversations", conversationId, "sponsor-thanks"],
    queryFn: async () => {
      const res = await fetch(`/api/conversations/${conversationId}/sponsor-thanks`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!conversationId && monetizationEnabled,
  });

  if (!monetizationEnabled) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-sm font-medium">{t.sponsorThanksTitle}</p>
      {sponsors.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.sponsorThanksEmpty}</p>
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
    </div>
  );
}
