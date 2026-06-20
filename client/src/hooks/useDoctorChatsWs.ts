import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import {
  applyDoctorChatsUpdated,
  type DoctorChatsUpdatedPayload,
} from "@/lib/doctorChatsRealtime";

/** Personal channel for messenger chat list updates (doctors and patients). */
export function useDoctorChatsWs(enabled: boolean): void {
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!enabled || !isAuthenticated) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          payload?: DoctorChatsUpdatedPayload;
        };
        if (data.type !== "doctor_chats_updated" || !data.payload) return;
        applyDoctorChatsUpdated(queryClient, data.payload, user?.id);
      } catch {
        // ignore malformed ws payloads
      }
    };

    return () => {
      ws.close();
    };
  }, [enabled, isAuthenticated, user?.id]);
}
