import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LandingPanelProps = {
  onLogin: () => void;
  onRegister?: () => void;
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
      <p
        className={cn(
          "text-muted-foreground leading-relaxed",
          compact ? "text-sm mb-6" : "mb-8"
        )}
      >
        {t.landingDescription}
      </p>

      <div className="flex w-full flex-row gap-3">
        <Button onClick={onLogin} size={compact ? "default" : "lg"} className="flex-1 min-w-0">
          {t.landingLoginCta}
        </Button>
        {onRegister ? (
          <Button
            onClick={onRegister}
            variant="outline"
            size={compact ? "default" : "lg"}
            className="flex-1 min-w-0"
          >
            {t.landingRegisterCta}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
