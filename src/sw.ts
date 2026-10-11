/// <reference lib="webworker" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Custom service worker for Nevorai Academy.
 *
 * Two responsibilities:
 *  1. Cache the hashed build files under /assets/ (they never change per URL).
 *  2. Handle Web Push (`push` + `notificationclick`) so notifications rendered
 *     by the browser deep-link into the correct Nevorai Academy page.
 *
 * It never caches HTML. Pages are server-rendered and every deploy ships new
 * hashed /assets/ names; a cached page from an older deploy points at files
 * that no longer exist and opens blank (seen on Safari, 2026-10-11).
 *
 * Registered only from `src/lib/pwa/register.ts` in production, non-iframe,
 * non-lovable-preview contexts.
 */

import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { CacheFirst } from "workbox-strategies";
import { registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// -- Precache the shell -------------------------------------------------------
precacheAndRoute(self.__WB_MANIFEST ?? []);
cleanupOutdatedCaches();

// HTML navigations are NOT handled here: they always go to the network, so a
// reload after a deploy always gets the page that matches the deployed files.

// Same-origin hashed build files only (/assets/*): cache-first, they never change per URL.
// Logos, tenant icons and other un-hashed images must always come from the network.
registerRoute(
  ({ url, request }) =>
    url.origin === self.location.origin &&
    url.pathname.startsWith("/assets/") &&
    ["script", "style", "image", "font"].includes(request.destination),
  new CacheFirst({ cacheName: "static-v1" }),
);

// -- Web Push -----------------------------------------------------------------
interface PushPayload {
  title: string;
  body: string;
  subtitle?: string | null;
  deep_link?: string | null;
  category?: string | null;
  tag?: string | null;
  badge?: number | null;
  data?: Record<string, unknown>;
  icon?: string | null;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {
    title: "Academy update",
    body: "You have a new notification.",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() } as PushPayload;
  } catch {
    // Non-JSON payload — leave the default. Never fail the event handler.
  }

  const options: NotificationOptions & { renotify?: boolean } = {
    body: payload.body,
    icon: payload.icon ?? "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.tag ?? payload.category ?? undefined,
    data: {
      deep_link: payload.deep_link ?? "/",
      ...(payload.data ?? {}),
    },
    requireInteraction: false,
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data as { deep_link?: string } | undefined)?.deep_link ?? "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab if it's already on the target path.
      for (const client of clientsList) {
        const url = new URL(client.url);
        if (url.pathname === target || url.pathname + url.search === target) {
          await (client as WindowClient).focus();
          return;
        }
      }
      // Otherwise open (or navigate) a window.
      if (clientsList[0]) {
        const client = clientsList[0] as WindowClient;
        await client.navigate(target);
        await client.focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// Immediate activation after update.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      // Earlier workers kept a copy of the page in "html-shell" and served it whenever the
      // network took more than 4 s. After a deploy that copy named build files that were gone,
      // so the tab opened blank. Drop that cache; when it existed, tabs in this browser may be
      // showing the blank page right now, so load each of them again once.
      const hadStaleShell = await caches.delete("html-shell");
      if (!hadStaleShell) return;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      await Promise.allSettled(
        windows.map((client) => (client as WindowClient).navigate(client.url).catch(() => null)),
      );
    })(),
  ),
);
