/// <reference lib="webworker" />
import { urlBase64ToUint8Array } from "./lib/base64";
import {
  addNotification,
  NOTIFICATION_MESSAGE,
  syncAppBadge,
} from "./lib/notifications";
import { createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: ServiceWorkerGlobalScope;

// Exactly one occurrence of self.__WB_MANIFEST — Workbox replaces this token
// with the generated precache list and errors if it finds more than one.
precacheAndRoute(self.__WB_MANIFEST);

// SPA deep links: /match/<id> is not a real file. Without this, opening a
// match URL offline gives a 404 instead of the app.
//
// Production only. In dev, vite-plugin-pwa injects an EMPTY precache manifest
// (`precacheAndRoute([])`), and createHandlerBoundToURL throws synchronously
// when its URL is not in that manifest. That throw happens during module
// evaluation, so the worker never installs — which leaves
// navigator.serviceWorker.ready pending forever and hangs anything awaiting
// it, such as the push subscribe flow. Vite's dev server already does SPA
// fallback, so this route buys nothing there anyway.
if (import.meta.env.PROD) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));
}

// Never cache: SSE is a long-lived response, and the live list must be fresh
// or absent — a cached one is worse than none.
registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/api/") &&
    (url.pathname.endsWith("/stream") || url.pathname === "/api/matches/live"),
  new NetworkOnly(),
);

// Everything else under /api: try the network, fall back to cache offline.
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "api",
    networkTimeoutSeconds: 4,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
  }),
);

/*
 * Team and league badges from the CDN.
 *
 * These are cross-origin images, so the browser requests them in `no-cors`
 * mode and gets an OPAQUE response: status 0, ok false. NetworkFirst reads
 * that as a network failure, falls back to a cache that is empty because
 * opaque responses are not cacheable by default, and the image fails to load
 * outright — which broke every badge in the app whenever the worker was
 * active.
 *
 * CacheFirst is also simply correct here: a badge at a given URL never
 * changes, so revalidating it on every page view is wasted work.
 */
registerRoute(
  ({ url }) => url.hostname.endsWith("thesportsdb.com"),
  new CacheFirst({
    cacheName: "badges",
    plugins: [
      // Explicitly allow status 0 so opaque responses are stored.
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 60 * 60 * 24 * 30,
        purgeOnQuotaError: true,
      }),
    ],
  }),
);

self.addEventListener("install", () => void self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

type PushPayload = { title: string; body: string; matchId: string };

/**
 * `renotify` is part of the Notifications API but missing from TypeScript's
 * lib.dom NotificationOptions, so it has to be widened here.
 */
type SwNotificationOptions = NotificationOptions & { renotify?: boolean };

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let p: PushPayload;
  try {
    p = event.data.json() as PushPayload;
  } catch {
    // A malformed payload must not throw inside the handler — that would
    // leave the push unacknowledged and can get the subscription throttled.
    return;
  }

  const options: SwNotificationOptions = {
    body: p.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Same tag = a later goal replaces the earlier notification for this
    // match, so five goals don't leave five entries in the tray.
    tag: `match-${p.matchId}`,
    // ...but without renotify, replacing a notification is SILENT. Goals
    // 2 and 3 would swap the text in with no alert at all.
    renotify: true,
    data: { matchId: p.matchId },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(p.title, options);

      // Record it so the in-app notification centre can show pushes that
      // arrived while the app was closed — a worker cannot reach React state,
      // and the OS tray is cleared by the user, not by us.
      await addNotification({
        id: `${p.matchId}:${Date.now()}`,
        title: p.title,
        body: p.body,
        matchId: p.matchId,
        at: Date.now(),
      });

      // Badge the home-screen icon with the unread count. The page may not
      // be open, so this has to happen here rather than in React.
      await syncAppBadge(self);

      // Nudge any open tab to re-read the store immediately.
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) c.postMessage({ type: NOTIFICATION_MESSAGE });
    })(),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const { matchId } = event.notification.data as { matchId: string };
  const url = `/match/${matchId}`;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Reuse an open tab if we have one rather than piling up windows.
      for (const c of clients) {
        if (c.url.includes(url)) return c.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});

/**
 * The push service can invalidate and reissue a subscription at any time —
 * key rotation, quota, browser housekeeping. The spec fires this event so the
 * app can re-register. Without handling it the user silently stops receiving
 * notifications and has no way to know.
 *
 * The server updates the row in place, so which matches they follow survives.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  const e = event as ExtendableEvent & {
    oldSubscription?: PushSubscription | null;
  };

  e.waitUntil(
    (async () => {
      const oldEndpoint = e.oldSubscription?.endpoint ?? null;
      const { key } = (await fetch("/api/push/public-key").then((r) =>
        r.json(),
      )) as { key: string };

      const fresh = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      await fetch("/api/push/rotate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldEndpoint, subscription: fresh.toJSON() }),
      });
    })(),
  );
});
