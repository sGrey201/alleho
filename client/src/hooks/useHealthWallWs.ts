import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

export interface HealthWallMessageWithAuthor {
  id: string;
  patientUserId: string;
  authorUserId: string;
  messageType: "message" | "prescription" | "followup";
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

export function useHealthWallWs(patientUserId: string | undefined, enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patientUserIdRef = useRef(patientUserId);

  patientUserIdRef.current = patientUserId;

  useEffect(() => {
    if (!enabled || !patientUserId) return;

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
              ["/api/health-wall", patientUserIdRef.current],
              (old) => {
                if (!old) return old;
                const exists = old.some((m) => m.id === payload.id);
                if (exists) return old;
                return [...old, payload];
              }
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
        wsRef.current.send(JSON.stringify({ type: "unsubscribe", patientUserId }));
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, patientUserId]);
}
