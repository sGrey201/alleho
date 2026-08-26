import { isInstalledPwaSession } from "@/lib/isInstalledPwa";

/** iOS Web Share with File often fails above ~10MB; stay under that. */
const SHARE_FILE_MAX_BYTES = 9 * 1024 * 1024;

export type FileTransferProgress = {
  loaded: number;
  /** Null when Content-Length is missing. */
  total: number | null;
};

export type SaveOrShareChatFileOptions = {
  onProgress?: (progress: FileTransferProgress) => void;
};

function isMobileShareDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod|Android/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Installed PWA, or mobile browser where in-tab open has no save UI. */
export function shouldUseInAppFileTransfer(): boolean {
  if (isInstalledPwaSession()) return true;
  return isMobileShareDevice() && typeof navigator.share === "function";
}

function mimeFromFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const types: Record<string, string> = {
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pdf: "application/pdf",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    txt: "text/plain",
    rtf: "application/rtf",
  };
  return types[ext] || "application/octet-stream";
}

function canShareData(
  nav: Navigator & { canShare?: (data: ShareData) => boolean },
  data: ShareData
): boolean {
  if (typeof nav.canShare !== "function") return Boolean(nav.share);
  try {
    return nav.canShare(data);
  } catch {
    return false;
  }
}

function withDownloadQuery(url: string, filename: string): string {
  try {
    const absolute = new URL(url, window.location.origin);
    absolute.searchParams.set("download", filename);
    return absolute.pathname + absolute.search;
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}download=${encodeURIComponent(filename)}`;
  }
}

/**
 * Open a chat attachment the way a normal browser link works:
 * navigate to the file URL in a new browsing context (preview/download
 * is decided by the browser from Content-Type). No fetch, no Web Share.
 */
export function openChatFile(url: string): void {
  if (!url) return;
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) return;

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Force attachment download via server Content-Disposition (no in-memory buffer). */
function openAttachmentDownload(url: string, filename: string): void {
  const href = withDownloadQuery(url, filename);
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

async function fetchBlobWithProgress(
  url: string,
  onProgress?: (progress: FileTransferProgress) => void
): Promise<Blob> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch file (${res.status})`);
  }

  const contentLengthHeader = res.headers.get("content-length");
  const totalFromHeader = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  const total = Number.isFinite(totalFromHeader) && totalFromHeader > 0 ? totalFromHeader : null;

  if (!res.body) {
    const blob = await res.blob();
    onProgress?.({ loaded: blob.size, total: total ?? blob.size });
    return blob;
  }

  const reader = res.body.getReader();
  const chunks: BlobPart[] = [];
  let loaded = 0;
  onProgress?.({ loaded: 0, total });

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      // Copy chunk — the underlying buffer may be reused by the stream.
      chunks.push(value.slice());
      loaded += value.byteLength;
      onProgress?.({ loaded, total });
    }
  }

  const headerType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const type =
    headerType && headerType !== "application/octet-stream"
      ? headerType
      : "application/octet-stream";
  // Avoid allocating a second full-size Uint8Array (OOM on large mobile downloads).
  return new Blob(chunks, { type });
}

async function shareOrSaveBlob(
  blob: Blob,
  url: string,
  filename: string
): Promise<void> {
  const type =
    blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : mimeFromFilename(filename);

  const tooLargeForShare = blob.size > SHARE_FILE_MAX_BYTES;
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };

  if (!tooLargeForShare && nav.share) {
    const file = new File([blob], filename, { type });
    const shareData: ShareData = { files: [file], title: filename };
    try {
      if (canShareData(nav, shareData)) {
        await nav.share(shareData);
        return;
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      // Fall through to download fallbacks.
    }
  }

  // Large files / share unavailable: try blob download (works on many Android PWAs).
  try {
    triggerBlobDownload(blob, filename);
    return;
  } catch {
    /* continue */
  }

  // Last resort: server attachment URL (streams, no second full buffer).
  openAttachmentDownload(url, filename);
}

/**
 * Mobile / installed PWA: download with progress, then system share (or save fallback).
 * Desktop browser: open the file URL like a normal link.
 * AbortError from the share sheet is not treated as failure by callers.
 */
export async function saveOrShareChatFile(
  url: string,
  filename: string,
  options: SaveOrShareChatFileOptions = {}
): Promise<void> {
  if (!url) return;
  if (!shouldUseInAppFileTransfer()) {
    openChatFile(url);
    return;
  }

  // Let React paint the progress ring before the network work starts.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

  const blob = await fetchBlobWithProgress(url, options.onProgress);
  options.onProgress?.({ loaded: blob.size, total: blob.size });
  await shareOrSaveBlob(blob, url, filename);
}
