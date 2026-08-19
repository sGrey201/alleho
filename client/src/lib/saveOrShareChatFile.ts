import { isInstalledPwaSession } from "@/lib/isInstalledPwa";

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
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

function prefersShareSheet(): boolean {
  return isIosDevice() || isInstalledPwaSession();
}

export async function saveOrShareChatFile(url: string, filename: string): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch file (${res.status})`);
  }

  const blob = await res.blob();
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
  const canShareFiles = typeof nav.canShare === "function" ? nav.canShare(shareData) : Boolean(nav.share);
  const keepInApp = prefersShareSheet();

  if (nav.share && (canShareFiles || keepInApp)) {
    try {
      if (canShareFiles) {
        await nav.share(shareData);
      } else {
        await nav.share({
          title: filename,
          url: new URL(url, window.location.origin).href,
        });
      }
      return;
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      if (keepInApp) throw error;
    }
  }

  if (keepInApp) {
    throw new Error("Share is not available");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
  }
}
