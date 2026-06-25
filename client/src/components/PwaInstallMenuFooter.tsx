import { AuthLogoLink } from "@/components/AuthLogoLink";
import { ChromeBrowserIcon, SafariBrowserIcon, YandexBrowserIcon } from "@/components/PwaBrowserIcons";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

type PwaInstallMenuFooterProps = {
  showInstallButtons: boolean;
  onSafariClick: () => void;
  onChromeClick: () => void;
  onYandexClick: () => void;
};

const browserButtonClass =
  "flex-1 h-auto min-h-11 py-2.5 flex-col gap-1.5 min-w-0 px-2";

export function PwaInstallMenuFooter({
  showInstallButtons,
  onSafariClick,
  onChromeClick,
  onYandexClick,
}: PwaInstallMenuFooterProps) {
  return (
    <div className="shrink-0 px-4 pt-2 pb-6">
      {showInstallButtons ? (
        <div className="space-y-2">
          <p className="text-center text-sm font-medium text-foreground">{t.installAppLabel}</p>
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
      ) : (
        <AuthLogoLink href="/messenger" className="max-w-[200px] mx-auto" />
      )}
    </div>
  );
}
