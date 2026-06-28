import { queryClient } from "@/lib/queryClient";

/** Refetch channel access + messages after sponsor payment changes. */
export async function refreshChannelContentAfterSponsorPayment(
  conversationId: string,
  options?: { reloadMessages?: boolean }
): Promise<void> {
  if (options?.reloadMessages) {
    await queryClient.resetQueries({
      queryKey: ["/api/conversations", conversationId, "messages"],
    });
  }

  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["/api/conversations", conversationId] }),
    queryClient.refetchQueries({
      queryKey: ["/api/conversations", conversationId, "sponsor-settings"],
    }),
    queryClient.refetchQueries({
      queryKey: ["/api/conversations", conversationId, "sponsor-payments"],
    }),
    queryClient.refetchQueries({
      queryKey: ["/api/conversations", conversationId, "channel-sponsors"],
    }),
  ]);
}
