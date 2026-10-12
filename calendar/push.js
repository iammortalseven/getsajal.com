/* Device opt-in only. All reminder scheduling and delivery run in Supabase. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const base = new URL("./", location.href);
  const decode = (value) =>
    Uint8Array.from(
      atob(
        value.replace(/-/g, "+").replace(/_/g, "/") +
          "=".repeat((4 - (value.length % 4)) % 4),
      ),
      (c) => c.charCodeAt(0),
    );
  const standalone = () =>
    matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
  const appleMobile = () =>
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  window.CalendarPush = {
    create({ rpc }) {
      let account = null,
        generation = 0,
        registration = null,
        subscription = null,
        publicKey = null,
        enabled = false,
        busy = false;
      let cleanupFlight = Promise.resolve();
      const setStatus = (text, error = false) => {
        $("notification-status").textContent = text;
        $("notification-status").classList.toggle("error", error);
      };
      const buttons = () => {
        $("enable-notifications").disabled = busy || !publicKey || enabled;
        $("disable-notifications").disabled = busy || !subscription;
        $("test-notifications").disabled = busy || !enabled;
        $("notification-device-state").textContent = enabled
          ? "Enabled for your account on this device."
          : "Not enabled on this device.";
      };
      const readyWorker = async () => {
        const reg = await navigator.serviceWorker.register(
          new URL("sw.js", base),
          { scope: base.pathname },
        );
        if (!reg.active) {
          await new Promise((resolve, reject) => {
            const worker = reg.installing || reg.waiting;
            if (!worker) {
              reject(
                new Error(
                  "The notification worker could not start. Refresh and try again.",
                ),
              );
              return;
            }
            const timer = setTimeout(
              () =>
                reject(
                  new Error(
                    "Notification setup timed out. Refresh and try again.",
                  ),
                ),
              15000,
            );
            const changed = () => {
              if (worker.state === "activated") {
                clearTimeout(timer);
                worker.removeEventListener("statechange", changed);
                resolve();
              }
              if (worker.state === "redundant") {
                clearTimeout(timer);
                worker.removeEventListener("statechange", changed);
                reject(new Error("The notification worker could not load."));
              }
            };
            worker.addEventListener("statechange", changed);
            changed();
          });
        }
        return reg;
      };
      async function open() {
        if (!account) return;
        $("notification-dialog").showModal();
        const requestGeneration = generation;
        busy = true;
        enabled = false;
        publicKey = null;
        buttons();
        setStatus("Checking this device…");
        try {
          if (appleMobile() && !standalone())
            throw new Error(
              "On iPhone or iPad, add this calendar to your Home Screen first. Open it from that icon, sign in and enable notifications here.",
            );
          if (
            !isSecureContext ||
            !("serviceWorker" in navigator) ||
            !("PushManager" in window) ||
            !("Notification" in window)
          )
            throw new Error(
              "Push notifications are not supported in this browser. Try a supported browser or your phone's Home Screen app.",
            );
          await cleanupFlight;
          registration = await readyWorker();
          const key = await rpc("cal_push_public_key");
          if (!key)
            throw new Error(
              "Notification setup is not finished in Supabase. Complete the supplied setup instructions first.",
            );
          const sub = await registration.pushManager.getSubscription();
          const active = sub
            ? await rpc("cal_push_device_enabled", { p_endpoint: sub.endpoint })
            : false;
          if (requestGeneration !== generation) return;
          publicKey = key;
          subscription = sub;
          enabled = Boolean(active && Notification.permission === "granted");
          setStatus(
            Notification.permission === "denied"
              ? "Notifications are blocked. Allow them in your browser or phone notification settings, then reopen this panel."
              : enabled
                ? "Choose a reminder when creating or editing an event. Each person controls their own reminders."
                : "Enable this device, then choose a reminder on an event.",
          );
        } catch (error) {
          if (requestGeneration === generation)
            setStatus(error.message || "Could not check notifications.", true);
        } finally {
          if (requestGeneration === generation) {
            busy = false;
            buttons();
          }
        }
      }
      $("enable-notifications").addEventListener("click", async () => {
        if (busy || !account || !publicKey) return;
        // Permission must be requested directly from a user's tap, before network awaits.
        const requestGeneration = generation;
        busy = true;
        buttons();
        setStatus("Enabling notifications…");
        let sub = null;
        try {
          const permission = Notification.requestPermission();
          if ((await permission) !== "granted")
            throw new Error(
              "Permission was not granted. You can enable notifications later.",
            );
          sub = await registration.pushManager.getSubscription();
          if (
            sub &&
            sub.options.applicationServerKey &&
            !decode(publicKey).every(
              (b, i) =>
                b === new Uint8Array(sub.options.applicationServerKey)[i],
            )
          ) {
            await rpc("cal_unregister_push", { p_endpoint: sub.endpoint });
            await sub.unsubscribe();
            sub = null;
          }
          if (requestGeneration !== generation) return;
          sub ||= await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: decode(publicKey),
          });
          if (requestGeneration !== generation) {
            await sub.unsubscribe();
            return;
          }
          await rpc("cal_register_push", {
            p_subscription: sub.toJSON(),
            p_public_key: publicKey,
          });
          if (requestGeneration !== generation) {
            await sub.unsubscribe();
            return;
          }
          subscription = sub;
          enabled = true;
          setStatus("Enabled. Send a test, or choose a reminder on an event.");
        } catch (error) {
          if (sub && !enabled) {
            try {
              await sub.unsubscribe();
            } catch {
              /* Retry from the panel. */
            }
          }
          if (requestGeneration === generation)
            setStatus(error.message || "Could not enable notifications.", true);
        } finally {
          if (requestGeneration === generation) {
            busy = false;
            buttons();
          }
        }
      });
      async function disconnect() {
        if (!("serviceWorker" in navigator)) return;
        const reg =
          registration ||
          (await navigator.serviceWorker.getRegistration(base.href));
        const sub = await reg?.pushManager.getSubscription();
        try {
          if (sub) {
            try {
              if (account)
                await rpc("cal_unregister_push", { p_endpoint: sub.endpoint });
            } finally {
              await sub.unsubscribe();
            }
          }
        } finally {
          for (const note of (await reg?.getNotifications()) || [])
            note.close();
          subscription = null;
          enabled = false;
          buttons();
        }
      }
      $("disable-notifications").addEventListener("click", async () => {
        if (busy) return;
        busy = true;
        buttons();
        try {
          await disconnect();
          setStatus(
            "Disabled on this device. Your event reminder preferences are kept.",
          );
        } catch (error) {
          setStatus(
            "The device update could not be fully confirmed. Reopen this panel to check, or disable notifications in your browser settings.",
            true,
          );
        } finally {
          busy = false;
          buttons();
        }
      });
      $("test-notifications").addEventListener("click", async () => {
        if (busy || !enabled || !subscription) return;
        const requestGeneration = generation;
        busy = true;
        buttons();
        try {
          await rpc("cal_request_push_test", {
            p_endpoint: subscription.endpoint,
          });
          if (requestGeneration === generation)
            setStatus(
              "Test requested. It should arrive within about a minute, including when the calendar is closed.",
            );
        } catch (error) {
          if (requestGeneration === generation)
            setStatus(error.message || "Could not request a test.", true);
        } finally {
          if (requestGeneration === generation) {
            busy = false;
            buttons();
          }
        }
      });
      $("close-notifications").addEventListener("click", () =>
        $("notification-dialog").close(),
      );
      return {
        open,
        disconnect,
        setAccount(next) {
          if (account === next) return;
          const previous = account;
          account = next;
          generation++;
          busy = false;
          enabled = false;
          publicKey = null;
          subscription = null;
          if ($("notification-dialog").open) $("notification-dialog").close();
          setStatus("");
          buttons();
          // Expired sessions also stop delivery to the browser. Explicit logout removes the database record first.
          if (previous)
            cleanupFlight = (
              navigator.serviceWorker?.getRegistration(base.href) ||
              Promise.resolve(null)
            )
              .then(async (reg) => {
                await (await reg?.pushManager.getSubscription())?.unsubscribe();
                for (const note of (await reg?.getNotifications()) || [])
                  note.close();
              })
              .catch(() => {});
        },
      };
    },
  };
})();
