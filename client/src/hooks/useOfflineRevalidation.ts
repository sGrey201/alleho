import { useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

const MESSENGER_REFETCH_KEYS = [
  ["/api/me/chats"],
  ["/api/me/chats/unread-summary"],
] as const;

function refetchMessengerQueries() {
  for (const queryKey of MESSENGER_REFETCH_KEYS) {
    void queryClient.invalidateQueries({ queryKey });
  }
  void queryClient.invalidateQueries({
    predicate: (query) =>
      Array.isArray(query.queryKey) &&
      query.queryKey[0] === "/api/conversations" &&
      query.queryKey[2] === "messages",
  });
}

/** Background sync when network returns or tab becomes visible again. */
export function useOfflineRevalidation(enabled: boolean) {
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (!enabled || !isOnline) return;
    refetchMessengerQueries();
  }, [enabled, isOnline]);

  useEffect(() => {
    if (!enabled) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      refetchMessengerQueries();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);
}
