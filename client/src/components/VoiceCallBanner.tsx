import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Phone, PhoneOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

function initialsFromName(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

type IncomingCallScreenProps = {
  name: string;
  roleLabel: string | null;
  avatarUrl: string | null;
  onAccept: () => void;
  onDecline: () => void;
  onMinimize: () => void;
};

export function IncomingCallScreen({
  name,
  roleLabel,
  avatarUrl,
  onAccept,
  onDecline,
  onMinimize,
}: IncomingCallScreenProps) {
  const subtitle = roleLabel
    ? `${roleLabel} · ${t.voiceCallIncomingCallingYou}`
    : t.voiceCallIncomingCallingYou;

  return (
    <div className="voice-call-fullscreen" data-testid="incoming-call-screen">
      <div className="voice-call-fullscreen__safe">
        <div className="flex items-center px-2 pt-1">
          <button
            type="button"
            className="flex h-11 items-center gap-1.5 bg-transparent px-2.5 text-base font-semibold text-[rgba(255,255,255,0.88)]"
            onClick={onMinimize}
            data-testid="button-minimize-incoming-call"
          >
            <ChevronDown className="h-[22px] w-[22px]" strokeWidth={2} />
            {t.voiceCallMinimize}
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="flex items-center gap-2 text-base font-semibold text-[rgba(255,255,255,0.8)]">
            <Phone className="h-4 w-4" strokeWidth={2} />
            {t.voiceCallIncomingAudio}
          </div>
          <div className="relative mt-11 mb-[30px] h-[140px] w-[140px]">
            <span className="voice-call-incoming-ring pointer-events-none absolute inset-0 box-border rounded-full border-2 border-[rgba(190,214,150,0.7)]" />
            <span className="voice-call-incoming-ring voice-call-incoming-ring--delay pointer-events-none absolute inset-0 box-border rounded-full border-2 border-[rgba(190,214,150,0.7)]" />
            <Avatar className="relative z-10 h-[140px] w-[140px]">
              <AvatarImage src={avatarUrl ?? undefined} alt="" className="object-cover" />
              <AvatarFallback className="bg-[#6F7042] text-[48px] font-semibold text-white">
                {initialsFromName(name)}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="text-center text-[32px] font-bold leading-[1.15]">{name}</div>
          <div className="mt-1.5 text-[18px] text-[rgba(255,255,255,0.76)]">{subtitle}</div>
        </div>

        <div className="flex justify-between px-[54px] pb-[52px]">
          <button
            type="button"
            onClick={onDecline}
            data-testid="button-decline-voice-call"
            className="flex flex-col items-center gap-2.5 bg-transparent text-white"
          >
            <span className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#DC2626]">
              <PhoneOff className="h-8 w-8" strokeWidth={2} />
            </span>
            <span className="text-base font-semibold">{t.voiceCallDecline}</span>
          </button>
          <button
            type="button"
            onClick={onAccept}
            data-testid="button-accept-voice-call"
            className="flex flex-col items-center gap-2.5 bg-transparent text-white"
          >
            <span className="voice-call-incoming-nudge flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#16A34A]">
              <Phone className="h-8 w-8" strokeWidth={2} />
            </span>
            <span className="text-base font-semibold">{t.voiceCallAccept}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

type IncomingCallNoticeProps = VoiceCallBannerProps & {
  callId: string;
  fullscreen: boolean;
  roleLabel: string | null;
  avatarUrl: string | null;
};

/** Full-screen incoming call. «Свернуть» returns to the compact banner. */
export function IncomingCallNotice({
  callId,
  fullscreen,
  roleLabel,
  avatarUrl,
  initiatorName,
  isActive,
  onAccept,
  onDecline,
}: IncomingCallNoticeProps) {
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    setMinimized(false);
  }, [callId]);

  if (fullscreen && !minimized) {
    return createPortal(
      <IncomingCallScreen
        name={initiatorName}
        roleLabel={roleLabel}
        avatarUrl={avatarUrl}
        onAccept={onAccept}
        onDecline={onDecline}
        onMinimize={() => setMinimized(true)}
      />,
      document.body
    );
  }

  return (
    <div className="pointer-events-auto w-full min-w-0 max-w-full overflow-hidden">
      <VoiceCallBanner
        initiatorName={initiatorName}
        isActive={isActive}
        onAccept={onAccept}
        onDecline={onDecline}
      />
    </div>
  );
}
