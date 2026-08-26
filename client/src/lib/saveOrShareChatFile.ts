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

/** Same-origin object URL with inline Content-Disposition filename. */
export function withInlineFilename(url: string, filename: string): string {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    parsed.searchParams.delete("download");
    parsed.searchParams.set("name", filename);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}name=${encodeURIComponent(filename)}`;
  }
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
  #label{margin:0;font-size:15px;text-align:center;max-width:20rem}
  #name{margin:0;font-size:13px;color:#666;text-align:center;max-width:20rem;word-break:break-word;display:none}
  .track{position:relative;width:min(280px,80vw);height:8px;border-radius:999px;background:#e5e5ea;overflow:hidden}
  #bar{height:100%;width:0%;border-radius:999px;background:#6B7042;transition:width .12s linear}
  .track.indeterminate #bar{width:0 !important;transition:none}
  .track.indeterminate::after{
    content:'';position:absolute;top:0;left:0;height:100%;width:40%;border-radius:999px;background:#6B7042;
    animation:indeterminate 1.1s ease-in-out infinite}
  @keyframes indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}
  #pct{margin:0;font-size:13px;color:#666;min-height:1.2em}
  .actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:4px}
  .actions button{
    padding:10px 18px;border-radius:10px;border:1px solid #c7c7cc;background:#fff;
    color:#222;font-size:14px;font-family:inherit;cursor:pointer}
  .actions button.primary{background:#6B7042;border-color:#6B7042;color:#fff}
  .actions button:disabled{opacity:.5}
  #actionsReady{display:none}
</style>
</head>
<body>
  <div id="ui">
    <p id="label">Загрузка файла…</p>
    <p id="name"></p>
    <div class="track" id="track"><div id="bar"></div></div>
    <p id="pct"></p>
    <div class="actions" id="actionsLoading">
      <button type="button" id="cancel">Отмена</button>
    </div>
    <div class="actions" id="actionsReady">
      <button type="button" class="primary" id="view">Смотреть</button>
      <button type="button" id="share">Поделиться</button>
      <button type="button" id="closeReady">Закрыть</button>
    </div>
  </div>
  <script>
    function formatBytes(n) {
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' КБ';
      return (n / (1024 * 1024)).toFixed(1) + ' МБ';
    }
    var state = { url: '', filename: 'file', mime: 'application/octet-stream' };
    var bar = document.getElementById('bar');
    var track = document.getElementById('track');
    var pct = document.getElementById('pct');
    var label = document.getElementById('label');
    var nameEl = document.getElementById('name');
    var cancelBtn = document.getElementById('cancel');
    var viewBtn = document.getElementById('view');
    var shareBtn = document.getElementById('share');
    var closeReadyBtn = document.getElementById('closeReady');
    var actionsLoading = document.getElementById('actionsLoading');
    var actionsReady = document.getElementById('actionsReady');
    var maxRatio = 0;
    var finished = false;

    function requestCancel() {
      if (finished) return;
      finished = true;
      cancelBtn.disabled = true;
      label.textContent = 'Отмена…';
      if (window.opener) {
        try { window.opener.postMessage({ type: 'hovial-cancel' }, '*'); } catch (e) {}
      }
      try { window.close(); } catch (e2) {}
    }
    cancelBtn.addEventListener('click', requestCancel);
    closeReadyBtn.addEventListener('click', function () {
      try { window.close(); } catch (e) {}
    });

    viewBtn.addEventListener('click', function () {
      if (!state.url) return;
      var opened = window.open(state.url, '_blank');
      if (!opened) {
        try { location.assign(state.url); } catch (e) {}
      }
    });

    shareBtn.addEventListener('click', async function () {
      if (!state.url) return;
      shareBtn.disabled = true;
      try {
        var res = await fetch(state.url, { credentials: 'include', cache: 'force-cache' });
        if (!res.ok) throw new Error('fetch failed');
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
        var objectUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = objectUrl;
        a.download = state.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 60000);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        label.textContent = 'Не удалось поделиться файлом';
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
        if (finished) return;
        if (typeof d.total === 'number' && d.total > 0) {
          track.classList.remove('indeterminate');
          var r = Math.max(0, Math.min(1, d.loaded / d.total));
          if (r < maxRatio) r = maxRatio;
          maxRatio = r;
          bar.style.width = (r * 100) + '%';
          pct.textContent = Math.round(r * 100) + '%';
        } else if (typeof d.loaded === 'number' && d.loaded > 0) {
          track.classList.add('indeterminate');
          bar.style.width = '0%';
          pct.textContent = formatBytes(d.loaded);
        }
      } else if (d.type === 'hovial-done') {
        finished = true;
        state.url = d.url || '';
        state.filename = d.filename || 'file';
        state.mime = d.mime || 'application/octet-stream';
        track.classList.remove('indeterminate');
        maxRatio = 1;
        bar.style.width = '100%';
        pct.textContent = '100%';
        label.textContent = 'Файл готов';
        nameEl.style.display = 'block';
        nameEl.textContent = state.filename;
        document.title = state.filename;
        actionsLoading.style.display = 'none';
        actionsReady.style.display = 'flex';
      } else if (d.type === 'hovial-error') {
        finished = true;
        cancelBtn.textContent = 'Закрыть';
        cancelBtn.disabled = false;
        cancelBtn.onclick = function () { try { window.close(); } catch (e) {} };
        track.classList.remove('indeterminate');
        bar.style.width = '0%';
        maxRatio = 0;
        label.textContent = d.message || 'Не удалось загрузить файл';
        pct.textContent = '';
        actionsReady.style.display = 'none';
      } else if (d.type === 'hovial-cancelled') {
        finished = true;
        try { window.close(); } catch (e) {}
      }
    });
  </script>
</body>
</html>`;

