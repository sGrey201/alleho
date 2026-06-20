/** Keep conversation data fresh when opening a chat or returning to the PWA. */
export const liveConversationQueryOptions = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
};
