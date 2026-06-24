import type { DehydratedState } from "@tanstack/react-query";
import type { ConversationMessagesInfiniteData } from "@/lib/conversationMessagesCache";
import {
  MAX_MESSAGE_PAGES_PER_CONVERSATION,
  MAX_PERSISTED_CONVERSATIONS,
} from "@/lib/offlineCacheConfig";

export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
  const root = String(queryKey[0]);
  if (root === "/api/auth/user") return true;
  if (root === "/api/me/chats") return true;
  if (root === "/api/me/chats/unread-summary") return true;
  if (root === "/api/conversations" && queryKey[2] === "messages") return true;
  return false;
}

function trimMessagePages(data: ConversationMessagesInfiniteData): ConversationMessagesInfiniteData {
  if (!data?.pages?.length || data.pages.length <= MAX_MESSAGE_PAGES_PER_CONVERSATION) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.slice(0, MAX_MESSAGE_PAGES_PER_CONVERSATION),
    pageParams: data.pageParams.slice(0, MAX_MESSAGE_PAGES_PER_CONVERSATION),
  };
}

export function trimDehydratedStateForPersistence(state: DehydratedState): DehydratedState {
  const persistable = state.queries.filter((entry) => shouldPersistQueryKey(entry.queryKey));
  const nonMessages = persistable.filter((entry) => String(entry.queryKey[0]) !== "/api/conversations");
  const messageEntries = persistable
    .filter((entry) => String(entry.queryKey[0]) === "/api/conversations")
  .sort((a, b) => (b.state.dataUpdatedAt ?? 0) - (a.state.dataUpdatedAt ?? 0))
    .slice(0, MAX_PERSISTED_CONVERSATIONS)
    .map((entry) => {
      const data = entry.state.data as ConversationMessagesInfiniteData | undefined;
      if (!data) return entry;
      return {
        ...entry,
        state: {
          ...entry.state,
          data: trimMessagePages(data),
        },
      };
    });

  return {
    ...state,
    queries: [...nonMessages, ...messageEntries],
    mutations: [],
  };
}
