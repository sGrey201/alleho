import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function AppUpdatePrompt() {
  const [isUpdating, setIsUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      registration?.update();
    },
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const checkForUpdates = () => {
      void navigator.serviceWorker.ready.then((registration) => registration.update());
    };

    checkForUpdates();
    const intervalId = window.setInterval(checkForUpdates, UPDATE_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        checkForUpdates();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(intervalId);
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
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNeedRefresh(false)}
            disabled={isUpdating}
          >
            Позже
          </Button>
          <Button type="button" size="sm" onClick={applyUpdate} disabled={isUpdating}>
            {isUpdating ? "Обновляем..." : "Обновить"}
          </Button>
        </div>
      </div>
    </div>
  );
}
