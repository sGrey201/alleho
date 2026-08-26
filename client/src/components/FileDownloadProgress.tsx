import { cn } from "@/lib/utils";

type Props = {
  /** 0–1 when known; null/undefined = indeterminate spin. */
  value?: number | null;
  className?: string;
};

/** Compact circular progress for the chat file download icon slot (~16px). */
export function FileDownloadProgress({ value, className }: Props) {
  const size = 16;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const known = typeof value === "number" && Number.isFinite(value);
  const ratio = known ? Math.max(0, Math.min(1, value)) : 0;
  const dashoffset = circumference * (1 - ratio);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn(
        "shrink-0 text-muted-foreground",
        !known && "animate-spin",
        className
      )}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="opacity-25"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={known ? dashoffset : circumference * 0.25}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
