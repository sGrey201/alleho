import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, MessageSquare, Mic, MicOff, PhoneOff, Video, VideoOff, Volume2, VolumeX } from "lucide-react";
import { useLocation } from "wouter";
import { RemoteVideoTrack, VideoQuality } from "livekit-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

function initialsFromTitle(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

function initials(user: CallStateDto["participants"][number]["user"]): string {
  return initialsFromTitle(displayName(user));
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

function qualityLabel(q: VideoQuality | undefined): string {
  if (q === VideoQuality.HIGH) return "HIGH";
  if (q === VideoQuality.MEDIUM) return "MED";
  if (q === VideoQuality.LOW) return "LOW";
  return "?";
}

function formatBitrate(bps: number | undefined): string {
  if (bps == null || !Number.isFinite(bps) || bps <= 0) return "—";
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mb/s`;
  if (bps >= 1_000) return `${Math.round(bps / 1_000)} kb/s`;
  return `${Math.round(bps)} b/s`;
}

type RemoteVideoDebugStats = {
  display: string;
  recv: string;
  quality: string;
  bitrate: string;
  fps: string;
  stream: string;
};

/** Debug HUD for the remote fullscreen stage — resolution / layer / bitrate. */
function RemoteVideoStage({ tile }: { tile: CallVideoTile }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevBytesRef = useRef<{ bytes: number; frames: number; at: number } | null>(null);
  const [stats, setStats] = useState<RemoteVideoDebugStats | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    tile.track.attach(el);
    return () => {
      tile.track.detach(el);
    };
  }, [tile.track]);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      const el = videoRef.current;
      const displayW = el?.videoWidth || 0;
      const displayH = el?.videoHeight || 0;
      const display = displayW && displayH ? `${displayW}×${displayH}` : "—";

      const quality = qualityLabel(tile.remotePublication?.videoQuality);
      const stream = tile.track.streamState ?? "—";

      let recv = "—";
      let bitrate = "—";
      let fps = "—";

      if (tile.track instanceof RemoteVideoTrack) {
        try {
          const rs = await tile.track.getReceiverStats();
          if (rs) {
            if (rs.frameWidth && rs.frameHeight) {
              recv = `${rs.frameWidth}×${rs.frameHeight}`;
            }
            const now = rs.timestamp || performance.now();
            const bytes = rs.bytesReceived ?? 0;
            const frames = rs.framesDecoded ?? 0;
            const prev = prevBytesRef.current;
            if (prev && now > prev.at) {
              const dt = (now - prev.at) / 1000;
              if (dt > 0) {
                bitrate = formatBitrate(((bytes - prev.bytes) * 8) / dt);
                const fpsVal = (frames - prev.frames) / dt;
                if (fpsVal >= 0 && fpsVal < 120) fps = `${fpsVal.toFixed(0)} fps`;
              }
            }
            prevBytesRef.current = { bytes, frames, at: now };
          }
        } catch {
          // stats unavailable — keep placeholders
        }
      }

      if (!cancelled) {
        setStats({ display, recv, quality, bitrate, fps, stream: String(stream) });
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      prevBytesRef.current = null;
    };
  }, [tile.track, tile.remotePublication]);

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full bg-black object-cover"
      />
      {stats && (
        <div
          className="pointer-events-none absolute bottom-[17.5rem] left-3 z-10 rounded bg-black/55 px-1.5 py-1 font-mono text-[10px] leading-tight text-white/90 tabular-nums"
          data-testid="video-call-remote-stats"
        >
          <div>
            in {stats.display}
            {stats.recv !== "—" && stats.recv !== stats.display ? ` · rtc ${stats.recv}` : ""}
          </div>
          <div>
            {stats.quality} · {stats.bitrate}
            {stats.fps !== "—" ? ` · ${stats.fps}` : ""}
            {stats.stream !== "active" ? ` · ${stats.stream}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}

function formatElapsed(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useCallElapsed(startedAt: string | null, running: boolean): string | null {
  const fallbackRef = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) {
      fallbackRef.current = null;
      return;
    }
    if (!startedAt && fallbackRef.current == null) fallbackRef.current = Date.now();
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  if (!running) return null;
  const start = startedAt ? Date.parse(startedAt) : fallbackRef.current;
  if (start == null || Number.isNaN(start)) return null;
  return formatElapsed(Math.max(0, Math.floor((now - start) / 1000)));
}

function CallAction({
  label,
  pressed,
  disabled,
  testId,
  title,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  testId: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      title={title}
      className="flex flex-col items-center gap-2 bg-transparent p-0 text-white disabled:opacity-40"
    >
      <span
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full",
          pressed ? "bg-white text-[#1E2118]" : "bg-[rgba(255,255,255,0.14)] text-white"
        )}
      >
        {children}
      </span>
      <span className="text-[13px] leading-none text-[rgba(255,255,255,0.82)]">{label}</span>
    </button>
  );
}

