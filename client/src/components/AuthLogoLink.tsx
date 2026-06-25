import { Link } from "wouter";
import { cn } from "@/lib/utils";

type AuthLogoLinkProps = {
  href?: string;
  /** Compact size for messenger menu and other tight layouts. */
  compact?: boolean;
  className?: string;
};

/** hovial logo — links to messenger by default. */
export function AuthLogoLink({ href = "/messenger", compact = false, className }: AuthLogoLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "w-fit" : "mx-auto w-full max-w-[280px]",
        className
      )}
      aria-label="В мессенджер"
    >
      <img
        src="/auth-logo.png"
        alt="hovial"
        className={cn(
          "object-contain",
          compact ? "h-7 w-auto max-w-[6.5rem]" : "h-auto w-full"
        )}
        loading="eager"
        decoding="async"
      />
    </Link>
  );
}
