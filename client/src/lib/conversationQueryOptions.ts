import { offlineMessengerQueryOptions } from "@/lib/offlineQueryOptions";

/** Keep conversation data fresh when opening a chat or returning to the PWA. */
export const liveConversationQueryOptions = {
  ...offlineMessengerQueryOptions,
  staleTime: 30_000,
};
