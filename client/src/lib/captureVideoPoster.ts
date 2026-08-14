const POSTER_SEEK_SEC = 1;
const POSTER_JPEG_QUALITY = 0.85;
const POSTER_MAX_WIDTH = 640;
const CAPTURE_TIMEOUT_MS = 20_000;

function createCaptureVideo(src: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  return video;
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "seeked",
  timeoutMs = CAPTURE_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Video ${eventName} timeout`));
    }, timeoutMs);

    const onSuccess = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Video load error"));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener(eventName, onSuccess);
      video.removeEventListener("error", onError);
    };

    video.addEventListener(eventName, onSuccess, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function captureVideoFrameBlob(
  video: HTMLVideoElement,
  seekSec = POSTER_SEEK_SEC,
): Promise<Blob | null> {
  await waitForVideoEvent(video, "loadedmetadata");

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const targetTime =
    duration > 0 ? Math.min(seekSec, Math.max(0, duration - 0.05)) : 0;

  video.currentTime = targetTime;
  await waitForVideoEvent(video, "seeked");

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return null;

  const scale = Math.min(1, POSTER_MAX_WIDTH / width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", POSTER_JPEG_QUALITY);
  });
}

async function captureFromObjectUrl(
  objectUrl: string,
  seekSec = POSTER_SEEK_SEC,
): Promise<Blob | null> {
  const video = createCaptureVideo(objectUrl);
  try {
    video.load();
    return await captureVideoFrameBlob(video, seekSec);
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

/** Capture a JPEG poster from a local video file (used on upload). */
export async function captureVideoPosterFromFile(
  file: File,
  seekSec = POSTER_SEEK_SEC,
): Promise<File | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const blob = await captureFromObjectUrl(objectUrl, seekSec);
    if (!blob) return null;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "video";
    return new File([blob], `${baseName}-poster.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
