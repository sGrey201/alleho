import { useEffect, useRef, type SyntheticEvent } from "react";
import { cn } from "@/lib/utils";
import { onChatVideoPlay, onChatVideoUnmount } from "@/lib/chatVideoPlayback";

type ChatVideoPlayerProps = {
  src: string;
  posterUrl?: string | null;
  className?: string;
  testId?: string;
};

export function ChatVideoPlayer({ src, posterUrl, className, testId }: ChatVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => onChatVideoPlay(video);

    video.addEventListener("play", handlePlay);
    return () => {
      video.removeEventListener("play", handlePlay);
      onChatVideoUnmount(video);
    };
  }, [src]);

  const stopBubbleGestures = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <video
      ref={videoRef}
      src={src}
      poster={posterUrl ?? undefined}
      controls
      playsInline
      preload="metadata"
      className={cn(
        "mb-0.5 max-h-64 max-w-full rounded bg-black/90 object-contain",
        className,
      )}
      data-testid={testId}
      onClick={stopBubbleGestures}
      onPointerDown={stopBubbleGestures}
      onPointerMove={stopBubbleGestures}
      onTouchStart={stopBubbleGestures}
      onTouchMove={stopBubbleGestures}
    />
  );
}
