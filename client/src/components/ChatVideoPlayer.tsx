import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { onChatVideoPlay, onChatVideoUnmount } from "@/lib/chatVideoPlayback";

type ChatVideoPlayerProps = {
  src: string;
  posterUrl?: string | null;
  className?: string;
  testId?: string;
};

function bindExclusivePlayback(video: HTMLVideoElement): () => void {
  const handlePlay = () => onChatVideoPlay(video);
  video.addEventListener("play", handlePlay);
  return () => {
    video.removeEventListener("play", handlePlay);
    onChatVideoUnmount(video);
  };
}

export function ChatVideoPlayer({ src, posterUrl, className, testId }: ChatVideoPlayerProps) {
  const inlineRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLVideoElement>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const resumeAtRef = useRef(0);
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    const video = inlineRef.current;
    if (!video) return;
    return bindExclusivePlayback(video);
  }, [src]);

  useEffect(() => {
    const video = overlayRef.current;
    if (!video || !overlayOpen) return;
    return bindExclusivePlayback(video);
  }, [src, overlayOpen]);

  const openOverlay = useCallback((resumeAt: number, wasPlaying: boolean) => {
    resumeAtRef.current = resumeAt;
    wasPlayingRef.current = wasPlaying;
    setOverlayOpen(true);
  }, []);

  const enterFullscreen = useCallback(
    (event: SyntheticEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const video = inlineRef.current;
      if (!video) return;

      const resumeAt = video.currentTime;
      const wasPlaying = !video.paused && !video.ended;
      // iPhone PWA / overflow:hidden ancestors: native fullscreen often no-ops.
      // Always use the in-app overlay so the top-left control actually works.
      video.pause();
      openOverlay(resumeAt, wasPlaying);
    },
    [openOverlay],
  );

  const closeOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    const inline = inlineRef.current;
    const resumeAt = overlay?.currentTime ?? resumeAtRef.current;
    const wasPlaying = overlay ? !overlay.paused && !overlay.ended : wasPlayingRef.current;
    overlay?.pause();
    setOverlayOpen(false);
    if (!inline) return;
    const seekAndMaybePlay = () => {
      inline.currentTime = resumeAt;
      if (wasPlaying) void inline.play().catch(() => undefined);
    };
    if (inline.readyState >= 1) seekAndMaybePlay();
    else inline.addEventListener("loadedmetadata", seekAndMaybePlay, { once: true });
  }, []);

  useEffect(() => {
    if (!overlayOpen) return;
    const overlay = overlayRef.current;
    if (!overlay) return;

    const start = () => {
      overlay.currentTime = resumeAtRef.current;
      if (wasPlayingRef.current) void overlay.play().catch(() => undefined);
    };
    if (overlay.readyState >= 1) start();
    else overlay.addEventListener("loadedmetadata", start, { once: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeOverlay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overlayOpen, closeOverlay]);

  return (
    <>
      <div
        data-chat-video="true"
        className={cn("relative mb-0.5 max-w-full select-auto", className)}
        style={{ WebkitUserSelect: "auto", userSelect: "auto" }}
      >
        <video
          ref={inlineRef}
          src={src}
          poster={posterUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          controlsList="nofullscreen"
          disablePictureInPicture
          className="max-h-64 w-full rounded bg-black/90 object-contain [touch-action:manipulation]"
          data-testid={testId}
        />
        <button
          type="button"
          className="absolute left-1.5 top-1.5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white shadow-sm backdrop-blur-[2px] active:bg-black/70"
          style={{ touchAction: "manipulation" }}
          aria-label={t.videoPlayerFullscreen}
          data-testid={testId ? `${testId}-fullscreen` : "video-fullscreen"}
          onPointerDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onClick={enterFullscreen}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {overlayOpen
        ? createPortal(
            <div className="fixed inset-0 z-[140] flex flex-col bg-black">
              <button
                type="button"
                className="absolute z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-foreground shadow-lg"
                style={{
                  top: "max(0.75rem, env(safe-area-inset-top, 0px))",
                  left: "max(0.75rem, env(safe-area-inset-left, 0px))",
                  touchAction: "manipulation",
                }}
                aria-label={t.videoPlayerExitFullscreen}
                data-testid={testId ? `${testId}-exit-fullscreen` : "video-exit-fullscreen"}
                onClick={closeOverlay}
              >
                <X className="h-6 w-6" />
              </button>
              <video
                ref={overlayRef}
                src={src}
                poster={posterUrl ?? undefined}
                controls
                playsInline
                autoPlay
                preload="auto"
                controlsList="nofullscreen"
                disablePictureInPicture
                className="h-full w-full bg-black object-contain [touch-action:manipulation]"
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
