import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { t } from "@/lib/i18n";

export type PwaInstallBrowser = "safari" | "chrome" | "yandex";

type PwaInstallInstructionsSheetProps = {
  browser: PwaInstallBrowser | null;
  onOpenChange: (open: boolean) => void;
};

const STEPS_BY_BROWSER: Record<PwaInstallBrowser, string[]> = {
  safari: [t.installAppSafariStep1, t.installAppSafariStep2, t.installAppSafariStep3],
  chrome: [t.installAppChromeStep1, t.installAppChromeStep2, t.installAppChromeStep3],
  yandex: [t.installAppYandexStep1, t.installAppYandexStep2, t.installAppYandexStep3],
};

const TITLE_BY_BROWSER: Record<PwaInstallBrowser, string> = {
  safari: t.installAppTitleSafari,
  chrome: t.installAppTitleChrome,
  yandex: t.installAppTitleYandex,
};

export function PwaInstallInstructionsSheet({
  browser,
  onOpenChange,
}: PwaInstallInstructionsSheetProps) {
  const supportsNativeInstall = browser === "chrome" || browser === "yandex";
  const { canNativeInstall, triggerNativeInstall } = usePwaInstall(supportsNativeInstall);

  const isOpen = browser !== null;
  const steps = browser ? STEPS_BY_BROWSER[browser] : [];
  const title = browser ? TITLE_BY_BROWSER[browser] : "";

  const close = () => onOpenChange(false);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <ol className="mt-4 space-y-3 text-sm text-foreground list-decimal list-inside">
          {steps.map((step, index) => (
            <li key={index} className="leading-relaxed pl-1">
              {step}
            </li>
          ))}
        </ol>

        <SheetFooter className="mt-6 flex-row gap-2 sm:justify-end sm:space-x-0">
          {supportsNativeInstall && canNativeInstall && (
            <Button type="button" className="flex-1 sm:flex-none" onClick={() => void triggerNativeInstall()}>
              {t.installAppNativeButton}
            </Button>
          )}
          <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={close}>
            {t.cancel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
