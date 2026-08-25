import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

const VERSION_POLL_MS = 5 * 60 * 1000;
const SW_RETRY_MS = 2_000;
const SW_RETRY_FOR_MS = 30_000;

async function fetchAppVersion(): Promise<string | null> {
  try {
    const res = await fetch("/api/app-version", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" && body.version.trim() ? body.version.trim() : null;
  } catch {
    return null;
  }
}

export function AppUpdatePrompt() {
  const [isUpdating, setIsUpdating] = useState(false);
  const knownVersionRef = useRef<string | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registration?.update();
    },
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const retryTimers: number[] = [];

    const pokeServiceWorker = () => {
      void navigator.serviceWorker.ready.then((registration) => registration.update());
    };

    const onRemoteVersion = (version: string) => {
      if (!knownVersionRef.current) {
        knownVersionRef.current = version;
        return;
      }
      if (knownVersionRef.current === version) return;
      knownVersionRef.current = version;
      pokeServiceWorker();
      const started = Date.now();
      const retryId = window.setInterval(() => {
        if (Date.now() - started > SW_RETRY_FOR_MS) {
          window.clearInterval(retryId);
          return;
        }
        pokeServiceWorker();
      }, SW_RETRY_MS);
      retryTimers.push(retryId);
    };

    const checkVersion = () => {
      void fetchAppVersion().then((version) => {
        if (version) onRemoteVersion(version);
      });
    };

    checkVersion();
    const pollId = window.setInterval(checkVersion, VERSION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") checkVersion();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(pollId);
      for (const id of retryTimers) window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!needRefresh) return;
    setIsUpdating(false);
  }, [needRefresh]);

  if (!needRefresh) return null;

  const applyUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await updateServiceWorker(true);
    } catch {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[110] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="text-sm text-foreground">Доступна новая версия приложения</p>
        <Button type="button" size="sm" onClick={applyUpdate} disabled={isUpdating}>
          {isUpdating ? "Обновляем..." : "Обновить"}
        </Button>
      </div>
    </div>
  );
}
