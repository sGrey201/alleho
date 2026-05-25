import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

const PROMPT_DISMISSED_KEY = "push-prompt-dismissed-v1";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function usePushNotifications(enabled: boolean) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const subscribedRef = useRef(false);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isPushSupported()) return false;
    setIsSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
        setShowPrompt(false);
        return false;
      }

      const res = await fetch("/api/push/vapid-public-key", { credentials: "include" });
      if (!res.ok) return false;
      const { publicKey } = (await res.json()) as { publicKey: string };
      if (!publicKey) return false;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const json = subscription.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!endpoint || !p256dh || !auth) return false;

      await apiRequest("POST", "/api/push/subscribe", {
        endpoint,
        keys: { p256dh, auth },
      });

      subscribedRef.current = true;
      localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
      setShowPrompt(false);
      return true;
    } catch (err) {
      console.error("[Push] subscribe failed:", err);
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !isPushSupported()) {
      setShowPrompt(false);
      return;
    }

    if (Notification.permission === "granted") {
      if (!subscribedRef.current) {
        void subscribe();
      }
      return;
    }

    if (Notification.permission === "denied") {
      setShowPrompt(false);
      return;
    }

    if (localStorage.getItem(PROMPT_DISMISSED_KEY)) {
      setShowPrompt(false);
      return;
    }

    setShowPrompt(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when `enabled` toggles only
  }, [enabled]);

  const dismissPrompt = useCallback(() => {
    localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
    setShowPrompt(false);
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!isPushSupported()) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      const endpoint = subscription.endpoint;
      await apiRequest("DELETE", "/api/push/subscribe", { endpoint });
      await subscription.unsubscribe();
      subscribedRef.current = false;
    } catch (err) {
      console.error("[Push] unsubscribe failed:", err);
    }
  }, []);

  return {
    isPushSupported: isPushSupported(),
    showPrompt,
    isSubscribing,
    subscribe,
    dismissPrompt,
    unsubscribe,
    permission: typeof Notification !== "undefined" ? Notification.permission : "denied",
  };
}
