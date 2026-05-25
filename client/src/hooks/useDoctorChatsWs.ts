import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";
import {
  applyDoctorChatsUpdated,
  type DoctorChatsUpdatedPayload,
} from "@/lib/doctorChatsRealtime";

/** Personal channel for doctors: list updates + health wall message payloads. */
export function useDoctorChatsWs(enabled: boolean): void {
  const { isAuthenticated, isAdmin, user } = useAuth();

  useEffect(() => {
    if (!enabled || !isAuthenticated || !isAdmin) return;

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
  }, [enabled, isAuthenticated, isAdmin, user?.id]);
}
