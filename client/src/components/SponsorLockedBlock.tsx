import { Lock } from "lucide-react";
import { t } from "@/lib/i18n";

type SponsorLockedBlockProps = {
  onClick?: () => void;
};

export function SponsorLockedBlock({ onClick }: SponsorLockedBlockProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="my-1 flex w-full items-center gap-2 rounded-md border border-dashed border-amber-500/50 bg-amber-500/10 px-3 py-2 text-left text-sm text-amber-900 transition-colors hover:bg-amber-500/20 dark:text-amber-100"
    >
      <Lock className="h-4 w-4 shrink-0" />
      <span>{t.sponsorContentLocked}</span>
    </button>
  );
}
