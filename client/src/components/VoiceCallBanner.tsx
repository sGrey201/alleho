import { Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

type VoiceCallBannerProps = {
  initiatorName: string;
  /** Active call already running (use "Join" instead of "Accept"). */
  isActive: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function VoiceCallBanner({
  initiatorName,
  isActive,
  onAccept,
  onDecline,
}: VoiceCallBannerProps) {
  return (
    <div
      className="box-border flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-primary/30 bg-background/90 px-3 py-2 shadow-sm backdrop-blur-md"
      data-testid="banner-voice-call"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Phone className="h-4 w-4 animate-pulse" />
      </span>
      <div className="w-0 min-w-0 flex-1 overflow-hidden">
        <p className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-semibold leading-tight text-primary">
          {t.voiceCallIncomingTitle}
        </p>
        <p className="overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-tight text-foreground/80">
          {initiatorName} {t.voiceCallIncomingFrom}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={onAccept}
          className="h-8 gap-1 rounded-full bg-green-600 px-3 text-white hover:bg-green-700"
          data-testid="button-accept-voice-call"
        >
          <Phone className="h-3.5 w-3.5" />
          {isActive ? t.voiceCallJoin : t.voiceCallAccept}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="destructive"
          onClick={onDecline}
          className="h-8 w-8 shrink-0 rounded-full"
          data-testid="button-decline-voice-call"
        >
          <PhoneOff className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
