/** Above this size, mobile Web Share + in-memory File often fails (iOS PWA especially). */
const SHARE_VIA_BLOB_MAX_BYTES = 4 * 1024 * 1024;

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAndroidDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
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

function shouldUseShareSheet(): boolean {
  return isIosDevice() || isAndroidDevice();
}

function triggerDownload(url: string, filename: string, openInNewTab: boolean) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener noreferrer";
  if (openInNewTab) a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
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

/** Open same-origin file URL without buffering (works in standalone PWA). */
function openFileInBrowser(url: string, filename: string): void {
  const href = withDownloadQuery(url, filename);
  const opened = window.open(href, "_blank", "noopener,noreferrer");
  if (opened) return;
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export type SaveOrShareChatFileOptions = {
  /** Declared size from message metadata when known. */
  knownSize?: number;
  onStatus?: (status: "loading" | "sharing") => void;
};

export async function saveOrShareChatFile(
  url: string,
  filename: string,
  options: SaveOrShareChatFileOptions = {}
): Promise<void> {
  if (!shouldUseShareSheet()) {
    triggerDownload(url, filename, true);
    return;
  }

  const known = options.knownSize;
  if (typeof known === "number" && Number.isFinite(known) && known > SHARE_VIA_BLOB_MAX_BYTES) {
    openFileInBrowser(url, filename);
    return;
  }

  options.onStatus?.("loading");

  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch file (${res.status})`);
  }

  const contentLengthHeader = res.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  if (Number.isFinite(contentLength) && contentLength > SHARE_VIA_BLOB_MAX_BYTES) {
    // Avoid buffering multi‑MB bodies into JS heap for Web Share.
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    openFileInBrowser(url, filename);
    return;
  }

  const blob = await res.blob();
  if (blob.size > SHARE_VIA_BLOB_MAX_BYTES) {
    openFileInBrowser(url, filename);
    return;
  }

  const type =
    blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : mimeFromFilename(filename);
  const file = new File([blob], filename, { type });

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  const shareData: ShareData = { files: [file], title: filename };
  const canShareFiles = canShareData(nav, shareData);

  options.onStatus?.("sharing");

  if (nav.share) {
    try {
      if (canShareFiles) {
        await nav.share(shareData);
      } else {
        await nav.share({
          title: filename,
          url: new URL(withDownloadQuery(url, filename), window.location.origin).href,
        });
      }
      return;
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      // Share failed (common for larger files / standalone PWA) — open instead of silent <a download>.
      openFileInBrowser(url, filename);
      return;
    }
  }

  openFileInBrowser(url, filename);
}
