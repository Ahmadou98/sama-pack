self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(self.registration.showNotification(String(payload.title || "SAMA-PACK"), {
    body: String(payload.body || "Une mise à jour est disponible dans votre compte."),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: String(payload.tag || ("sama-" + Date.now())),
    renotify: false,
    data: { url: String(payload.url || "/?spAction=notifications") }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/?spAction=notifications", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
    return undefined;
  })());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(self.registration.showNotification(String(payload.title || "SAMA-PACK"), {
    body: String(payload.body || "Une mise à jour est disponible dans votre compte."),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: String(payload.tag || ("sama-" + Date.now())),
    renotify: false,
    data: { url: String(payload.url || "/?spAction=notifications") }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/?spAction=notifications", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
    return undefined;
  })());
});

"use strict";

const CACHE_NAME = "sama-pack-pwa-v3";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/pwa.css?v=20261106-pwa-v1",
  "/pwa.js?v=20261106-pwa-v1",
  "/web-push.js?v=20261110-webpush-v1",
  "/social-admin.css?v=20261111-social-v1",
  "/social-admin.js?v=20261111-social-v1"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("sama-pack-pwa-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(new Request(request, { cache: "no-store" }));
    if (response.status >= 500) throw new Error("Server indisponible");
    return response;
  } catch (error) {
    const offlinePage = await caches.match(OFFLINE_URL);
    if (offlinePage) return offlinePage;

    return new Response(
      "<!doctype html><html lang=\"fr\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Connexion indisponible</title><p>Connexion Internet indisponible. Réessayez lorsque le réseau sera rétabli.</p></html>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

async function cacheFirstStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    try {
      await cache.put(request, response.clone());
    } catch (error) {
      // L’échec du cache ne doit jamais bloquer le chargement du fichier.
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const path = url.pathname;
  const isStaticCode =
    (path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".woff") || path.endsWith(".woff2")) &&
    (request.destination === "script" || request.destination === "style" || request.destination === "font");
  const isAppIcon = path.startsWith("/icons/") && path.endsWith(".png");

  // Pas de cache pour les pages HTML, API, authentification, panier ou commandes.
  if (isStaticCode || isAppIcon) {
    event.respondWith(cacheFirstStaticAsset(request));
  }
});