/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { MEDIA_THUMB_CACHE } from "./lib/offlineCacheConfig";
import { APP_HOME_PATH } from "@shared/brand";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA offline: serve precached index.html for client-side routes (e.g. /messenger/...).
const navigationHandler = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//, /^\/objects\//],
  })
);

registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    url.pathname.startsWith("/objects/") &&
    url.searchParams.get("size") === "thumb",
  new CacheFirst({
    cacheName: MEDIA_THUMB_CACHE,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 500,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

registerRoute(
  ({ url, request }) => {
    if (request.method !== "GET" || !url.pathname.startsWith("/objects/")) return false;
    if (url.searchParams.get("size") === "thumb") return false;
    // Full attachments stream from the network only — SW caching of multi‑MB
    // bodies breaks progress UI and OOMs mobile downloads.
    return true;
  },
  new NetworkOnly()
);

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await caches.delete("media-files-v1");
      await caches.delete("media-files-v2");
    })()
  );
});

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload: PushPayload = {};
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { body: event.data.text() };
  }

  const title = payload.title ?? "hovial";
  const options: NotificationOptions = {
    body: payload.body ?? "",
    tag: payload.tag,
    data: { url: payload.url ?? APP_HOME_PATH },
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path =
    typeof event.notification.data?.url === "string" ? event.notification.data.url : APP_HOME_PATH;
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (!client.url.startsWith(self.location.origin)) continue;
        const windowClient = client as WindowClient;
        if (typeof windowClient.navigate === "function") {
          return windowClient.navigate(targetUrl).then(() => windowClient.focus());
        }
        return windowClient.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
