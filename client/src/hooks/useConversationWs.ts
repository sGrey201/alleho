import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

export interface ConversationMessageWithAuthor {
  id: string;
  conversationId: string;
  authorUserId: string;
  messageType: string;
  content?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  author: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    isAdmin?: boolean | null;
  };
}

type ConversationSeenPayload = {
  conversationId: string;
  userId: string;
  lastSeenAt: string;
};

export function useConversationWs(conversationId: string | undefined, enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  useEffect(() => {
    if (!enabled || !conversationId) return;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "subscribe_conversation", conversationId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === "conversation_message" && data.payload) {
            const payload = data.payload as ConversationMessageWithAuthor;
            if (payload.conversationId !== conversationIdRef.current) return;
            queryClient.setQueryData<ConversationMessageWithAuthor[]>(
              ["/api/conversations", conversationIdRef.current, "messages"],
              (old) => {
                if (!old) return old;
                const exists = old.some((m) => m.id === payload.id);
                if (exists) return old;
                return [...old, payload];
              }
            );
          } else if (data.type === "conversation_seen" && data.payload) {
            const payload = data.payload as ConversationSeenPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            queryClient.setQueryData(
              ["/api/conversations", conversationIdRef.current],
              (old: unknown) => {
                if (!old || typeof old !== "object" || old === null) return old;
                const conv = old as { participants?: Array<{ userId: string; lastSeenAt?: string | null }> };
                if (!Array.isArray(conv.participants)) return old;
                return {
                  ...conv,
                  participants: conv.participants.map((participant) =>
                    participant.userId === payload.userId
                      ? { ...participant, lastSeenAt: payload.lastSeenAt }
                      : participant
                  ),
                };
              }
            );
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (conversationIdRef.current) {
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
          wsRef.current.send(JSON.stringify({ type: "unsubscribe_conversation", conversationId }));
        }
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, conversationId]);
}
