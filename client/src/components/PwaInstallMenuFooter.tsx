import { useState } from "react";
import { Bell, Maximize2, Smartphone, Zap } from "lucide-react";
import { AuthLogoLink } from "@/components/AuthLogoLink";
import { ChromeBrowserIcon, SafariBrowserIcon, YandexBrowserIcon } from "@/components/PwaBrowserIcons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type PwaInstallMenuFooterProps = {
  showInstallButtons: boolean;
  onSafariClick: () => void;
  onChromeClick: () => void;
  onYandexClick: () => void;
};

const browserButtonClass =
  "flex-1 h-auto min-h-11 py-2.5 flex-col gap-1.5 min-w-0 px-2";

const INSTALL_BENEFITS = [
  { icon: Zap, text: t.installAppBenefitQuickOffline },
  { icon: Bell, text: t.installAppBenefitPush },
  { icon: Maximize2, text: t.installAppBenefitFullscreen },
] as const;

export function PwaInstallMenuFooter({
  showInstallButtons,
  onSafariClick,
  onChromeClick,
  onYandexClick,
}: PwaInstallMenuFooterProps) {
  const [showBrowsers, setShowBrowsers] = useState(false);

  return (
    <div className="mt-auto shrink-0 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
      {showInstallButtons ? (
        <div className="space-y-3">
          {!showBrowsers ? (
            <div className="rounded-2xl border border-border/60 bg-muted/25 px-4 py-3.5 space-y-3">
              <div className="flex items-start justify-center gap-2 text-center">
                <Smartphone className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden />
                <p className="text-sm font-semibold leading-snug text-foreground">{t.installAppHeading}</p>
              </div>
              <ul className="space-y-2">
                {INSTALL_BENEFITS.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                    </span>
                    <span className="leading-snug">{text}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setShowBrowsers(true)}
                className="w-full text-center text-sm font-medium text-primary hover:underline"
              >
                {t.installAppInstructionsLink}
              </button>
            </div>
          ) : null}

          <div
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
              showBrowsers ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-2 pt-1">
                <p className="text-center text-xs font-medium text-muted-foreground">{t.installAppLabel}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className={browserButtonClass} onClick={onSafariClick}>
                    <SafariBrowserIcon />
                    <span className="text-xs leading-tight text-center">{t.installAppSafari}</span>
                  </Button>
                  <Button type="button" variant="outline" className={browserButtonClass} onClick={onChromeClick}>
                    <ChromeBrowserIcon />
                    <span className="text-xs leading-tight text-center">{t.installAppChrome}</span>
                  </Button>
                  <Button type="button" variant="outline" className={browserButtonClass} onClick={onYandexClick}>
                    <YandexBrowserIcon />
                    <span className="text-xs leading-tight text-center">{t.installAppYandex}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <AuthLogoLink href="/messenger" className="mx-auto max-w-[200px]" />
      )}
    </div>
  );
}
