import type { ReactNode } from "react";
import { Phone, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type ActionButtonProps = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
};

function ActionButton({ label, icon, onClick, disabled, testId }: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl bg-card px-2 py-3 text-primary shadow-sm",
        "hover:bg-muted/60 active:bg-muted/80 transition-colors",
        "disabled:pointer-events-none disabled:opacity-40"
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      <span className="max-w-full truncate text-xs font-medium leading-tight">{label}</span>
    </button>
  );
}

type ChatProfileActionRowProps = {
  onCall?: () => void;
  callDisabled?: boolean;
  onSearch?: () => void;
  searchDisabled?: boolean;
  className?: string;
};

/** Telegram-style action chips under avatar/title on chat/user profile screens. */
export function ChatProfileActionRow({
  onCall,
  callDisabled,
  onSearch,
  searchDisabled,
  className,
}: ChatProfileActionRowProps) {
  if (!onCall && !onSearch) return null;

  return (
    <div className={cn("flex gap-2", className)} data-testid="chat-profile-action-row">
      {onCall && (
        <ActionButton
          label={t.voiceCallDial}
          icon={<Phone />}
          onClick={onCall}
          disabled={callDisabled}
          testId="button-profile-call"
        />
      )}
      {onSearch && (
        <ActionButton
          label={t.search}
          icon={<Search />}
          onClick={onSearch}
          disabled={searchDisabled}
          testId="button-profile-search"
        />
      )}
    </div>
  );
}
