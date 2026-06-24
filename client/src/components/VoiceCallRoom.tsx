import { Mic, MicOff, PhoneOff, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { profileAvatarSrc } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { CallStateDto } from "@/hooks/useVoiceCall";

type VoiceCallRoomProps = {
  call: CallStateDto;
  currentUserId: string | undefined;
  connectedUserIds: string[];
  speakingUserIds: string[];
  micEnabled: boolean;
  isConnecting: boolean;
  isInitiator: boolean;
  onToggleMic: () => void;
  onLeave: () => void;
  onEnd: () => void;
};

function displayName(user: CallStateDto["participants"][number]["user"]): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  return user.email?.split("@")[0] ?? "—";
}

function initials(user: CallStateDto["participants"][number]["user"]): string {
  const name = displayName(user);
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function VoiceCallRoom({
  call,
  currentUserId,
  connectedUserIds,
  speakingUserIds,
  micEnabled,
  isConnecting,
  isInitiator,
  onToggleMic,
  onLeave,
  onEnd,
}: VoiceCallRoomProps) {
  const connected = new Set(connectedUserIds);
  const speaking = new Set(speakingUserIds);
  // Show invited/joined roster, hide those who declined/left/missed.
  const roster = call.participants.filter(
    (p) => p.status === "invited" || p.status === "joined" || connected.has(p.userId)
  );

  return (
    <div
      className="pointer-events-auto w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border/40 bg-background/95 p-3 shadow-lg backdrop-blur-md"
      data-testid="voice-call-room"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{t.voiceCallStart}</p>
        <span className="text-xs text-muted-foreground">
          {isConnecting ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t.voiceCallConnecting}
            </span>
          ) : (
            t.voiceCallInProgress
          )}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {roster.map((p) => {
          const isConnected = connected.has(p.userId);
          const isSpeaking = speaking.has(p.userId);
          return (
            <div
              key={p.userId}
              className="flex w-16 flex-col items-center gap-1"
              data-testid={`voice-call-participant-${p.userId}`}
            >
              <div
                className={cn(
                  "relative rounded-full p-0.5 transition-colors",
                  isSpeaking ? "ring-2 ring-green-500" : "ring-1 ring-border"
                )}
              >
                <Avatar className="h-12 w-12">
                  <AvatarImage src={profileAvatarSrc(p.user.profileImageUrl, "avatar")} />
                  <AvatarFallback className="text-sm font-semibold">
                    {initials(p.user)}
                  </AvatarFallback>
                </Avatar>
                {!isConnected && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60 text-[10px] text-muted-foreground">
                    {t.voiceCallRinging}
                  </span>
                )}
              </div>
              <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] leading-tight">
                {p.userId === currentUserId ? "Вы" : displayName(p.user)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <Button
          type="button"
          variant={micEnabled ? "outline" : "secondary"}
          size="icon"
          onClick={onToggleMic}
          className="h-10 w-10 rounded-full"
          data-testid="button-toggle-mic"
          title={micEnabled ? t.voiceCallMute : t.voiceCallUnmute}
        >
          {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          onClick={onLeave}
          className="h-10 w-10 rounded-full"
          data-testid="button-leave-call"
          title={t.voiceCallLeave}
        >
          <PhoneOff className="h-4 w-4" />
        </Button>
        {isInitiator && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onEnd}
            className="h-10 rounded-full px-4"
            data-testid="button-end-call"
          >
            {t.voiceCallEnd}
          </Button>
        )}
      </div>
    </div>
  );
}
