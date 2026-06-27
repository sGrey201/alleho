import type { MouseEvent } from "react";
import { useLocation } from "wouter";
import { APP_HOME_PATH } from "@shared/brand";
import { resolveAuthReturnTo } from "@/lib/authReturnTo";
import { cn } from "@/lib/utils";

type AuthLogoLinkProps = {
  href?: string;
  /** Compact size for messenger menu and other tight layouts. */
  compact?: boolean;
  className?: string;
};

/** hovial logo — returns to messenger (or prior messenger URL) on click. */
export function AuthLogoLink({ href, compact = false, className }: AuthLogoLinkProps) {
  const [, setLocation] = useLocation();
  const destination = href ?? resolveAuthReturnTo() ?? APP_HOME_PATH;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setLocation(destination);
  };

  return (
    <a
      href={destination}
      onClick={handleClick}
      className={cn(
        "block rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "cursor-pointer transition-opacity hover:opacity-80",
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
    </a>
  );
}
