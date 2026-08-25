import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTime(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function sniffAudioMime(bytes: ArrayBuffer): string {
  const u = new Uint8Array(bytes.slice(0, 12));
  if (u[0] === 0x1a && u[1] === 0x45 && u[2] === 0xdf && u[3] === 0xa3) return "audio/webm";
  if (u[0] === 0x4f && u[1] === 0x67 && u[2] === 0x67 && u[3] === 0x53) return "audio/ogg";
  if (u[4] === 0x66 && u[5] === 0x74 && u[6] === 0x79 && u[7] === 0x70) return "audio/mp4";
  return "audio/mp4";
}

/** Static pseudo-waveform bars (decorative, deterministic per message). */
const WAVE_BARS = [
  0.35, 0.6, 0.45, 0.8, 1, 0.7, 0.5, 0.9, 0.65, 0.4, 0.75, 0.55, 0.85, 0.5, 0.7, 0.45,
  0.6, 0.95, 0.5, 0.7, 0.4, 0.8, 0.55, 0.65,
];

type VoiceMessagePlayerProps = {
  src: string;
  durationSec: number;
  isOwn: boolean;
};

export function VoiceMessagePlayer({ src, durationSec, isOwn }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const loadPromiseRef = useRef<Promise<string | null> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [effectiveDuration, setEffectiveDuration] = useState(durationSec);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setEffectiveDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setIsLoading(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => setIsLoading(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onLoaded);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onLoaded);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
    };
  }, []);

  useEffect(() => {
    loadPromiseRef.current = null;
    setIsPlaying(false);
    setIsLoading(false);
    setCurrentTime(0);
    setEffectiveDuration(durationSec);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [src, durationSec]);

  const ensureObjectUrl = async (): Promise<string | null> => {
    if (objectUrlRef.current) return objectUrlRef.current;
    if (loadPromiseRef.current) return loadPromiseRef.current;
    if (!src) return null;

    loadPromiseRef.current = (async () => {
      const res = await fetch(src, { credentials: "include", cache: "reload" });
      if (!res.ok) throw new Error(`voice fetch ${res.status}`);
      const buf = await res.arrayBuffer();
      const headerType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
      const type = headerType.startsWith("audio/") ? headerType : sniffAudioMime(buf);
      const blobUrl = URL.createObjectURL(new Blob([buf], { type }));
      objectUrlRef.current = blobUrl;
      return blobUrl;
    })();

    try {
      return await loadPromiseRef.current;
    } catch {
      loadPromiseRef.current = null;
      return null;
    }
  };

  const playFromUrl = async (url: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.src !== url) {
      audio.src = url;
    }
    await audio.play();
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }

    // Play in the click turn first (iOS user-gesture). Network URL streams;
    // blob fallback is for poisoned caches / missing audio Content-Type.
    setIsLoading(true);
    try {
      await playFromUrl(objectUrlRef.current ?? src);
    } catch {
      const blobUrl = await ensureObjectUrl();
      if (!blobUrl) {
        setIsLoading(false);
        return;
      }
      try {
        await playFromUrl(blobUrl);
      } catch {
        setIsPlaying(false);
        setIsLoading(false);
      }
    }
  };

  const seekTo = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(effectiveDuration) || effectiveDuration <= 0) return;
    if (!audio.src) return;
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * effectiveDuration;
    setCurrentTime(audio.currentTime);
  };

  const progress =
    effectiveDuration > 0 ? Math.min(1, currentTime / effectiveDuration) : 0;
  const remaining = isPlaying || currentTime > 0 ? currentTime : effectiveDuration;

  return (
    <div className="flex min-w-[180px] max-w-full items-center gap-2.5 py-0.5">
      <button
        type="button"
        onClick={() => void togglePlay()}
        disabled={!src}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-colors",
          isOwn ? "bg-emerald-600 hover:bg-emerald-700" : "bg-primary hover:bg-primary/90",
        )}
        aria-label={isPlaying ? "Пауза" : "Воспроизвести"}
      >
        {isLoading && !isPlaying ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4" fill="currentColor" />
        ) : (
          <Play className="h-4 w-4 translate-x-[1px]" fill="currentColor" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className="flex h-7 w-full items-center gap-[2px]"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - rect.left) / rect.width);
          }}
          aria-label="Перемотать"
        >
          {WAVE_BARS.map((h, i) => {
            const filled = i / WAVE_BARS.length <= progress;
            return (
              <span
                key={i}
                className={cn(
                  "w-[3px] shrink-0 rounded-full transition-colors",
                  filled
                    ? isOwn
                      ? "bg-emerald-700"
                      : "bg-primary"
                    : "bg-foreground/25",
                )}
                style={{ height: `${Math.max(20, h * 100)}%` }}
              />
            );
          })}
        </button>
        <span className="mt-0.5 block text-[11px] tabular-nums text-muted-foreground">
          {formatTime(remaining)}
        </span>
      </div>
      <audio ref={audioRef} preload="none" className="hidden" />
    </div>
  );
}
