/* Push only: no private calendar data or pages are cached offline. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
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
