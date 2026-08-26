import { isInstalledPwaSession } from "@/lib/isInstalledPwa";

export type FileTransferProgress = {
  loaded: number;
  total: number | null;
};

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod|Android/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Installed PWA or mobile: download with progress in a preview tab. */
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

const LOADER_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Загрузка…</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;font-family:system-ui,-apple-system,sans-serif;background:#f7f7f8;color:#222}
  #ui{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100%;padding:24px;gap:12px}
  #label{margin:0;font-size:15px}
  .track{width:min(280px,80vw);height:8px;border-radius:999px;background:#e5e5ea;overflow:hidden}
  #bar{height:100%;width:0%;border-radius:999px;background:#6B7042;transition:width .15s linear}
  #bar.pulse{width:35% !important;animation:pulse 1s ease-in-out infinite}
  @keyframes pulse{0%,100%{transform:translateX(0);opacity:.7}50%{transform:translateX(180%);opacity:1}}
  #pct{margin:0;font-size:13px;color:#666;min-height:1.2em}
  #frame{position:fixed;inset:0;border:0;width:100%;height:100%;display:none;background:#fff}
  #save{display:none;position:fixed;right:16px;bottom:max(16px,env(safe-area-inset-bottom));z-index:2;
    padding:10px 14px;border-radius:10px;background:#6B7042;color:#fff;text-decoration:none;font-size:14px}
</style>
</head>
<body>
  <div id="ui">
    <p id="label">Загрузка файла…</p>
    <div class="track"><div id="bar"></div></div>
    <p id="pct"></p>
  </div>
  <iframe id="frame" title="preview"></iframe>
  <a id="save" download>Сохранить</a>
  <script>
    const bar = document.getElementById('bar');
    const pct = document.getElementById('pct');
    const label = document.getElementById('label');
    const ui = document.getElementById('ui');
    const frame = document.getElementById('frame');
    const save = document.getElementById('save');
    if (window.opener) {
      try { window.opener.postMessage({ type: 'hovial-loader-ready' }, '*'); } catch (e) {}
    }
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'hovial-progress') {
        if (typeof d.total === 'number' && d.total > 0) {
          bar.classList.remove('pulse');
          var r = Math.max(0, Math.min(1, d.loaded / d.total));
          bar.style.width = (r * 100) + '%';
          pct.textContent = Math.round(r * 100) + '%';
        } else {
          bar.classList.add('pulse');
          pct.textContent = '';
        }
      } else if (d.type === 'hovial-done') {
        document.title = d.filename || 'Файл';
        ui.style.display = 'none';
        save.href = d.url;
        save.download = d.filename || 'file';
        save.style.display = 'inline-block';
        frame.style.display = 'block';
        frame.src = d.url;
        // Also try top-level navigation for engines that render PDF better that way.
        try {
          var mime = (d.mime || '').toLowerCase();
          if (mime.indexOf('pdf') !== -1 || mime.indexOf('image/') === 0 || mime.indexOf('text/') === 0) {
            setTimeout(function () {
              try { location.replace(d.url); } catch (err) {}
            }, 50);
          }
        } catch (err2) {}
      } else if (d.type === 'hovial-error') {
        bar.classList.remove('pulse');
        bar.style.width = '0%';
        label.textContent = d.message || 'Не удалось загрузить файл';
        pct.textContent = '';
      }
    });
  </script>
</body>
</html>`;

type LoaderSession = {
  win: Window;
  loaderUrl: string;
};

function openProgressLoader(): LoaderSession | null {
  const loaderUrl = URL.createObjectURL(
    new Blob([LOADER_HTML], { type: "text/html;charset=utf-8" })
  );
  const win = window.open(loaderUrl, "_blank");
  if (!win) {
    URL.revokeObjectURL(loaderUrl);
    return null;
  }
  return { win, loaderUrl };
}

function waitForLoaderReady(win: Window, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== win) return;
      if (!event.data || event.data.type !== "hovial-loader-ready") return;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve();
    }, timeoutMs);
    window.addEventListener("message", onMessage);
  });
}

function postToLoader(win: Window, payload: Record<string, unknown>): void {
  try {
    if (!win.closed) win.postMessage(payload, "*");
  } catch {
    /* ignore */
  }
}

function typedBlob(blob: Blob, filename: string): { blob: Blob; mime: string } {
  const headerType = (blob.type || "").split(";")[0]!.trim();
  const mime =
    headerType && headerType !== "application/octet-stream"
      ? headerType
      : mimeFromFilename(filename);
  if (blob.type === mime) return { blob, mime };
  return { blob: new Blob([blob], { type: mime }), mime };
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
    if (!raf) raf = requestAnimationFrame(flushProgress);
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
 * Mobile / installed PWA: open a progress tab immediately, fetch the file, then
 * show it in that same tab. Desktop: open the URL like a normal link.
 */
export async function saveOrShareChatFile(url: string, filename: string): Promise<void> {
  if (!url) return;
  if (!shouldUseInAppFileTransfer()) {
    openChatFile(url);
    return;
  }

  const session = openProgressLoader();
  if (!session) {
    // Popup blocked — last resort: navigate current context.
    openChatFile(url);
    return;
  }

  const { win, loaderUrl } = session;
  await waitForLoaderReady(win);

  try {
    const blob = await fetchBlobWithProgress(url, (progress) => {
      postToLoader(win, {
        type: "hovial-progress",
        loaded: progress.loaded,
        total: progress.total,
      });
    });
    const typed = typedBlob(blob, filename);
    const objectUrl = URL.createObjectURL(typed.blob);
    postToLoader(win, {
      type: "hovial-done",
      url: objectUrl,
      filename,
      mime: typed.mime,
    });
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      URL.revokeObjectURL(loaderUrl);
    }, 180_000);
  } catch (error) {
    postToLoader(win, {
      type: "hovial-error",
      message: "Не удалось загрузить файл",
    });
    window.setTimeout(() => URL.revokeObjectURL(loaderUrl), 30_000);
    throw error;
  }
}
