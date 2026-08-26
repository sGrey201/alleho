import { isInstalledPwaSession } from "@/lib/isInstalledPwa";

export type FileTransferProgress = {
  loaded: number;
  /** Null when Content-Length is missing. */
  total: number | null;
};

export type SaveOrShareChatFileOptions = {
  onProgress?: (progress: FileTransferProgress) => void;
};

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
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress?.({ loaded: 0, total });

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.({ loaded, total });
    }
  }

  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headerType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  return new Blob([bytes], {
    type:
      headerType && headerType !== "application/octet-stream"
        ? headerType
        : "application/octet-stream",
  });
}

async function shareFileInPwa(
  url: string,
  filename: string,
  options: SaveOrShareChatFileOptions = {}
): Promise<void> {
  const blob = await fetchBlobWithProgress(url, options.onProgress);
  const type =
    blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : mimeFromFilename(filename);
  const file = new File([blob], filename, { type });

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (!nav.share) {
    throw new Error("Web Share API unavailable");
  }

  const shareData: ShareData = { files: [file], title: filename };
  if (canShareData(nav, shareData)) {
    await nav.share(shareData);
    return;
  }

  await nav.share({
    title: filename,
    url: new URL(url, window.location.origin).href,
  });
}

/**
 * Installed PWA: download then system share sheet (with progress).
 * Browser / desktop: open the file URL like a normal link.
 * AbortError from the share sheet is not treated as failure by callers.
 */
export async function saveOrShareChatFile(
  url: string,
  filename: string,
  options: SaveOrShareChatFileOptions = {}
): Promise<void> {
  if (!url) return;
  if (!isInstalledPwaSession()) {
    openChatFile(url);
    return;
  }
  await shareFileInPwa(url, filename, options);
}
