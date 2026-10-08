import { useEffect, useRef } from "react";
import { ChevronDown, MessageSquare, Mic, MicOff, PhoneOff, Loader2, Video, VideoOff } from "lucide-react";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { profileAvatarSrc } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { useVoiceCallContext, type CallVideoTile } from "@/components/VoiceCallProvider";
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

function CallVideoSurface({
  tile,
  mirrored,
  className,
}: {
  tile: CallVideoTile;
  mirrored: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    tile.track.attach(el);
    return () => {
      tile.track.detach(el);
    };
  }, [tile.track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn("bg-black object-cover", mirrored && "-scale-x-100", className)}
    />
  );
}

function CallControls({
  micEnabled,
  cameraEnabled,
  canUseCamera,
  isInitiator,
  conversationPath,
  onToggleMic,
  onToggleCamera,
  onHangUp,
  onOpenChat,
}: {
  micEnabled: boolean;
  cameraEnabled: boolean;
  canUseCamera: boolean;
  isInitiator: boolean;
  conversationPath: string | null;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onHangUp: () => void;
  onOpenChat: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <Button
        type="button"
        size="icon"
        className={cn(
          "h-14 w-14 rounded-full",
          micEnabled
            ? "bg-white/15 text-white hover:bg-white/25"
            : "bg-white text-green-700 hover:bg-white/90"
        )}
        onClick={onToggleMic}
        data-testid="button-toggle-mic"
        title={micEnabled ? t.voiceCallMute : t.voiceCallUnmute}
      >
        {micEnabled ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
      </Button>

      {canUseCamera && (
        <Button
          type="button"
          size="icon"
          className={cn(
            "h-14 w-14 rounded-full",
            cameraEnabled
              ? "bg-white text-green-700 hover:bg-white/90"
              : "bg-white/15 text-white hover:bg-white/25"
          )}
          onClick={onToggleCamera}
          data-testid="button-toggle-camera"
          title={cameraEnabled ? t.voiceCallCameraOff : t.voiceCallCameraOn}
        >
          {cameraEnabled ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
        </Button>
      )}

      <Button
        type="button"
        size="icon"
        className="h-14 w-14 rounded-full bg-red-500 text-white hover:bg-red-600"
        onClick={onHangUp}
        data-testid={isInitiator ? "button-end-call" : "button-leave-call"}
        title={isInitiator ? t.voiceCallEnd : t.voiceCallLeave}
      >
        <PhoneOff className="h-6 w-6" />
      </Button>

      <Button
        type="button"
        size="icon"
        className="h-14 w-14 rounded-full bg-white/15 text-white hover:bg-white/25"
        onClick={onOpenChat}
        data-testid="button-open-call-chat"
        title={t.voiceCallOpenChat}
        disabled={!conversationPath}
      >
        <MessageSquare className="h-6 w-6" />
      </Button>
    </div>
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
    toggleCamera,
    leaveCall,
    endCall,
    cameraEnabled,
    canUseCamera,
    videoTiles,
  } = useVoiceCallContext();

  if (!roomCall || (!isInRoom && !isConnecting)) return null;

  const isInitiator = roomCall.initiatedByUserId === user?.id;
  const connected = new Set(connectedUserIds);
  const speaking = new Set(speakingUserIds);
  const videoByUser = new Map(videoTiles.map((tile) => [tile.userId, tile]));
  const roster = roomCall.participants.filter(
    (p) => p.status === "invited" || p.status === "joined" || connected.has(p.userId)
  );

  const myId = user?.id;
  const localTile = myId ? videoByUser.get(myId) : undefined;
  const remoteTiles = videoTiles.filter((tile) => tile.userId !== myId);
  const primaryRemote = remoteTiles[0];
  const hasVideoStage = Boolean(primaryRemote || localTile);

  const openChat = () => {
    if (conversationPath) {
      setLocation(conversationPath);
    }
    setCallUiExpanded(false);
  };

  const hangUp = () => void (isInitiator ? endCall() : leaveCall());

  const controls = (
    <CallControls
      micEnabled={micEnabled}
      cameraEnabled={cameraEnabled}
      canUseCamera={canUseCamera}
      isInitiator={isInitiator}
      conversationPath={conversationPath}
      onToggleMic={() => void toggleMic()}
      onToggleCamera={() => void toggleCamera()}
      onHangUp={hangUp}
      onOpenChat={openChat}
    />
  );

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
          <span className="voice-call-strip__label">
            {displayTitle}
            {canUseCamera ? ` · ${t.voiceCallRecording}` : ""}
          </span>
        </button>
      )}

      {callUiExpanded && (
        <div
          className={cn("voice-call-fullscreen", hasVideoStage && "voice-call-fullscreen--video")}
          data-testid="voice-call-fullscreen"
        >
          <div className="voice-call-fullscreen__safe relative">
            {hasVideoStage ? (
              <>
                <div className="absolute inset-0 overflow-hidden bg-black">
                  {primaryRemote ? (
                    <CallVideoSurface
                      tile={primaryRemote}
                      mirrored={false}
                      className="h-full w-full"
                    />
                  ) : localTile ? (
                    <CallVideoSurface tile={localTile} mirrored className="h-full w-full" />
                  ) : null}
                </div>

                {primaryRemote && localTile && (
                  <div
                    className="absolute right-3 top-14 z-10 w-28 overflow-hidden rounded-xl shadow-lg ring-1 ring-white/20 sm:w-36"
                    data-testid="video-call-pip-local"
                  >
                    <CallVideoSurface
                      tile={localTile}
                      mirrored
                      className="aspect-[3/4] w-full"
                    />
                  </div>
                )}

                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between bg-gradient-to-b from-black/50 to-transparent px-3 pb-8 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="pointer-events-auto text-white hover:bg-white/10 hover:text-white"
                    onClick={() => setCallUiExpanded(false)}
                    data-testid="button-minimize-call"
                  >
                    <ChevronDown className="mr-1 h-4 w-4" />
                    {t.voiceCallMinimize}
                  </Button>
                  <div className="pointer-events-none max-w-[50%] truncate pt-1.5 text-right text-sm font-medium text-white/90">
                    {displayTitle}
                    {isConnecting ? (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-white/70">
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/60 to-transparent px-4 pb-6 pt-10">
                  <div className="pointer-events-auto">{controls}</div>
                </div>
              </>
            ) : (
              <>
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
                      {canUseCamera ? ` · ${t.voiceCallRecording}` : ""}
                    </p>
                  </div>

                  <div className="flex w-full max-w-3xl flex-wrap items-center justify-center gap-3">
                    {roster.map((p) => {
                      const isConnected = connected.has(p.userId);
                      const isSpeaking = speaking.has(p.userId);
                      const name = p.userId === user?.id ? "Вы" : displayName(p.user);
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
                          <span className="w-full truncate text-center text-xs text-white/90">{name}</span>
                        </div>
                      );
                    })}
                  </div>

                  {controls}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
