import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

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

export function useHealthWallWs(patientUserId: string | undefined, enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patientUserIdRef = useRef(patientUserId);

  patientUserIdRef.current = patientUserId;

  useEffect(() => {
    if (!enabled || !patientUserId) return;

    const messagesKey = () => ["/api/health-wall", patientUserIdRef.current];
    const updateMessages = (
      updater: (list: HealthWallMessageWithAuthor[]) => HealthWallMessageWithAuthor[]
    ) => {
      queryClient.setQueryData<HealthWallMessageWithAuthor[]>(messagesKey(), (old) => {
        if (!old) return old;
        return updater(old);
      });
    };

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "subscribe", patientUserId }));
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
                if (!old) return old;
                const exists = old.some((m) => m.id === payload.id);
                if (exists) return old;
                return [...old, payload];
              }
            );
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
  }, [enabled, patientUserId]);
}
