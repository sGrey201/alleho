/** Keep conversation data fresh when opening a chat or returning to the PWA. */
export const liveConversationQueryOptions = {
  staleTime: 30_000,
  refetchOnMount: true as const,
  refetchOnWindowFocus: true,
};