type LoaderSession = {
  win: Window;
};

function openProgressLoader(): LoaderSession | null {
  // about:blank inherits this origin so postMessage stays same-site.
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

type PrefetchHandle = {
  promise: Promise<void>;
  abort: () => void;
};

/**
 * Prefetch with XHR so the progress UI can update. Opening/sharing happens
 * later via user taps (needed for popup + Web Share activation).
 */
function prefetchWithProgress(
  url: string,
  onProgress?: (progress: FileTransferProgress) => void
): PrefetchHandle {
  const xhr = new XMLHttpRequest();
  let settled = false;

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open("GET", url, true);
    xhr.withCredentials = true;
    xhr.responseType = "blob";

    let lastSent = 0;
    let maxLoaded = 0;
    let knownTotal: number | null = null;

    const emit = (loaded: number, total: number | null) => {
      if (loaded < maxLoaded) return;
      maxLoaded = loaded;
      if (total != null && total > 0) knownTotal = total;
      const now = performance.now();
      if (loaded > 0 && knownTotal != null && loaded < knownTotal && now - lastSent < 50) {
        return;
      }
      lastSent = now;
      onProgress?.({ loaded, total: knownTotal });
    };

    xhr.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        emit(event.loaded, event.total);
      } else if (event.loaded > 0 && knownTotal == null) {
        emit(event.loaded, null);
      }
    };

    xhr.onload = () => {
      settled = true;
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Failed to fetch file (${xhr.status})`));
        return;
      }
      const size = (xhr.response as Blob)?.size ?? knownTotal ?? maxLoaded;
      onProgress?.({ loaded: size, total: size });
      resolve();
    };

    xhr.onerror = () => {
      settled = true;
      reject(new Error("Failed to fetch file"));
    };
    xhr.onabort = () => {
      settled = true;
      reject(new DOMException("Aborted", "AbortError"));
    };

    xhr.send();
  });

  return {
    promise,
    abort: () => {
      if (!settled) xhr.abort();
    },
  };
}

/**
 * Mobile / installed PWA: open a progress tab, prefetch the file, then offer
 * View (new tab) and Share. Desktop: open the URL like a normal link.
 */
export async function saveOrShareChatFile(url: string, filename: string): Promise<void> {
  if (!url) return;
  if (!shouldUseInAppFileTransfer()) {
    openChatFile(url);
    return;
  }

  const session = openProgressLoader();
  if (!session) {
    openChatFile(url);
    return;
  }

  const { win } = session;
  await waitForLoaderReady(win);

  const safeName = normalizeShareFilename(filename, mimeFromFilename(filename));
  const inlinePath = withInlineFilename(url, safeName);
  const inlineUrl = new URL(inlinePath, window.location.origin).href;
  const mime = mimeFromFilename(safeName);

  let prefetch: PrefetchHandle | null = null;
  let cancelled = false;

  const onCancelMessage = (event: MessageEvent) => {
    if (event.source !== win) return;
    if (!event.data || event.data.type !== "hovial-cancel") return;
    cancelled = true;
    prefetch?.abort();
  };
  window.addEventListener("message", onCancelMessage);

  const closedPoll = window.setInterval(() => {
    if (win.closed) {
      cancelled = true;
      prefetch?.abort();
      window.clearInterval(closedPoll);
    }
  }, 400);

  try {
    prefetch = prefetchWithProgress(inlineUrl, (progress) => {
      if (cancelled) return;
      postToLoader(win, {
        type: "hovial-progress",
        loaded: progress.loaded,
        total: progress.total,
      });
    });
    await prefetch.promise;
    if (cancelled || win.closed) {
      throw new DOMException("Aborted", "AbortError");
    }
    postToLoader(win, {
      type: "hovial-done",
      url: inlineUrl,
      filename: safeName,
      mime,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError" || cancelled) {
      postToLoader(win, { type: "hovial-cancelled" });
      throw new DOMException("Aborted", "AbortError");
    }
    postToLoader(win, {
      type: "hovial-error",
      message: "Не удалось загрузить файл",
    });
    throw error;
  } finally {
    window.removeEventListener("message", onCancelMessage);
    window.clearInterval(closedPoll);
  }
}
