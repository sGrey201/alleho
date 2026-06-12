import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceRecorderStatus = "idle" | "requesting" | "recording" | "error";

export interface RecordedVoice {
  blob: Blob;
  durationSec: number;
  mimeType: string;
  /** File extension matching the recorded mime type (no leading dot). */
  ext: string;
}

/** Prefer mp4/aac for cross-platform playback (iOS can't play webm/opus). */
const MIME_CANDIDATES: Array<{ mime: string; ext: string }> = [
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/aac", ext: "aac" },
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
];

function pickMimeType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate.mime)) return candidate;
    } catch {
      // ignore unsupported query
    }
  }
  return null;
}

export function isVoiceRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    pickMimeType() !== null
  );
}

/**
 * Records microphone audio via MediaRecorder.
 *
 * `stop()` resolves with the recorded clip (or null if it was too short / empty);
 * `cancel()` discards the recording and releases the mic.
 */
export function useVoiceRecorder() {
  const [status, setStatus] = useState<VoiceRecorderStatus>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const canceledRef = useRef(false);
  const mimeRef = useRef<{ mime: string; ext: string } | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async (): Promise<boolean> => {
    if (recorderRef.current) return false;
    const picked = pickMimeType();
    if (!picked || !navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      return false;
    }
    setStatus("requesting");
    canceledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      mimeRef.current = picked;
      const recorder = new MediaRecorder(stream, { mimeType: picked.mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setStatus("recording");
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 100);
      return true;
    } catch {
      cleanup();
      setStatus("error");
      return false;
    }
  }, [cleanup]);

  const finalize = useCallback(
    (resolve: (clip: RecordedVoice | null) => void) => {
      const recorder = recorderRef.current;
      const picked = mimeRef.current;
      const durationSec = Math.round((Date.now() - startedAtRef.current) / 1000);
      if (!recorder || !picked) {
        cleanup();
        setStatus("idle");
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: picked.mime });
        cleanup();
        setStatus("idle");
        setElapsedMs(0);
        if (canceledRef.current || blob.size === 0) {
          resolve(null);
          return;
        }
        resolve({ blob, durationSec, mimeType: picked.mime, ext: picked.ext });
      };
      try {
        recorder.stop();
      } catch {
        cleanup();
        setStatus("idle");
        resolve(null);
      }
    },
    [cleanup]
  );

  const stop = useCallback((): Promise<RecordedVoice | null> => {
    canceledRef.current = false;
    return new Promise((resolve) => finalize(resolve));
  }, [finalize]);

  const cancel = useCallback((): Promise<null> => {
    canceledRef.current = true;
    return new Promise((resolve) => finalize(() => resolve(null)));
  }, [finalize]);

  return { status, elapsedMs, start, stop, cancel, isRecording: status === "recording" };
}
