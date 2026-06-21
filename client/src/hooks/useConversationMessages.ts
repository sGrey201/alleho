import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  CONVERSATION_MESSAGES_PAGE_SIZE,
  conversationMessagesQueryKey,
  flattenConversationMessages,
  type ConversationMessagesInfiniteData,
  type ConversationMessagesPage,
} from "@/lib/conversationMessagesCache";
import { liveConversationQueryOptions } from "@/lib/conversationQueryOptions";
import type { ConversationMessageWithAuthor } from "@/hooks/useConversationWs";

async function fetchConversationMessagesPage(
  conversationId: string,
  before?: string
): Promise<ConversationMessagesPage> {
  const params = new URLSearchParams({
    limit: String(CONVERSATION_MESSAGES_PAGE_SIZE),
  });
  if (before) params.set("before", before);
  const res = await fetch(`/api/conversations/${conversationId}/messages?${params}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function useConversationMessages(conversationId: string | undefined) {
  const query = useInfiniteQuery<
    ConversationMessagesPage,
    Error,
    ConversationMessagesInfiniteData,
    readonly string[],
    string | undefined
  >({
    queryKey: conversationId ? conversationMessagesQueryKey(conversationId) : ["disabled-messages"],
    queryFn: ({ pageParam }) =>
      fetchConversationMessagesPage(conversationId!, pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.nextBefore ? lastPage.nextBefore : undefined,
    enabled: !!conversationId,
    ...liveConversationQueryOptions,
  });

  const messages: ConversationMessageWithAuthor[] = useMemo(
    () => flattenConversationMessages(query.data),
    [query.data]
  );

  return { ...query, messages };
}
