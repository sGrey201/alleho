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

function extensionForMime(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/zip": "zip",
    "text/plain": "txt",
    "application/rtf": "rtf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  };
  return map[mime.toLowerCase()] || "bin";
}

/** Strip path junk and ensure a usable basename for Share / download. */
export function normalizeShareFilename(
  raw: string | null | undefined,
  mime?: string
): string {
  let name = (raw ?? "")
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\r\n\0]/g, "_")
    .trim() ?? "";

  const generic =
    !name ||
    name === "Файл" ||
    name.toLowerCase() === "file" ||
    name === "download" ||
    name === "untitled";

  if (generic) {
    name = `file.${extensionForMime(mime || "application/octet-stream")}`;
  } else if (!/\.[a-z0-9]{1,8}$/i.test(name) && mime) {
    name = `${name}.${extensionForMime(mime)}`;
  }

  return name.slice(0, 180) || "file.bin";
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
  #bar.pulse{width:40% !important;animation:pulse 1.1s ease-in-out infinite}
  @keyframes pulse{0%{transform:translateX(-100%);opacity:.85}100%{transform:translateX(250%);opacity:.85}}
  #pct{margin:0;font-size:13px;color:#666;min-height:1.2em}
  #frame{position:fixed;inset:0;border:0;width:100%;height:100%;display:none;background:#fff}
  #share{display:none;position:fixed;right:16px;bottom:max(16px,env(safe-area-inset-bottom));z-index:2;
    padding:10px 14px;border-radius:10px;border:0;background:#6B7042;color:#fff;font-size:14px;font-family:inherit;cursor:pointer}
  #share:disabled{opacity:.6}
</style>
</head>
<body>
  <div id="ui">
    <p id="label">Загрузка файла…</p>
    <div class="track"><div id="bar"></div></div>
    <p id="pct"></p>
  </div>
  <iframe id="frame" title="preview"></iframe>
  <button type="button" id="share">Поделиться</button>
  <script>
    function formatBytes(n) {
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' КБ';
      return (n / (1024 * 1024)).toFixed(1) + ' МБ';
    }
    var state = { url: '', filename: 'file', mime: 'application/octet-stream' };
    var bar = document.getElementById('bar');
    var pct = document.getElementById('pct');
    var label = document.getElementById('label');
    var ui = document.getElementById('ui');
    var frame = document.getElementById('frame');
    var shareBtn = document.getElementById('share');

    function downloadFallback(blob) {
      var objectUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = objectUrl;
      a.download = state.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 60000);
    }

    shareBtn.addEventListener('click', async function () {
      shareBtn.disabled = true;
      try {
        var res = await fetch(state.url);
        var blob = await res.blob();
        var file = new File([blob], state.filename, {
          type: state.mime || blob.type || 'application/octet-stream',
        });
        if (navigator.share) {
          try {
            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file], title: state.filename });
              return;
            }
          } catch (err) {
            if (err && err.name === 'AbortError') return;
          }
        }
        downloadFallback(blob);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        try {
          var res2 = await fetch(state.url);
          downloadFallback(await res2.blob());
        } catch (e2) {}
      } finally {
        shareBtn.disabled = false;
      }
    });

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
          pct.textContent = typeof d.loaded === 'number' && d.loaded > 0
            ? formatBytes(d.loaded)
            : '';
        }
      } else if (d.type === 'hovial-done') {
        state.url = d.url || '';
        state.filename = d.filename || 'file';
        state.mime = d.mime || 'application/octet-stream';
        document.title = state.filename;
        ui.style.display = 'none';
        shareBtn.style.display = 'inline-block';
        frame.style.display = 'block';
        frame.src = state.url;
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
};

function openProgressLoader(): LoaderSession | null {
  // about:blank inherits this origin, so Web Share keeps the real File.name.
  // (A blob: HTML tab often shares as empty / UUID.)
  const win = window.open("about:blank", "_blank");
  if (!win) return null;
  try {
    win.document.open();
    win.document.write(LOADER_HTML);
    win.document.close();
  } catch {
    try {
      win.close();
    } catch {
      /* ignore */
    }
    return null;
  }
  return { win };
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
  // XHR reports download progress while bytes arrive. fetch()+stream often
  // buffers the whole body first on mobile, so the bar stays at 0 until done.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.withCredentials = true;
    xhr.responseType = "blob";
    xhr.setRequestHeader("Cache-Control", "no-cache");

    let lastSent = 0;
    const emit = (loaded: number, total: number | null) => {
      const now = performance.now();
      // Throttle UI posts a bit, but always allow first and last updates.
      if (loaded > 0 && loaded !== total && now - lastSent < 50) return;
      lastSent = now;
      onProgress?.({ loaded, total });
    };

    xhr.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        emit(event.loaded, event.total);
      } else {
        emit(event.loaded, null);
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Failed to fetch file (${xhr.status})`));
        return;
      }
      const blob = xhr.response as Blob;
      const size = blob?.size ?? 0;
      onProgress?.({ loaded: size, total: size });
      resolve(blob);
    };

    xhr.onerror = () => reject(new Error("Failed to fetch file"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

    emit(0, null);
    xhr.send();
  });
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

  const { win } = session;
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
    const safeName = normalizeShareFilename(filename, typed.mime);
    const objectUrl = URL.createObjectURL(typed.blob);
    postToLoader(win, {
      type: "hovial-done",
      url: objectUrl,
      filename: safeName,
      mime: typed.mime,
    });
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 180_000);
  } catch (error) {
    postToLoader(win, {
      type: "hovial-error",
      message: "Не удалось загрузить файл",
    });
    throw error;
  }
}
