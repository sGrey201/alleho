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

/** @deprecated Use openChatFile — kept for older call sites. */
export function saveOrShareChatFile(url: string, _filename?: string): void {
  openChatFile(url);
}
