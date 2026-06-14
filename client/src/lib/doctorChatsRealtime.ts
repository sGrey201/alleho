import type { InfiniteData, QueryClient } from "@tanstack/react-query";

export type DoctorChatsUpdatedPayload = {
  timestamp: string | null;
};

type PaginatedChatsPage = {
  items: unknown[];
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
};

/** Apply doctor_chats_updated WS payload (invalidate chat list). */
export function applyDoctorChatsUpdated(
  queryClient: QueryClient,
  _payload: DoctorChatsUpdatedPayload,
  _currentUserId: string | undefined
): void {
  void queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
  void queryClient.invalidateQueries({ queryKey: ["/api/me/chats/unread-summary"] });
}
