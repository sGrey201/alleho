import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import {
  YANDEX_SMARTCAPTCHA_CLIENT_KEY,
  loadYandexSmartCaptcha,
} from "@/lib/yandexSmartCaptcha";

type YandexSmartCaptchaProps = {
  resetSignal?: number;
  onToken: (token: string) => void;
};

export function YandexSmartCaptcha({ resetSignal = 0, onToken }: YandexSmartCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  const [loadFailed, setLoadFailed] = useState(false);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;
    let widgetId: number | null = null;
    setLoadFailed(false);
    loadYandexSmartCaptcha()
      .then(() => {
        if (cancelled || !containerRef.current || !window.smartCaptcha) return;
        widgetId = window.smartCaptcha.render(containerRef.current, {
          sitekey: YANDEX_SMARTCAPTCHA_CLIENT_KEY,
          hl: "ru",
          callback: (token) => onTokenRef.current(token),
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
      if (widgetId != null) window.smartCaptcha?.destroy(widgetId);
    };
  }, [resetSignal]);

  if (loadFailed) {
    return <p className="text-sm text-destructive">{t.captchaLoadError}</p>;
  }

  return <div ref={containerRef} className="min-h-[102px]" />;
}