function CallControls({
  micEnabled,
  cameraEnabled,
  speakerEnabled,
  canUseCamera,
  isInitiator,
  conversationPath,
  onToggleMic,
  onToggleCamera,
  onToggleSpeaker,
  onHangUp,
  onOpenChat,
}: {
  micEnabled: boolean;
  cameraEnabled: boolean;
  speakerEnabled: boolean;
  canUseCamera: boolean;
  isInitiator: boolean;
  conversationPath: string | null;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleSpeaker: () => void;
  onHangUp: () => void;
  onOpenChat: () => void;
}) {
  return (
    <div className="flex w-full flex-col items-center gap-7 px-5 pb-12">
      <div
        className={cn(
          "grid w-full gap-2",
          canUseCamera ? "grid-cols-4" : "grid-cols-3"
        )}
      >
        <CallAction
          label={t.voiceCallMic}
          pressed={!micEnabled}
          testId="button-toggle-mic"
          title={micEnabled ? t.voiceCallMute : t.voiceCallUnmute}
          onClick={onToggleMic}
        >
          {micEnabled ? <Mic className="h-[26px] w-[26px]" /> : <MicOff className="h-[26px] w-[26px]" />}
        </CallAction>

        {canUseCamera && (
          <CallAction
            label={cameraEnabled ? t.voiceCallCameraShort : t.voiceCallCameraOffShort}
            pressed={cameraEnabled}
            testId="button-toggle-camera"
            title={cameraEnabled ? t.voiceCallCameraOff : t.voiceCallCameraOn}
            onClick={onToggleCamera}
          >
            {cameraEnabled ? (
              <Video className="h-[26px] w-[26px]" />
            ) : (
              <VideoOff className="h-[26px] w-[26px]" />
            )}
          </CallAction>
        )}

        <CallAction
          label={t.voiceCallSpeaker}
          pressed={speakerEnabled}
          testId="button-toggle-speaker"
          title={t.voiceCallSpeaker}
          onClick={onToggleSpeaker}
        >
          {speakerEnabled ? (
            <Volume2 className="h-[26px] w-[26px]" />
          ) : (
            <VolumeX className="h-[26px] w-[26px]" />
          )}
        </CallAction>

        <CallAction
          label={t.voiceCallChat}
          pressed={false}
          disabled={!conversationPath}
          testId="button-open-call-chat"
          title={t.voiceCallOpenChat}
          onClick={onOpenChat}
        >
          <MessageSquare className="h-[26px] w-[26px]" />
        </CallAction>
      </div>

      <button
        type="button"
        aria-label={t.voiceCallHangUp}
        onClick={onHangUp}
        data-testid={isInitiator ? "button-end-call" : "button-leave-call"}
        title={isInitiator ? t.voiceCallEnd : t.voiceCallLeave}
        className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#DC2626] text-white"
      >
        <PhoneOff className="h-[30px] w-[30px]" />
      </button>
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
    toggleSpeaker,
    leaveCall,
    endCall,
    cameraEnabled,
    speakerEnabled,
    canUseCamera,
    videoTiles,
  } = useVoiceCallContext();

  const elapsed = useCallElapsed(roomCall?.startedAt ?? null, Boolean(roomCall) && isInRoom && !isConnecting);

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

  const others = roster.filter((p) => p.userId !== user?.id);
  const featured = others.length === 1 ? others[0] : null;
  const heroName = featured ? displayName(featured.user) : displayTitle;
  const heroInitials = featured ? initials(featured.user) : initialsFromTitle(displayTitle);
  const heroImage = featured ? profileAvatarSrc(featured.user.profileImageUrl, "avatar") : undefined;
  const heroSpeaking = featured ? speaking.has(featured.userId) : false;
  const subtitle = isConnecting
    ? t.voiceCallConnecting
    : elapsed
      ? `${hasVideoStage ? t.voiceCallVideo : t.voiceCallAudio} · ${elapsed}`
      : hasVideoStage
        ? t.voiceCallVideo
        : t.voiceCallAudio;

  const controls = (
    <CallControls
      micEnabled={micEnabled}
      cameraEnabled={cameraEnabled}
      speakerEnabled={speakerEnabled}
      canUseCamera={canUseCamera}
      isInitiator={isInitiator}
      conversationPath={conversationPath}
      onToggleMic={() => void toggleMic()}
      onToggleCamera={() => void toggleCamera()}
      onToggleSpeaker={toggleSpeaker}
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
            {hasVideoStage && (
              <div className="absolute inset-0 overflow-hidden bg-black">
                {primaryRemote ? (
                  <RemoteVideoStage tile={primaryRemote} />
                ) : localTile ? (
                  <CallVideoSurface tile={localTile} mirrored className="h-full w-full" />
                ) : null}
              </div>
            )}

            {primaryRemote && localTile && (
              <div
                className="absolute right-3 top-16 z-10 w-28 overflow-hidden rounded-xl shadow-lg ring-1 ring-white/20 sm:w-36"
                data-testid="video-call-pip-local"
              >
                <CallVideoSurface tile={localTile} mirrored className="aspect-[3/4] w-full" />
              </div>
            )}

            <div
              className={cn(
                "relative z-20 flex items-center justify-between px-2 pt-1",
                hasVideoStage && "bg-gradient-to-b from-black/55 to-transparent pb-8"
              )}
            >
              <button
                type="button"
                className="flex h-11 items-center gap-1.5 bg-transparent px-2.5 text-base font-semibold text-[rgba(255,255,255,0.88)]"
                onClick={() => setCallUiExpanded(false)}
                data-testid="button-minimize-call"
              >
                <ChevronDown className="h-[22px] w-[22px]" strokeWidth={2} />
                {t.voiceCallMinimize}
              </button>
              {canUseCamera ? (
                <div className="mr-2 flex h-8 items-center gap-2 rounded-2xl bg-[rgba(239,68,68,0.2)] px-3 text-sm font-bold text-[#FECACA]">
                  <span className="h-2 w-2 rounded-full bg-[#F87171]" />
                  {t.voiceCallRecording}
                </div>
              ) : (
                <span />
              )}
            </div>

            {hasVideoStage ? (
              <div className="relative z-10 flex-1" />
            ) : (
              <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3.5 px-6">
                <div
                  className={cn(
                    "flex h-[136px] w-[136px] items-center justify-center overflow-hidden rounded-full bg-[#6F7042] text-[46px] font-semibold text-white shadow-[0_0_0_12px_rgba(255,255,255,0.06),0_0_0_28px_rgba(255,255,255,0.03)]",
                    heroSpeaking && "ring-2 ring-white"
                  )}
                >
                  {heroImage ? (
                    <Avatar className="h-full w-full">
                      <AvatarImage src={heroImage} alt="" className="object-cover" />
                      <AvatarFallback className="bg-[#6F7042] text-[46px] font-semibold text-white">
                        {heroInitials}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    heroInitials
                  )}
                </div>
                <div className="mt-[22px] text-center text-[30px] font-bold leading-tight">{heroName}</div>
                <div className="text-[18px] tabular-nums text-[rgba(255,255,255,0.74)]">{subtitle}</div>
              </div>
            )}

            {hasVideoStage && (
              <div className="pointer-events-none relative z-20 px-6 pb-2 text-center">
                <div className="text-[22px] font-bold leading-tight">{heroName}</div>
                <div className="text-[16px] tabular-nums text-[rgba(255,255,255,0.74)]">{subtitle}</div>
              </div>
            )}

            <div
              className={cn(
                "relative z-20",
                hasVideoStage && "bg-gradient-to-t from-black/70 to-transparent"
              )}
            >
              {controls}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
