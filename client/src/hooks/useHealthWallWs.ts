import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import { clearHealthWallUnread } from "@/lib/doctorChatsRealtime";
import { bumpHealthWallPatientInList } from "@/lib/healthWallPatientList";

export interface HealthWallMessageAuthor {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isAdmin?: boolean | null;
}

export interface HealthWallMessageReplyTo {
  id: string;
  authorUserId: string;
  content?: string | null;
  imageUrl?: string | null;
  deletedAt?: string | null;
  author?: HealthWallMessageAuthor | null;
}

export interface HealthWallMessageWithAuthor {
  id: string;
  patientUserId: string;
  authorUserId: string;
  messageType: "message" | "prescription" | "followup";
  content?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  pinnedByUserId?: string | null;
  replyToMessageId?: string | null;
  forwardedFromMessageId?: string | null;
  forwardedFromUserId?: string | null;
  replyTo?: HealthWallMessageReplyTo | null;
  forwardedFromAuthor?: HealthWallMessageAuthor | null;
  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  author: HealthWallMessageAuthor;
}

type HealthWallMessageEditedPayload = {
  patientUserId: string;
  messageId: string;
  content: string | null;
  editedAt: string;
};

type HealthWallMessageDeletedPayload = {
  patientUserId: string;
  messageId: string;
  deletedAt: string;
};

type HealthWallMessagePinnedPayload = {
  patientUserId: string;
  messageId: string;
  pinnedAt: string;
  pinnedByUserId: string;
};

type HealthWallMessageUnpinnedPayload = {
  patientUserId: string;
  messageId: string;
};

type HealthWallSeenPayload = {
  patientUserId: string;
  userId: string;
  lastVisitedAt: string;
  role: "doctor" | "patient";
};

type PatientInfoCache = {
  patientLastVisitedAt?: string;
  [key: string]: unknown;
};

type ConnectedDoctorCache = {
  doctorUserId: string;
  lastVisitedAt?: string;
  [key: string]: unknown;
};

