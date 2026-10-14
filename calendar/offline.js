/* Durable account-specific snapshots and an idempotent calendar outbox. */
(() => {
  "use strict";
  const ACTIVE = "sajal.calendar.offline.account.v1",
    STORE = "accounts";
  const writes = new Set([
    "cal_save_event",
    "cal_save_event_with_reminder",
    "cal_save_recurring_event",
    "cal_delete_event",
    "cal_delete_recurring_event",
  ]);
  const copy = (value) => structuredClone(value),
    uid = () => crypto.randomUUID();
  const day = (date, zone) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(date));
    const get = (name) => parts.find((p) => p.type === name).value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  };
  const shiftDay = (value, amount) => {
    const date = new Date(value + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  };
  const dayDifference = (a, b) =>
    Math.round(
      (new Date(a + "T12:00:00Z") - new Date(b + "T12:00:00Z")) / 86400000,
    );
  function shiftClock(value, amount, zone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
    const get = (name) => parts.find((p) => p.type === name).value;
    const target = new Date(
      `${shiftDay(`${get("year")}-${get("month")}-${get("day")}`, amount)}T${get("hour")}:${get("minute")}:${get("second")}Z`,
    ).getTime();
    let guess = target;
    const seen = new Set();
    for (let n = 0; n < 4; n++) {
      const displayed = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(guess));
      const p = (name) => displayed.find((part) => part.type === name).value;
      const wall = new Date(
        `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}:${p("second")}Z`,
      ).getTime();
      const difference = target - wall;
      if (!difference) break;
      const nextGuess = guess + difference;
      if (seen.has(nextGuess)) {
        guess = Math.max(guess, nextGuess);
        break;
      }
      seen.add(guess);
      guess = nextGuess;
    }
    return new Date(guess).toISOString();
  }
  function slot(series, index) {
    if (series.frequency === "weekly" || series.frequency === "fortnightly")
      return shiftDay(
        series.anchor_date,
        index * (series.frequency === "weekly" ? 7 : 14),
      );
    const [y, m, d] = series.anchor_date.split("-").map(Number);
    const first = new Date(0);
    first.setUTCFullYear(
      y + (series.frequency === "yearly" ? index : 0),
      m - 1 + (series.frequency === "monthly" ? index : 0),
      1,
    );
    first.setUTCHours(12, 0, 0, 0);
    const last = new Date(first);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    first.setUTCDate(Math.min(series.anchor_day || d, last.getUTCDate()));
    return first.toISOString().slice(0, 10);
  }
  function index(series, date) {
    if (series.frequency === "weekly" || series.frequency === "fortnightly")
      return Math.floor(
        dayDifference(date, series.anchor_date) /
          (series.frequency === "weekly" ? 7 : 14),
      );
    const [y, m] = date.split("-").map(Number),
      [ay, am] = series.anchor_date.split("-").map(Number);
    return series.frequency === "monthly" ? (y - ay) * 12 + m - am : y - ay;
  }
  function occurrence(series, date) {
    const amount = dayDifference(date, series.template_slot),
      template = copy(series.template);
    template.start = template.allDay
      ? shiftDay(template.start, amount)
      : shiftClock(template.start, amount, series.timezone);
    template.end = template.allDay
      ? shiftDay(template.end, amount)
      : shiftClock(template.end, amount, series.timezone);
    if (!template.allDay && new Date(template.end) <= new Date(template.start))
      template.end = new Date(
        new Date(template.start).getTime() +
          new Date(series.template.end) -
          new Date(series.template.start),
      ).toISOString();
    return template;
  }
  function project(state, range) {
    if (!state?.baseline?.context) return null;
    const base = copy(state.baseline),
      user = state.user;
    let rows = base.rows || [],
      series = base.series || [],
      exclusions = base.exclusions || [],
      reminders = base.reminders || [];
    const alias = (id) => state.aliases?.[id] || id;
    const findRow = (op) =>
      rows.find((r) => r.id === (op.args.p_event?.id || op.args.p_id)) ||
      (op.targetSeries && op.targetSlot
        ? rows.find(
            (r) =>
              r.series_id === alias(op.targetSeries) &&
              r.occurrence_date === op.targetSlot,
          )
        : undefined);
    const affected = (row, s, scope, date) =>
      row.series_id === s.id &&
      (scope === "all" || row.occurrence_date >= date);
    function generate(s, from, to) {
      const startDate = s.template.allDay
        ? s.template.start
        : day(s.template.start, s.timezone);
      const endDate = s.template.allDay
        ? s.template.end
        : day(s.template.end, s.timezone);
      const shift = dayDifference(startDate, s.template_slot);
      const span = Math.max(2, dayDifference(endDate, startDate));
      const first = shiftDay(from, -shift - span);
      const last = shiftDay(to, -shift);
      let at = Math.max(0, index(s, first) - 1),
        count = 0;
      while (count++ < 2000) {
        const date = slot(s, at++);
        if (date > last || (s.until_date && date >= s.until_date)) break;
        if (
          date < s.starts_on ||
          exclusions.some(
            (e) => e.series_id === s.id && e.occurrence_date === date,
          ) ||
          rows.some((r) => r.series_id === s.id && r.occurrence_date === date)
        )
          continue;
        const data = occurrence(s, date);
        if ((data.allDay ? data.end : day(data.end, s.timezone)) < from)
          continue;
        const row = {
          ...data,
          id: `local:${s.id}:${date}`,
          owner_id: s.owner_id,
          share_with: copy(s.share_with || []),
          version: 1,
          series_id: s.id,
          occurrence_date: date,
          repeat: s.frequency,
          series_version: s.version,
          repeat_timezone: s.timezone,
          can_edit_series: true,
        };
        rows.push(row);
        if (s.reminder) reminders.push({ ...s.reminder, event_id: row.id });
      }
    }
    // Materialize the target of a queued edit before applying its payload.
    for (const op of state.queue || []) {
      if (op.status !== "queued") continue;
      const s = series.find((s) => s.id === alias(op.targetSeries));
      if (s && op.targetSlot) generate(s, op.targetSlot, op.targetSlot);
      const previous = findRow(op),
        args = op.args,
        scope = args.p_scope || "one";
      const def = series.find((s) => s.id === previous?.series_id);
      if (op.name.startsWith("cal_delete_")) {
        if (def && scope !== "one") {
          rows = rows.filter(
            (r) => !affected(r, def, scope, previous.occurrence_date),
          );
          if (scope === "all") series = series.filter((s) => s.id !== def.id);
          else {
            def.until_date = previous.occurrence_date;
            def.version++;
          }
        } else {
          rows = rows.filter((r) => r.id !== previous?.id);
          if (previous?.series_id) {
            exclusions.push({
              series_id: previous.series_id,
              occurrence_date: previous.occurrence_date,
            });
            if (def) def.version++;
          }
        }
        continue;
      }
      const data = copy(args.p_event),
        row = {
          ...previous,
          ...data,
          id: previous?.id || data.id,
          owner_id: previous?.owner_id || user.id,
          share_with: copy(args.p_share_with || []),
          version: (previous?.version || 0) + 1,
        };
      rows = rows.filter((r) => r.id !== row.id);
      rows.push(row);
      reminders = reminders.filter((r) => r.event_id !== row.id);
      if (
        args.p_reminder_minutes !== null &&
        args.p_reminder_minutes !== undefined
      )
        reminders.push({
          event_id: row.id,
          minutes: args.p_reminder_minutes,
          timezone: args.p_reminder_timezone,
        });
      const repeat = args.p_repeat || "",
        zone = args.p_repeat_timezone || def?.timezone || "Australia/Sydney";
      if (previous?.series_id && !def) {
        if (!repeat) {
          row.series_id = null;
          row.occurrence_date = null;
          row.repeat = "";
          row.series_version = null;
        }
        continue;
      }
      if (def && scope === "one") {
        def.version++;
        if (!repeat) {
          exclusions.push({
            series_id: def.id,
            occurrence_date: row.occurrence_date,
          });
          row.series_id = null;
          row.occurrence_date = null;
          row.repeat = "";
          row.series_version = null;
        }
        continue;
      }
      if (def && scope !== "one") {
        const selected = previous.occurrence_date,
          old = copy(def),
          expected = occurrence(old, selected),
          desired = data.allDay ? data.start : day(data.start, zone),
          expectedDate = expected.allDay
            ? expected.start
            : day(expected.start, zone),
          changed = desired !== expectedDate;
        rows = rows.filter(
          (r) => r.id === row.id || !affected(r, def, scope, selected),
        );
        if (!repeat) {
          if (scope === "all") series = series.filter((s) => s.id !== def.id);
          else {
            def.until_date = selected;
            def.version++;
          }
          row.series_id = null;
          row.occurrence_date = null;
          row.repeat = "";
          row.series_version = null;
          continue;
        }
        let next;
        if (scope === "future") {
          def.until_date = selected;
          def.version++;
          next = {
            ...old,
            id: op.localSeries,
            frequency: repeat,
            version: 1,
            starts_on: changed ? desired : selected,
            template_slot: changed ? desired : selected,
            anchor_date: changed
              ? desired
              : repeat === old.frequency
                ? old.anchor_date
                : selected,
            anchor_day: changed
              ? Number(desired.slice(-2))
              : repeat === old.frequency
                ? old.anchor_day
                : Number(selected.slice(-2)),
          };
          if (old.until_date && (changed || repeat !== old.frequency))
            next.until_date = slot(
              next,
              index(old, old.until_date) - index(old, selected),
            );
          const future = exclusions.filter(
            (e) => e.series_id === old.id && e.occurrence_date >= selected,
          );
          for (const e of future)
            exclusions.push({
              series_id: next.id,
              occurrence_date:
                changed || repeat !== old.frequency
                  ? slot(
                      next,
                      index(old, e.occurrence_date) - index(old, selected),
                    )
                  : e.occurrence_date,
            });
          series.push(next);
          row.occurrence_date = changed ? desired : selected;
        } else {
          next = def;
          next.version++;
          next.frequency = repeat;
          next.template_slot = selected;
          if (changed && repeat === old.frequency) {
            if (old.frequency === "weekly" || old.frequency === "fortnightly")
              next.anchor_date = shiftDay(
                old.anchor_date,
                dayDifference(desired, expectedDate),
              );
            else {
              const [ay, am] = old.anchor_date.split("-").map(Number),
                [dy, dm, dd] = desired.split("-").map(Number),
                [ey, em] = expectedDate.split("-").map(Number);
              const probe = new Date(0);
              probe.setUTCFullYear(
                old.frequency === "monthly" ? ay : ay + dy - ey,
                old.frequency === "monthly"
                  ? am - 1 + (dy - ey) * 12 + dm - em
                  : dm - 1,
                1,
              );
              probe.setUTCHours(12, 0, 0, 0);
              const last = new Date(probe);
              last.setUTCMonth(last.getUTCMonth() + 1, 0);
              probe.setUTCDate(Math.min(dd, last.getUTCDate()));
              next.anchor_date = probe.toISOString().slice(0, 10);
            }
            next.anchor_day = Number(desired.slice(-2));
            next.starts_on = slot(next, index(old, old.starts_on));
            next.template_slot = slot(next, index(old, selected));
            if (old.until_date)
              next.until_date = slot(next, index(old, old.until_date));
          } else if (repeat !== old.frequency) {
            next.anchor_date = next.starts_on;
            next.anchor_day = Number(next.starts_on.slice(-2));
          }
          if (changed || repeat !== old.frequency)
            exclusions = exclusions.map((e) =>
              e.series_id === old.id
                ? {
                    ...e,
                    occurrence_date: slot(
                      next,
                      index(old, e.occurrence_date) -
                        (repeat !== old.frequency
                          ? index(old, old.starts_on)
                          : 0),
                    ),
                  }
                : e,
            );
        }
        next.template = data;
        next.timezone = zone;
        next.share_with = row.share_with;
        next.reminder =
          args.p_reminder_minutes == null
            ? null
            : {
                minutes: args.p_reminder_minutes,
                timezone: args.p_reminder_timezone,
              };
        row.series_id = next.id;
        row.repeat = repeat;
        row.series_version = next.version;
        row.repeat_timezone = zone;
        if (scope === "all" && (changed || repeat !== old.frequency)) {
          rows = rows.filter((r) => r.id !== row.id);
        }
      } else if (repeat) {
        const date = data.allDay ? data.start : day(data.start, zone),
          s = {
            id: row.id,
            owner_id: row.owner_id,
            frequency: repeat,
            anchor_date: date,
            anchor_day: Number(date.slice(-2)),
            starts_on: date,
            template_slot: date,
            template: data,
            timezone: zone,
            version: 1,
            share_with: row.share_with,
            reminder:
              args.p_reminder_minutes == null
                ? null
                : {
                    minutes: args.p_reminder_minutes,
                    timezone: args.p_reminder_timezone,
                  },
          };
        series.push(s);
        row.series_id = s.id;
        row.occurrence_date = date;
        row.repeat = repeat;
        row.series_version = 1;
        row.repeat_timezone = zone;
        row.can_edit_series = true;
      }
    }
    const from = range?.from || new Date().toISOString().slice(0, 10),
      to = range?.to || shiftDay(from, 370);
    for (const s of series)
      if (s.owner_id === user.id || (s.share_with || []).includes(user.id))
        generate(s, from, to);
    for (const row of rows) {
      const s = series.find((s) => s.id === row.series_id);
      if (s) {
        row.series_version = s.version;
        row.repeat = s.frequency;
      }
    }
    base.rows = rows.filter(
      (row) =>
        row.owner_id === user.id || (row.share_with || []).includes(user.id),
    );
    base.reminders = reminders;
    return base;
  }
  let database;
  function db() {
    if (!database)
      database = new Promise((resolve, reject) => {
        const req = indexedDB.open("sajal-calendar-offline-v1", 1);
        req.onupgradeneeded = () =>
          req.result.createObjectStore(STORE, { keyPath: "id" });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () =>
          reject(new Error("Your device could not open offline storage."));
      });
    return database;
  }
  async function update(id, change) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite"),
        store = transaction.objectStore(STORE),
        request = store.get(id);
      let result;
      request.onsuccess = () => {
        try {
          result = change(request.result);
          if (result) store.put(result);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () =>
        reject(
          new Error(
            "Your device could not save this change. Free some storage and try again.",
          ),
        );
      transaction.onabort = () =>
        reject(
          new Error(
            "Your device could not save this change. Free some storage and try again.",
          ),
        );
    });
  }
  const networkError = (error) =>
    !navigator.onLine ||
    /fetch|network|timeout|aborted|offline/i.test(error?.message || "");
  const authError = (error) =>
    ["PGRST301", "PGRST302", "401"].includes(error?.code) ||
    /jwt|token.*expired|sign in first|sign-in changed|sign in to the account/i.test(
      error?.message || "",
    );
  window.CalendarOffline = {
    writes,
    create({ getAccount, getRange, send, onChange }) {
      let current = null,
        syncing = false,
        syncFlight = null;
      const channel =
        "BroadcastChannel" in window
          ? new BroadcastChannel("sajal-calendar-offline-v1")
          : null;
      const notify = () => {
        channel?.postMessage({ id: current?.id });
        onChange?.();
      };
      const activeId = () => {
        try {
          return localStorage.getItem(ACTIVE);
        } catch {
          return null;
        }
      };
      const remember = (user) => {
        try {
          if (user) localStorage.setItem(ACTIVE, user.id);
          else localStorage.removeItem(ACTIVE);
        } catch {}
      };
      const load = async (id) => {
        current = await update(id, (state) => state || null);
        return current;
      };
      channel &&
        (channel.onmessage = async (event) => {
          if (event.data.id && event.data.id === getAccount()?.id) {
            try {
              await load(event.data.id);
            } catch {
              // Keep the last usable snapshot; refreshCloud reports storage failures.
            }
            onChange?.();
          }
        });
      const view = () =>
        current?.id === getAccount()?.id ? project(current, getRange()) : null;
      const details = () =>
        current?.id !== getAccount()?.id
          ? { pending: 0, conflicts: 0, syncing: false, ready: false }
          : {
              pending:
                current?.queue.filter((op) => op.status === "queued").length ||
                0,
              conflicts:
                current?.queue.filter((op) => op.status !== "queued").length ||
                0,
              syncing,
              ready: !!current?.baseline?.ready,
            };
      async function baseline(user, value) {
        current = await update(user.id, (state) => ({
          ...state,
          id: user.id,
          user: copy(user),
          baseline: copy(value),
          savedAt: new Date().toISOString(),
          queue: state?.queue || [],
          acks: state?.acks || {},
          aliases: state?.aliases || {},
        }));
        remember(user);
        notify();
        return view();
      }
      function wire(op, state) {
        const args = copy(op.args),
          alias = (id) => state.aliases?.[id] || id,
          targetSeries = alias(op.targetSeries);
        args.p_offline_account = state.id;
        for (const dependency of op.dependencies) {
          const ack = state.acks?.[dependency];
          if (!ack) continue;
          const matched =
            ack.rows?.find((r) => r.id === (args.p_event?.id || args.p_id)) ||
            (targetSeries && op.targetSlot
              ? ack.rows?.find(
                  (r) =>
                    r.series_id === targetSeries &&
                    r.occurrence_date === op.targetSlot,
                )
              : undefined);
          if (matched) args.p_expected_version = matched.version;
          const s = ack.series?.find((s) => s.id === targetSeries);
          if (s) args.p_expected_series_version = s.version;
        }
        return {
          p_operation_id: op.id,
          p_name: op.name,
          p_args: args,
          p_target_series: targetSeries || null,
          p_target_slot: op.targetSlot || null,
        };
      }
      async function flush() {
        const account = getAccount();
        if (!account || !navigator.onLine || !current?.baseline?.ready) return;
        if (syncFlight) return syncFlight;
        const run = async () => {
          syncing = true;
          onChange?.();
          try {
            while (getAccount()?.id === account.id && navigator.onLine) {
              current = await update(account.id, (state) => state);
              const op = current.queue.find((op) => op.status === "queued");
              if (!op) break;
              const failedDependency = op.dependencies.find((id) =>
                current.queue.some(
                  (parent) => parent.id === id && parent.status !== "queued",
                ),
              );
              if (failedDependency) {
                current = await update(account.id, (state) => {
                  state.queue.find((o) => o.id === op.id).status = "blocked";
                  return state;
                });
                notify();
                continue;
              }
              current = await update(account.id, (state) => {
                const pending = state.queue.find((o) => o.id === op.id);
                pending.wire ||= wire(pending, state);
                return state;
              });
              const pending = current.queue.find((o) => o.id === op.id);
              try {
                const result = await send(
                  "cal_apply_offline_change",
                  pending.wire,
                );
                if (getAccount()?.id !== account.id) break;
                if (result.state?.context?.profile?.id !== account.id)
                  throw new Error(
                    "The sync account did not match your sign-in.",
                  );
                current = await update(account.id, (state) => {
                  state.baseline = result.state;
                  state.lastAck = result.metadata;
                  state.savedAt = new Date().toISOString();
                  state.acks[op.id] = result.metadata;
                  if (op.localSeries && result.metadata.series_id)
                    state.aliases[op.localSeries] = result.metadata.series_id;
                  state.queue = state.queue.filter((o) => o.id !== op.id);
                  const needed = new Set(
                    state.queue.flatMap((o) => o.dependencies),
                  );
                  for (const id of Object.keys(state.acks))
                    if (!needed.has(id)) delete state.acks[id];
                  return state;
                });
                notify();
              } catch (error) {
                if (networkError(error) || authError(error)) {
                  current = await update(account.id, (state) => {
                    const item = state.queue.find((o) => o.id === op.id);
                    if (item) {
                      item.offline = true;
                      item.error = authError(error)
                        ? "Sign in again to sync this saved change."
                        : "Waiting for a connection.";
                    }
                    return state;
                  });
                  notify();
                  break;
                }
                current = await update(account.id, (state) => {
                  const item = state.queue.find((o) => o.id === op.id);
                  if (item) {
                    item.status = "conflict";
                    item.error = error.message || "This change needs review.";
                    item.code = error.code;
                  }
                  return state;
                });
                notify();
              }
            }
          } catch (error) {
            // The outbox was saved before sending. A storage failure while
            // recording an acknowledgement must leave that request retryable.
            if (current?.id === account.id) {
              const pending = current.queue.find(
                (op) => op.status === "queued",
              );
              if (pending) pending.error = error.message;
            }
          } finally {
            syncing = false;
            onChange?.();
          }
        };
        syncFlight = (
          navigator.locks
            ? navigator.locks.request(
                "calendar-offline-sync-" + account.id,
                run,
              )
            : run()
        ).finally(() => {
          syncFlight = null;
        });
        return syncFlight;
      }
      async function mutate(name, args, row) {
        const user = getAccount();
        if (!user || current?.id !== user.id || !current?.baseline?.ready)
          throw new Error("Reconnect once to enable offline editing.");
        const id = uid(),
          eventId = args.p_event?.id || args.p_id,
          seriesKey = row?.series_id || (args.p_repeat ? eventId : null);
        let startedOnline = navigator.onLine;
        current = await update(user.id, (state) => {
          const dependencies = state.queue
            .filter(
              (o) =>
                o.eventId === eventId ||
                (seriesKey &&
                  (o.seriesKey === seriesKey || o.localSeries === seriesKey)),
            )
            .map((o) => o.id);
          state.queue.push({
            id,
            name,
            args: copy(args),
            eventId,
            seriesKey,
            targetSeries: row?.series_id || null,
            targetSlot: row?.occurrence_date || null,
            localSeries:
              row?.series_id && args.p_scope === "future" && args.p_repeat
                ? id
                : null,
            dependencies,
            status: "queued",
            offline: !startedOnline,
            title: args.p_event?.title || row?.title || "Calendar event",
            createdAt: new Date().toISOString(),
          });
          return state;
        });
        notify();
        if (startedOnline) {
          await flush();
          const op = current?.queue.find((o) => o.id === id);
          if (
            op?.status === "conflict" &&
            !op.offline &&
            op.dependencies.length === 0
          ) {
            await discard(id);
            throw Object.assign(new Error(op.error), { code: op.code });
          }
        }
        return args.p_event?.id || null;
      }
      async function discard(id) {
        const user = getAccount();
        if (!user) return;
        current = await update(user.id, (state) => {
          const removed = new Set([id]);
          let changed = true;
          while (changed) {
            changed = false;
            for (const op of state.queue)
              if (
                !removed.has(op.id) &&
                op.dependencies.some((parent) => removed.has(parent))
              ) {
                removed.add(op.id);
                changed = true;
              }
          }
          state.queue = state.queue.filter((op) => !removed.has(op.id));
          return state;
        });
        notify();
      }
      return {
        load,
        baseline,
        view,
        details,
        flush,
        mutate,
        discard,
        remember,
        activeId,
        queue: () =>
          copy(current?.id === getAccount()?.id ? current?.queue || [] : []),
        user: () => copy(current?.user || null),
        ack: () =>
          copy(
            current?.id === getAccount()?.id ? current?.lastAck || null : null,
          ),
        resolveSeries: (id) =>
          current?.id === getAccount()?.id ? current?.aliases?.[id] || id : id,
        detach: () => {
          current = null;
        },
        isWrite: (name) => writes.has(name),
      };
    },
  };
})();
