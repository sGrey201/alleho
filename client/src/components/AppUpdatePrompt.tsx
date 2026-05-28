import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";

const UPDATE_RELOAD_GUARD_KEY = "pwa-update-reload-attempted";

export function AppUpdatePrompt() {
  const [isUpdating, setIsUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
  });

  useEffect(() => {
    if (!needRefresh) {
      const timer = window.setTimeout(() => {
        sessionStorage.removeItem(UPDATE_RELOAD_GUARD_KEY);
      }, 5000);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [needRefresh]);

  if (!needRefresh) return null;

  const dismiss = () => setNeedRefresh(false);

  const applyUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);

    const alreadyReloaded = sessionStorage.getItem(UPDATE_RELOAD_GUARD_KEY) === "1";
    if (!alreadyReloaded) {
      sessionStorage.setItem(UPDATE_RELOAD_GUARD_KEY, "1");
    }

    try {
      await updateServiceWorker(true);
      window.setTimeout(() => {
        window.location.reload();
      }, 1200);
    } finally {
      if (alreadyReloaded) {
        setNeedRefresh(false);
        setIsUpdating(false);
      }
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[110] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="text-sm text-foreground">Доступна новая версия приложения</p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={isUpdating}>
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
