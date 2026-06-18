import { cn } from "@/lib/utils";

type ChatFormatToolbarProps = {
  top: number;
  left: number;
  isBoldActive: boolean;
  isSponsorActive?: boolean;
  showSponsor?: boolean;
  onBold: () => void;
  onSponsor?: () => void;
};

export function ChatFormatToolbar({
  top,
  left,
  isBoldActive,
  isSponsorActive = false,
  showSponsor = false,
  onBold,
  onSponsor,
}: ChatFormatToolbarProps) {
  return (
    <div
      className="pointer-events-none fixed z-[150]"
      style={{
        top: Math.max(8, top - 44),
        left,
        transform: "translateX(-50%)",
      }}
    >
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5 shadow-lg">
        <button
          type="button"
          aria-label="Жирный"
          onPointerDown={(e) => e.preventDefault()}
          onClick={onBold}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold transition-colors hover:bg-muted",
            isBoldActive && "bg-muted text-foreground"
          )}
          data-testid="button-format-bold"
        >
          B
        </button>
        {showSponsor && onSponsor && (
          <button
            type="button"
            aria-label="Контент для спонсоров"
            onPointerDown={(e) => e.preventDefault()}
            onClick={onSponsor}
            className={cn(
              "flex h-8 min-w-8 items-center justify-center rounded-md px-1 text-xs font-bold transition-colors hover:bg-muted",
              isSponsorActive && "bg-muted text-foreground"
            )}
            data-testid="button-format-sponsor"
          >
            $$
          </button>
        )}
      </div>
    </div>
  );
}
