import { cn } from "@/lib/utils";

type ChatFormatToolbarProps = {
  top: number;
  left: number;
  isActive: boolean;
  onBold: () => void;
};

export function ChatFormatToolbar({ top, left, isActive, onBold }: ChatFormatToolbarProps) {
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
            isActive && "bg-muted text-foreground"
          )}
          data-testid="button-format-bold"
        >
          B
        </button>
      </div>
    </div>
  );
}
