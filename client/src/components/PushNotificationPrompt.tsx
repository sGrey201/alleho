import { Button } from "@/components/ui/button";
import { Bell, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

type PushNotificationPromptProps = {
  enabled: boolean;
};

export function PushNotificationPrompt({ enabled }: PushNotificationPromptProps) {
  const { showPrompt, isSubscribing, subscribe, dismissPrompt, isPushSupported } =
    usePushNotifications(enabled);

  if (!enabled || !isPushSupported || !showPrompt) return null;

  return (
    <div
      className="fixed bottom-20 left-3 right-3 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-lg md:bottom-6 md:left-auto md:right-6"
      role="dialog"
      aria-label="Включить уведомления"
    >
      <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Уведомления о сообщениях</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Получайте push, когда приходит новое сообщение. Нажатие откроет нужный чат.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={isSubscribing} onClick={() => void subscribe()}>
            {isSubscribing ? "Подключение…" : "Включить"}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismissPrompt}>
            Не сейчас
          </Button>
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
        onClick={dismissPrompt}
        aria-label="Закрыть"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
