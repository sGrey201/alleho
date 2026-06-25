import { AuthLogoLink } from "@/components/AuthLogoLink";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LandingPanelProps = {
  onLogin: () => void;
  onRegister: () => void;
  compact?: boolean;
  className?: string;
};

export function LandingPanel({ onLogin, onRegister, compact = false, className }: LandingPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center w-full",
        compact ? "px-4 py-6" : "px-4 py-12 max-w-2xl mx-auto",
        className
      )}
    >
      <div className={cn("w-full", compact ? "mb-4 max-w-[200px]" : "mb-6 max-w-[280px]")}>
        <AuthLogoLink href="/messenger" />
      </div>

      <p
        className={cn(
          "text-muted-foreground leading-relaxed",
          compact ? "text-sm mb-6" : "mb-8"
        )}
      >
        {t.landingDescription}
      </p>

      <div className={cn("flex w-full gap-3", compact ? "flex-col" : "flex-col sm:flex-row sm:justify-center")}>
        <Button onClick={onLogin} size={compact ? "default" : "lg"} className={compact ? "w-full" : "sm:min-w-[10rem]"}>
          {t.landingLoginCta}
        </Button>
        <Button
          onClick={onRegister}
          variant="outline"
          size={compact ? "default" : "lg"}
          className={compact ? "w-full" : "sm:min-w-[10rem]"}
        >
          {t.register}
        </Button>
      </div>
    </div>
  );
}
