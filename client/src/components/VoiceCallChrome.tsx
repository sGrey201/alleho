import { ChevronDown, MessageSquare, Mic, MicOff, PhoneOff, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { profileAvatarSrc } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useVoiceCallContext } from "@/components/VoiceCallProvider";
import type { CallStateDto } from "@/hooks/useVoiceCall";

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

export function VoiceCallChrome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const {
    roomCall,
    isInRoom,
    isConnecting,
    micEnabled,
    connectedUserIds,
    speakingUserIds,
    callUiExpanded,
    setCallUiExpanded,
    displayTitle,
    conversationPath,
    toggleMic,
    leaveCall,
    endCall,
  } = useVoiceCallContext();

  if (!roomCall || (!isInRoom && !isConnecting)) return null;

  const isInitiator = roomCall.initiatedByUserId === user?.id;
  const connected = new Set(connectedUserIds);
  const speaking = new Set(speakingUserIds);
  const roster = roomCall.participants.filter(
    (p) => p.status === "invited" || p.status === "joined" || connected.has(p.userId)
  );

  const openChat = () => {
    if (conversationPath) {
      setLocation(conversationPath);
    }
    setCallUiExpanded(false);
  };

  return (
    <>
      {!callUiExpanded && (
        <button
          type="button"
          className="voice-call-strip"
          onClick={() => setCallUiExpanded(true)}
          data-testid="voice-call-strip"
          aria-label={displayTitle}
        >
          <span className="voice-call-strip__label">{displayTitle}</span>
        </button>
      )}

      {callUiExpanded && (
        <div className="voice-call-fullscreen" data-testid="voice-call-fullscreen">
          <div className="voice-call-fullscreen__safe">
            <div className="flex items-center justify-between px-3 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/10 hover:text-white"
                onClick={() => setCallUiExpanded(false)}
                data-testid="button-minimize-call"
              >
                <ChevronDown className="mr-1 h-4 w-4" />
                {t.voiceCallMinimize}
              </Button>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-10">
              <div className="text-center">
                <p className="text-xl font-semibold text-white">{displayTitle}</p>
                <p className="mt-1 text-sm text-white/80">
                  {isConnecting ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t.voiceCallConnecting}
                    </span>
                  ) : (
                    t.voiceCallInProgress
                  )}
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-4">
                {roster.map((p) => {
                  const isConnected = connected.has(p.userId);
                  const isSpeaking = speaking.has(p.userId);
                  return (
                    <div key={p.userId} className="flex w-20 flex-col items-center gap-1.5">
                      <div
                        className={cn(
                          "relative rounded-full p-0.5",
                          isSpeaking ? "ring-2 ring-white" : "ring-1 ring-white/40"
                        )}
                      >
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={profileAvatarSrc(p.user.profileImageUrl, "avatar")} />
                          <AvatarFallback className="bg-white/20 text-base font-semibold text-white">
                            {initials(p.user)}
                          </AvatarFallback>
                        </Avatar>
                        {!isConnected && (
                          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-[10px] text-white">
                            {t.voiceCallRinging}
                          </span>
                        )}
                      </div>
                      <span className="w-full truncate text-center text-xs text-white/90">
                        {p.userId === user?.id ? "Вы" : displayName(p.user)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-center gap-4">
                <Button
                  type="button"
                  size="icon"
                  className={cn(
                    "h-14 w-14 rounded-full",
                    micEnabled
                      ? "bg-white/15 text-white hover:bg-white/25"
                      : "bg-white text-green-700 hover:bg-white/90"
                  )}
                  onClick={() => void toggleMic()}
                  data-testid="button-toggle-mic"
                  title={micEnabled ? t.voiceCallMute : t.voiceCallUnmute}
                >
                  {micEnabled ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
                </Button>

                <Button
                  type="button"
                  size="icon"
                  className="h-14 w-14 rounded-full bg-red-500 text-white hover:bg-red-600"
                  onClick={() => void (isInitiator ? endCall() : leaveCall())}
                  data-testid={isInitiator ? "button-end-call" : "button-leave-call"}
                  title={isInitiator ? t.voiceCallEnd : t.voiceCallLeave}
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>

                <Button
                  type="button"
                  size="icon"
                  className="h-14 w-14 rounded-full bg-white/15 text-white hover:bg-white/25"
                  onClick={openChat}
                  data-testid="button-open-call-chat"
                  title={t.voiceCallOpenChat}
                  disabled={!conversationPath}
                >
                  <MessageSquare className="h-6 w-6" />
                </Button>
              </div>

              <p className="text-xs text-white/70">
                {isInitiator ? t.voiceCallEnd : t.voiceCallLeave} · {t.voiceCallOpenChat}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
