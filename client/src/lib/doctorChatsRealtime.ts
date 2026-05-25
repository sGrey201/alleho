import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { HealthWallMessageWithAuthor } from "@/hooks/useHealthWallWs";
import { bumpHealthWallPatientInList } from "@/lib/healthWallPatientList";

export type DoctorHealthWallChatUpdate = {
  patientUserId: string;
  message: HealthWallMessageWithAuthor;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unreadCount: number;
};

export type DoctorChatsUpdatedPayload = {
  timestamp: string | null;
  healthWall?: DoctorHealthWallChatUpdate;
};

type PaginatedChatsPage = {
  items: Array<{
    source: string;
    patientUserId?: string;
    lastMessageAt?: string | null;
    lastMessagePreview?: string | null;
    unreadCount?: number;
    [key: string]: unknown;
  }>;
  hasMore: boolean;
  nextOffset: number | null;
  total: number;
};

function appendHealthWallMessage(
  queryClient: QueryClient,
  update: DoctorHealthWallChatUpdate
): void {
  const { patientUserId, message } = update;
  const messagesKey = ["/api/health-wall", patientUserId] as const;

  queryClient.setQueryData<HealthWallMessageWithAuthor[]>(messagesKey, (old) => {
    const list = old ?? [];
    if (list.some((m) => m.id === message.id)) return old;
    return [...list, message];
  });
}

function patchMeChatsHealthWall(
  queryClient: QueryClient,
  update: DoctorHealthWallChatUpdate
): boolean {
  const queries = queryClient.getQueriesData<InfiniteData<PaginatedChatsPage>>({
    queryKey: ["/api/me/chats"],
  });
  let found = false;

  for (const [queryKey, data] of queries) {
    if (!data?.pages?.length) continue;
    const all = data.pages.flatMap((p) => p.items);
    const idx = all.findIndex(
      (c) => c.source === "health_wall" && c.patientUserId === update.patientUserId
    );
    if (idx < 0) continue;
    found = true;

    const updatedItem = {
      ...all[idx],
      lastMessageAt: update.lastMessageAt,
      lastMessagePreview: update.lastMessagePreview,
      unreadCount: update.unreadCount,
    };
    const reordered = [updatedItem, ...all.filter((_, i) => i !== idx)];

    let offset = 0;
    const pages = data.pages.map((page) => {
      const size = page.items.length;
      const items = reordered.slice(offset, offset + size);
      offset += size;
      return { ...page, items };
    });

    queryClient.setQueryData(queryKey, { ...data, pages });
  }

  return found;
}

function patchMyPatientsHealthWall(
  queryClient: QueryClient,
  update: DoctorHealthWallChatUpdate
): void {
  queryClient.setQueryData<
    Array<{
      patientUserId: string;
      lastMessageAt?: string;
      unreadCount?: number;
      [key: string]: unknown;
    }>
  >(["/api/health-wall/my/patients"], (old) => {
    if (!old?.length) return old;
    const next = bumpHealthWallPatientInList(old, update.patientUserId, {
      lastMessageAt: update.lastMessageAt,
      unreadCount: update.unreadCount,
    });
    return next === old ? old : next;
  });
}

/** Zero unread badge for a patient in HealthWall sidebar and Messenger chat list. */
export function clearHealthWallUnread(queryClient: QueryClient, patientUserId: string): void {
  queryClient.setQueryData<
    Array<{ patientUserId: string; unreadCount?: number; [key: string]: unknown }>
  >(["/api/health-wall/my/patients"], (old) => {
    if (!old?.length) return old;
    let changed = false;
    const next = old.map((p) => {
      if (p.patientUserId !== patientUserId) return p;
      if ((p.unreadCount ?? 0) === 0) return p;
      changed = true;
      return { ...p, unreadCount: 0 };
    });
    return changed ? next : old;
  });

  queryClient.setQueriesData<InfiniteData<PaginatedChatsPage>>({ queryKey: ["/api/me/chats"] }, (old) => {
    if (!old?.pages?.length) return old;
    let changed = false;
    const pages = old.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => {
        if (item.source !== "health_wall" || item.patientUserId !== patientUserId) return item;
        if ((item.unreadCount ?? 0) === 0) return item;
        changed = true;
        return { ...item, unreadCount: 0 };
      }),
    }));
    return changed ? { ...old, pages } : old;
  });
}

/** Apply doctor_chats_updated WS payload (list + open health wall cache). */
export function applyDoctorChatsUpdated(
  queryClient: QueryClient,
  payload: DoctorChatsUpdatedPayload,
  _currentUserId: string | undefined
): void {
  const hw = payload.healthWall;
  if (hw) {
    appendHealthWallMessage(queryClient, hw);
    patchMyPatientsHealthWall(queryClient, hw);
    const found = patchMeChatsHealthWall(queryClient, hw);
    if (!found) {
      void queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
    }
    return;
  }

  if (payload.timestamp) {
    void queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
  }
}
