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

export async function saveOrShareChatFile(url: string, filename: string): Promise<void> {
  if (!shouldUseShareSheet()) {
    triggerDownload(url, filename, true);
    return;
  }

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
  const canShareFiles = canShareData(nav, shareData);

  if (nav.share) {
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
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    triggerDownload(objectUrl, filename, false);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
  }
}
