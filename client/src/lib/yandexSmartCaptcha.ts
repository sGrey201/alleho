import { t } from "@/lib/i18n";

/** Public SmartCaptcha site key. The server secret stays in YANDEX_SMARTCAPTCHA_SECRET. */
export const YANDEX_SMARTCAPTCHA_CLIENT_KEY =
  "ysc1_nhkrv1pSzS4ySWcbgdcy5bru2Elnht9cgPL5PqpOc1b6252b";

export const YANDEX_SMARTCAPTCHA_SCRIPT = "https://smartcaptcha.yandexcloud.net/captcha.js";

type SmartCaptchaApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      hl?: string;
      callback?: (token: string) => void;
    }
  ) => number;
  reset: (widgetId?: number) => void;
  destroy: (widgetId?: number) => void;
};

declare global {
  interface Window {
    smartCaptcha?: SmartCaptchaApi;
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadYandexSmartCaptcha(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.smartCaptcha) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.smartCaptcha) resolve();
      else reject(new Error("captcha_unavailable"));
    };
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${YANDEX_SMARTCAPTCHA_SCRIPT}"]`
    );
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("captcha_unavailable")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = YANDEX_SMARTCAPTCHA_SCRIPT;
    script.async = true;
    script.onload = finish;
    script.onerror = () => reject(new Error("captcha_unavailable"));
    document.head.appendChild(script);
  });
  scriptPromise.catch(() => {
    scriptPromise = null;
  });
  return scriptPromise;
}

export function captchaErrorText(message: string): string | null {
  if (message.includes("captcha_required")) return t.captchaRequired;
  if (message.includes("captcha_failed")) return t.captchaFailed;
  if (message.includes("captcha_unavailable")) return t.captchaUnavailable;
  return null;
}
