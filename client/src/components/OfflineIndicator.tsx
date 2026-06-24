import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { t } from "@/lib/i18n";

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[120] bg-amber-600 px-3 py-1.5 text-center text-xs font-medium text-white pt-[max(0.375rem,env(safe-area-inset-top))]"
      role="status"
      aria-live="polite"
    >
      {t.offlineBanner}
    </div>
  );
}