export function useHealthWallWs(
  patientUserId: string | undefined,
  enabled: boolean,
  currentUserId?: string
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patientUserIdRef = useRef(patientUserId);
  const currentUserIdRef = useRef(currentUserId);
  const markSeenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  patientUserIdRef.current = patientUserId;
  currentUserIdRef.current = currentUserId;

  useEffect(() => {
    if (!enabled || !patientUserId) return;

    const messagesKey = () => ["/api/health-wall", patientUserIdRef.current];

    const updateMessages = (
      updater: (list: HealthWallMessageWithAuthor[]) => HealthWallMessageWithAuthor[]
    ) => {
      queryClient.setQueryData<HealthWallMessageWithAuthor[]>(messagesKey(), (old) => {
        const base = old ?? [];
        const updated = updater(base);
        return old === updated ? old : updated;
      });
    };

    const scheduleMarkSeen = () => {
      const pid = patientUserIdRef.current;
      if (!pid || !currentUserIdRef.current) return;
      if (markSeenTimeoutRef.current) clearTimeout(markSeenTimeoutRef.current);
      markSeenTimeoutRef.current = setTimeout(() => {
        markSeenTimeoutRef.current = null;
        void fetch(`/api/health-wall/${pid}/seen`, {
          method: "POST",
          credentials: "include",
        })
          .then((res) => {
            if (res.ok) clearHealthWallUnread(queryClient, pid);
          })
          .catch(() => {});
      }, 400);
    };

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "subscribe", patientUserId }));
        scheduleMarkSeen();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === "health_wall_message" && data.payload) {
            const payload = data.payload as HealthWallMessageWithAuthor;
            if (payload.patientUserId !== patientUserIdRef.current) return;
            queryClient.setQueryData<HealthWallMessageWithAuthor[]>(
              messagesKey(),
              (old) => {
                const list = old ?? [];
                if (list.some((m) => m.id === payload.id)) return old;
                return [...list, payload];
              }
            );
            queryClient.setQueryData<
              Array<{ patientUserId: string; lastMessageAt?: string; unreadCount?: number }>
            >(["/api/health-wall/my/patients"], (old) => {
              if (!old?.length) return old;
              const patch: { lastMessageAt: string; unreadCount?: number } = {
                lastMessageAt: payload.createdAt,
              };
              if (
                payload.authorUserId !== currentUserIdRef.current &&
                payload.authorUserId === payload.patientUserId
              ) {
                const row = old.find((p) => p.patientUserId === payload.patientUserId);
                patch.unreadCount = (row?.unreadCount ?? 0) + 1;
              }
              return bumpHealthWallPatientInList(old, payload.patientUserId, patch);
            });
            if (payload.authorUserId !== currentUserIdRef.current) {
              scheduleMarkSeen();
            }
          } else if (data.type === "health_wall_seen" && data.payload) {
            const payload = data.payload as HealthWallSeenPayload;
            if (payload.patientUserId !== patientUserIdRef.current) return;
            if (payload.role === "patient") {
              if (payload.userId === currentUserIdRef.current) return;
              queryClient.setQueryData<PatientInfoCache>(
                ["/api/health-wall", patientUserIdRef.current, "info"],
                (old) =>
                  old ? { ...old, patientLastVisitedAt: payload.lastVisitedAt } : old
              );
            } else if (payload.role === "doctor") {
              if (payload.userId === currentUserIdRef.current) {
                clearHealthWallUnread(queryClient, payload.patientUserId);
                return;
              }
              queryClient.setQueryData<ConnectedDoctorCache[]>(
                ["/api/health-wall/my/doctors"],
                (old) =>
                  old?.map((d) =>
                    d.doctorUserId === payload.userId
                      ? { ...d, lastVisitedAt: payload.lastVisitedAt }
                      : d
                  ) ?? old
              );
            }
          } else if (data.type === "health_wall_message_edited" && data.payload) {
            const payload = data.payload as HealthWallMessageEditedPayload;
            if (payload.patientUserId !== patientUserIdRef.current) return;
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId
                  ? { ...m, content: payload.content, editedAt: payload.editedAt }
                  : {
                      ...m,
                      replyTo:
                        m.replyTo && m.replyTo.id === payload.messageId
                          ? { ...m.replyTo, content: payload.content }
                          : m.replyTo,
                    }
              )
            );
          } else if (data.type === "health_wall_message_deleted" && data.payload) {
            const payload = data.payload as HealthWallMessageDeletedPayload;
            if (payload.patientUserId !== patientUserIdRef.current) return;
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId
                  ? {
                      ...m,
                      deletedAt: payload.deletedAt,
                      content: null,
                      imageUrl: null,
                      pinnedAt: null,
                      pinnedByUserId: null,
                    }
                  : {
                      ...m,
                      replyTo:
                        m.replyTo && m.replyTo.id === payload.messageId
                          ? { ...m.replyTo, deletedAt: payload.deletedAt, content: null, imageUrl: null }
                          : m.replyTo,
                    }
              )
            );
          } else if (data.type === "health_wall_message_pinned" && data.payload) {
            const payload = data.payload as HealthWallMessagePinnedPayload;
            if (payload.patientUserId !== patientUserIdRef.current) return;
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId
                  ? { ...m, pinnedAt: payload.pinnedAt, pinnedByUserId: payload.pinnedByUserId }
                  : m
              )
            );
          } else if (data.type === "health_wall_message_unpinned" && data.payload) {
            const payload = data.payload as HealthWallMessageUnpinnedPayload;
            if (payload.patientUserId !== patientUserIdRef.current) return;
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId ? { ...m, pinnedAt: null, pinnedByUserId: null } : m
              )
            );
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (patientUserIdRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      if (markSeenTimeoutRef.current) {
        clearTimeout(markSeenTimeoutRef.current);
        markSeenTimeoutRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "unsubscribe", patientUserId }));
        }
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, patientUserId, currentUserId]);
}
