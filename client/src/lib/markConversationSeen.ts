import { queryClient } from "@/lib/queryClient";

/** Mark the current user as having read a conversation (explicit open / active view). */
export function postConversationSeen(conversationId: string): void {
  void fetch(`/api/conversations/${conversationId}/seen`, {
    method: "POST",
    credentials: "include",
  })
    .then((res) => {
      if (res.ok) {
        void queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/me/chats/unread-summary"] });
      }
    })
    .catch(() => {});
}
