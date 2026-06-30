import type { InfiniteData } from "@tanstack/react-query";
import type { ConversationMessageWithAuthor } from "@/hooks/useConversationWs";
import { queryClient } from "@/lib/queryClient";

export type ConversationMessagesPage = {
  items: ConversationMessageWithAuthor[];
  hasMore: boolean;
  nextBefore: string | null;
};

export type ConversationMessagesInfiniteData = InfiniteData<
  ConversationMessagesPage,
  string | undefined
>;

export const CONVERSATION_MESSAGES_PAGE_SIZE = 30;

export function conversationMessagesQueryKey(conversationId: string) {
  return ["/api/conversations", conversationId, "messages"] as const;
}

/** Chronological order (oldest → newest). Page 0 is the newest batch. */
export function flattenConversationMessages(
  data: ConversationMessagesInfiniteData | undefined
): ConversationMessageWithAuthor[] {
  if (!data?.pages?.length) return [];
  return [...data.pages].reverse().flatMap((page) => page.items);
}

export function appendConversationMessage(
  old: ConversationMessagesInfiniteData | undefined,
  msg: ConversationMessageWithAuthor
): ConversationMessagesInfiniteData {
  if (!old?.pages?.length) {
    return {
      pages: [{ items: [msg], hasMore: false, nextBefore: null }],
      pageParams: [undefined],
    };
  }
  const firstPage = old.pages[0]!;
  if (firstPage.items.some((m) => m.id === msg.id)) return old;
  return {
    ...old,
    pages: [{ ...firstPage, items: [...firstPage.items, msg] }, ...old.pages.slice(1)],
  };
}

export function updateConversationMessagesList(
  old: ConversationMessagesInfiniteData | undefined,
  listUpdater: (list: ConversationMessageWithAuthor[]) => ConversationMessageWithAuthor[]
): ConversationMessagesInfiniteData | undefined {
  if (!old?.pages?.length) return old;
  const flat = flattenConversationMessages(old);
  const updated = listUpdater(flat);
  if (updated === flat) return old;
  let idx = 0;
  const pages = old.pages.map((page) => {
    const items = updated.slice(idx, idx + page.items.length);
    idx += page.items.length;
    return items === page.items ? page : { ...page, items };
  });
  return { ...old, pages };
}

export function setConversationMessagesQueryData(
  conversationId: string,
  updater: (
    old: ConversationMessagesInfiniteData | undefined
  ) => ConversationMessagesInfiniteData | undefined
): void {
  queryClient.setQueryData<ConversationMessagesInfiniteData>(
    conversationMessagesQueryKey(conversationId),
    updater
  );
}
