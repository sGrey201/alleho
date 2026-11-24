import { useState, type ReactNode } from "react";
import type { PwaInstallBrowser } from "@/components/PwaInstallInstructionsSheet";
import { usePwaInstall } from "@/hooks/usePwaInstall";

type PwaInstallMenuFooterProps = {
  showInstallButtons: boolean;
  onSafariClick: () => void;
  onChromeClick: () => void;
  onYandexClick: () => void;
};

function iosInstallBrowser(): PwaInstallBrowser | null {
  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) return null;
  if (/YaBrowser/i.test(ua)) return "yandex";
  if (/CriOS/i.test(ua)) return "chrome";
  return "safari";
}

function ChipIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-[#6F7047]"
    >
      {children}
    </svg>
  );
}

export function PwaInstallMenuFooter({
  showInstallButtons,
  onSafariClick,
  onChromeClick,
  onYandexClick,
}: PwaInstallMenuFooterProps) {
  const [hintVisible, setHintVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const { canNativeInstall, triggerNativeInstall } = usePwaInstall(showInstallButtons);
  const showBanner = showInstallButtons && !installed;

  const openForBrowser: Record<PwaInstallBrowser, () => void> = {
    safari: onSafariClick,
    chrome: onChromeClick,
    yandex: onYandexClick,
  };

  const onAdd = () => {
    if (canNativeInstall) {
      void triggerNativeInstall().then((accepted) => {
        if (accepted) setInstalled(true);
      });
      return;
    }
    const browser = iosInstallBrowser();
    if (browser) {
      openForBrowser[browser]();
      return;
    }
    setHintVisible(true);
  };

  return (
    <div className="mt-auto shrink-0 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      {showBanner ? (
        <section
          aria-label="Установка приложения"
          className="flex flex-col gap-2.5 rounded-[20px] border border-[#DFE2CF] bg-[#EEF0E4] p-3 text-[#232A35]"
        >
          <p className="m-0 text-center text-[17px] font-bold leading-[1.3]">WebApp Hovial</p>

          <ul className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0">
            <li className="flex items-center gap-[5px] rounded-full bg-white px-[9px] py-1 text-xs font-semibold leading-tight">
              <ChipIcon>
                <path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15 6 8.5" />
                <path d="M10.3 20.5a2 2 0 0 0 3.4 0" />
              </ChipIcon>
              Push-уведомления
            </li>
            <li className="flex items-center gap-[5px] rounded-full bg-white px-[9px] py-1 text-xs font-semibold leading-tight">
              <ChipIcon>
                <path d="M14.5 3.5h6v6" />
                <path d="M9.5 20.5h-6v-6" />
                <path d="M20.5 3.5l-7 7" />
                <path d="M3.5 20.5l7-7" />
              </ChipIcon>
              Во весь экран
            </li>
            <li className="flex items-center gap-[5px] rounded-full bg-white px-[9px] py-1 text-xs font-semibold leading-tight">
              <ChipIcon>
                <path d="M3 3l18 18" />
                <path d="M8.5 16.4a5 5 0 0 1 7 0" />
                <path d="M5 12.9a10 10 0 0 1 4.3-2.6" />
                <path d="M14.8 10.3a10 10 0 0 1 4.2 2.6" />
                <path d="M2 9a15 15 0 0 1 4-2.7" />
                <path d="M10.5 5.6A15 15 0 0 1 22 9" />
                <path d="M12 20h.01" />
              </ChipIcon>
              Работает офлайн
            </li>
            <li className="flex items-center gap-[5px] rounded-full bg-white px-[9px] py-1 text-xs font-semibold leading-tight">
              <ChipIcon>
                <path d="M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z" />
              </ChipIcon>
              Скорость ×3
            </li>
          </ul>

          <button
            type="button"
            onClick={onAdd}
            className="flex h-[46px] w-full items-center justify-center gap-2.5 rounded-[14px] bg-[#6F7047] px-4 text-base font-bold text-white transition-colors hover:bg-[#45462A] active:scale-[0.98] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#45462A]"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="shrink-0"
            >
              <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
              <path d="M12 8v8" />
              <path d="M8 12h8" />
            </svg>
            Установить
          </button>

          {hintVisible ? (
            <p className="m-0 text-center text-sm leading-snug text-[#59606B]" role="status">
              Откройте меню браузера (⋮) и выберите «Установить приложение» или «Добавить на главный экран».
            </p>
          ) : null}
        </section>
      ) : (
        <div className="mx-auto max-w-[200px]">
          <img
            src="/auth-logo.png"
            alt="hovial"
            className="h-auto w-full object-contain"
            loading="eager"
            decoding="async"
          />
        </div>
      )}
    </div>
  );
}
