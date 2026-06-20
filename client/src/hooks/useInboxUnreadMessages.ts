import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

type MessengerUnreadSummary = {
  inboxUnreadMessages?: number;
};

/** Unread message count in direct, patient, and group chats (channels excluded). */
export function useInboxUnreadMessages(): number {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery<MessengerUnreadSummary>({
    queryKey: ["/api/me/chats/unread-summary"],
    queryFn: async () => {
      const res = await fetch("/api/me/chats/unread-summary", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  return data?.inboxUnreadMessages ?? 0;
}
