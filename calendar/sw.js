/* Only public app assets enter Cache Storage. Private calendar data lives in
   account-scoped IndexedDB in offline.js; Supabase requests are never cached. */
const VERSION = "calendar-shell-20261014-offline1";
const BASE = self.registration.scope;
const ASSETS = [
  "",
  "style.css",
  "auth.css",
  "app.js",
  "offline.js",
  "push.js",
  "holidays.js",
  "manifest.webmanifest",
  "vendor/fullcalendar-6.1.18.min.js",
  "vendor/supabase-2.102.0.js",
  "icons/calendar.svg",
  "icons/favicon.ico",
  "icons/apple-touch-icon.png",
  "icons/calendar-192.png",
  "icons/calendar-512.png",
];
const allowed = new Set(ASSETS.map((path) => new URL(path, BASE).pathname));
const key = (request) => {
  const url = new URL(request.url || request);
  url.search = "";
  url.hash = "";
  if (url.pathname === new URL("index.html", BASE).pathname)
    url.pathname = new URL(BASE).pathname;
  return url.href;
};
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      await Promise.all(
        ASSETS.map(async (path) => {
          const url = new URL(path, BASE);
          url.searchParams.set("offline-shell", VERSION);
          const response = await fetch(url.href, { cache: "reload" });
          if (!response.ok)
            throw new Error("Offline asset could not load: " + path);
          await cache.put(key(url.href), response);
        }),
      );
      await self.skipWaiting();
    })(),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("calendar-shell-") && name !== VERSION)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== new URL(BASE).origin) return;
  const navigation =
    request.mode === "navigate" &&
    [new URL(BASE).pathname, new URL("index.html", BASE).pathname].includes(
      url.pathname,
    );
  if (!navigation && !allowed.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      if (!navigation) {
        const hit = await cache.match(key(request));
        return hit || fetch(request);
      }
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 2500);
      try {
        const response = await fetch(request, { signal: controller.signal });
        if (!response.ok) throw new Error("Calendar page unavailable");
        return response;
      } catch {
        const hit = await cache.match(new URL(BASE).href);
        return (
          hit ||
          new Response(
            "Open your calendar once while connected to prepare offline access.",
            { status: 503, headers: { "Content-Type": "text/plain" } },
          )
        );
      } finally {
        clearTimeout(timer);
      }
    })(),
  );
});
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    /* Always show a user-visible fallback. */
  }
  const uuid = (value) =>
    typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
  const url = new URL("./", self.registration.scope);
  if (uuid(data.event_id)) url.searchParams.set("reminder", data.event_id);
  if (uuid(data.user_id)) url.searchParams.set("account", data.user_id);
  event.waitUntil(
    self.registration.showNotification(
      data.kind === "test"
        ? "Calendar notifications are working"
        : "Calendar reminder",
      {
        body:
          data.kind === "test"
            ? "Your calendar can reach this device."
            : "You have an event coming up. Open your calendar to see the details.",
        icon: new URL("icons/calendar-192.png", self.registration.scope).href,
        tag: uuid(data.id) ? `calendar-${data.id}` : "calendar-reminder",
        data: { url: url.href },
      },
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url = new URL("./", self.registration.scope);
  try {
    const candidate = new URL(event.notification.data?.url);
    if (candidate.origin === url.origin && candidate.pathname === url.pathname)
      url = candidate;
  } catch {
    /* Open the calendar home. */
  }
  event.waitUntil(
    (async () => {
      const tabs = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const tab of tabs) {
        const existing = new URL(tab.url);
        if (
          existing.origin === url.origin &&
          existing.pathname === url.pathname
        ) {
          await tab.navigate(url.href);
          await tab.focus();
          return;
        }
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
