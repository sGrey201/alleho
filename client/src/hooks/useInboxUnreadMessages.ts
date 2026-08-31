import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { fetchJson } from "@/lib/queryClient";
import { offlineMessengerQueryOptions } from "@/lib/offlineQueryOptions";

type MessengerUnreadSummary = {
  inboxUnreadMessages?: number;
};

/** Unread message count in direct, patient, and group chats (channels excluded). */
export function useInboxUnreadMessages(): number {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery<MessengerUnreadSummary>({
    queryKey: ["/api/me/chats/unread-summary"],
    queryFn: ({ signal }) => fetchJson("/api/me/chats/unread-summary", { signal }),
    enabled: isAuthenticated,
    ...offlineMessengerQueryOptions,
    staleTime: 0,
  });
  return data?.inboxUnreadMessages ?? 0;
}
