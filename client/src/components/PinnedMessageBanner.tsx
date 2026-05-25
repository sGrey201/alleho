import { Pin } from "lucide-react";

export function formatPinnedPreviewLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

type PinnedMessageBannerProps = {
  title: string;
  preview: string;
  /** 0-based index of the pinned message shown in preview */
  activeIndex: number;
  totalCount: number;
  onClick: () => void;
  testId?: string;
};

export function PinnedMessageBanner({
  title,
  preview,
  activeIndex,
  totalCount,
  onClick,
  testId,
}: PinnedMessageBannerProps) {
  const displayIndex = activeIndex >= 0 ? activeIndex + 1 : totalCount;
  const previewLine = formatPinnedPreviewLine(preview);

  return (
    <button
      type="button"
      onClick={onClick}
      className="box-border flex h-11 max-h-11 w-full max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-border/40 bg-background/85 px-3 py-1.5 text-left shadow-sm backdrop-blur-md"
      data-testid={testId}
    >
      <Pin className="h-4 w-4 shrink-0 text-primary" />
      <div className="w-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex max-w-full min-w-0 items-center gap-2 overflow-hidden">
          <p className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold leading-tight text-primary">
            {title}
          </p>
          <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
            {displayIndex} из {totalCount}
          </span>
        </div>
        <p className="block max-w-full min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-tight text-foreground/80">
          {previewLine}
        </p>
      </div>
    </button>
  );
}
