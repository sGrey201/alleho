import { isInstalledPwaSession } from "@/lib/isInstalledPwa";

export type FileTransferProgress = {
  loaded: number;
  /** Null when Content-Length is missing. */
  total: number | null;
};

export type SaveOrShareChatFileOptions = {
  onProgress?: (progress: FileTransferProgress) => void;
};

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod|Android/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Installed PWA or mobile: download with progress, then open preview. */
export function shouldUseInAppFileTransfer(): boolean {
  return isInstalledPwaSession() || isMobileDevice();
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
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  return types[ext] || "application/octet-stream";
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Open a chat attachment the way a normal browser link works (desktop).
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

/** Must run inside the click gesture — later window.open(blob) is blocked. */
function openPreviewPlaceholder(): Window | null {
  const w = window.open("about:blank", "_blank");
  if (!w) return null;
  try {
    w.document.title = "…";
    w.document.body.replaceChildren();
    const p = w.document.createElement("p");
    p.textContent = "Загрузка…";
    p.style.cssText =
      "font-family:system-ui,sans-serif;padding:24px;color:#666;margin:0;";
    w.document.body.appendChild(p);
  } catch {
    /* cross-opaque about:blank on some engines — location.replace still works */
  }
  return w;
}

function blobObjectUrl(blob: Blob, filename: string): string {
  const headerType = (blob.type || "").split(";")[0]!.trim();
  const type =
    headerType && headerType !== "application/octet-stream"
      ? headerType
      : mimeFromFilename(filename);
  const previewBlob = blob.type === type ? blob : new Blob([blob], { type });
  return URL.createObjectURL(previewBlob);
}

function navigatePreviewToBlob(previewWindow: Window | null, objectUrl: string): void {
  if (previewWindow && !previewWindow.closed) {
    try {
      previewWindow.location.replace(objectUrl);
      return;
    } catch {
      /* fall through */
    }
  }
  const a = document.createElement("a");
  a.href = objectUrl;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
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
  let pending: FileTransferProgress | null = null;
  let raf = 0;

  const flushProgress = () => {
    raf = 0;
    if (pending) {
      onProgress?.(pending);
      pending = null;
    }
  };

  const report = (next: FileTransferProgress) => {
    pending = next;
    if (!raf) {
      raf = requestAnimationFrame(flushProgress);
    }
  };

  report({ loaded: 0, total });

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value.slice());
      loaded += value.byteLength;
      report({ loaded, total });
    }
  }

  if (raf) {
    cancelAnimationFrame(raf);
    flushProgress();
  }
  onProgress?.({ loaded, total: total ?? loaded });

  const headerType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const type =
    headerType && headerType !== "application/octet-stream"
      ? headerType
      : "application/octet-stream";
  return new Blob(chunks, { type });
}

/**
 * Mobile / installed PWA: download with progress, then open an in-app preview tab.
 * Desktop browser: open the file URL like a normal link.
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

  // Open the tab while we still have the user gesture (required on iOS/PWA).
  const previewWindow = openPreviewPlaceholder();

  await waitForNextPaint();

  try {
    const blob = await fetchBlobWithProgress(url, options.onProgress);
    const objectUrl = blobObjectUrl(blob, filename);
    navigatePreviewToBlob(previewWindow, objectUrl);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
  } catch (error) {
    try {
      previewWindow?.close();
    } catch {
      /* ignore */
    }
    throw error;
  }
}
