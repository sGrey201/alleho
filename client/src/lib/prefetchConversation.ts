import { fetchJson, queryClient } from "@/lib/queryClient";
import {
  CONVERSATION_MESSAGES_PAGE_SIZE,
  conversationMessagesQueryKey,
} from "@/lib/conversationMessagesCache";
import { liveConversationQueryOptions } from "@/lib/conversationQueryOptions";

/** Start the chat card and the first message page before the route commits. */
export function prefetchConversationOpen(conversationId: string) {
  void queryClient.prefetchQuery({
    queryKey: ["/api/conversations", conversationId],
    queryFn: ({ signal }) => fetchJson(`/api/conversations/${conversationId}`, { signal }),
    ...liveConversationQueryOptions,
  });
  void queryClient.prefetchInfiniteQuery({
    queryKey: conversationMessagesQueryKey(conversationId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        limit: String(CONVERSATION_MESSAGES_PAGE_SIZE),
      });
      if (pageParam) params.set("before", pageParam);
      return fetchJson(
        `/api/conversations/${conversationId}/messages?${params}`,
        { signal },
      );
    },
    ...liveConversationQueryOptions,
  });
}
