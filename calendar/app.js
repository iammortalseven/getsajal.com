/* Sajal Family Calendar. Publishable API key; no secret keys in browser code. */
(() => {
  "use strict";
  const PROJECT_URL = "https://cimnfvftxtkqivcpeotq.supabase.co";
  const PUBLISHABLE_KEY = "sb_publishable_J8gfHnGVcxLJEX6B-5DtwA_xOznCkJO";
  const $ = (id) => document.getElementById(id);
  // Read the email-link type before the SDK consumes and removes its URL hash.
  const linkParams = new URLSearchParams(location.hash.slice(1));
  const queryParams = new URLSearchParams(location.search);
  const emailLinkType = linkParams.get("type");
  let emailLinkError = Boolean(
    linkParams.get("error") || queryParams.get("error"),
  );
  let emailLinkPending =
    !emailLinkError &&
    Boolean(linkParams.get("access_token")) &&
    ["invite", "recovery"].includes(emailLinkType);
  let passwordFlow = null;
  const passwordPendingKey = "sajal.calendar.password-pending.v1";
  function rememberPasswordFlow(mode, accountId) {
    try {
      if (mode)
        sessionStorage.setItem(
          passwordPendingKey,
          JSON.stringify({ mode, accountId }),
        );
      else sessionStorage.removeItem(passwordPendingKey);
    } catch {
      /* The active flow still works if browser storage is blocked. */
    }
  }
  function pendingPasswordFlow(accountId) {
    try {
      const pending = JSON.parse(sessionStorage.getItem(passwordPendingKey));
      return pending?.accountId === accountId &&
        ["invite", "recovery"].includes(pending.mode)
        ? pending.mode
        : null;
    } catch {
      return null;
    }
  }
  const form = $("event-form"),
    dialog = $("event-dialog");
  const colors = ["#28634c", "#3b6b9c", "#9b5f2d", "#855593", "#b44b60"];
  const legacyKeys = [
    "sajal.calendar.events.v1",
    "calendarEvents",
    "myCalendarEvents",
    "fullcalendar-events",
    "events",
  ];
  let user = null,
    context = null,
    calendar = null,
    records = new Map();
  let reminders = new Map(),
    reminderBackendReady = false;
  let reminderTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Sydney";
  let reminderLinkHandled = false;
  let editingId = null,
    editingVersion = null,
    editingHoliday = false,
    draftId = null;
  let epoch = 0,
    initialSessionSeen = false,
    writeBusy = false,
    dragging = false;
  let refreshFlight = null,
    lastSnapshot = "",
    noticeTimer,
    cloudConnected = false;
  const phoneLayout = matchMedia(
    "(max-width: 800px), (max-width: 1000px) and (pointer: coarse)",
  );
  let calendarSizeObserver = null,
    calendarSizeFrame = 0,
    navigationAnimation = null;
  let navigationBusy = false,
    suppressCalendarTapUntil = 0;
  let pickerMonth = 0,
    pickerYear = 2026,
    yearStart = 1926,
    yearEnd = 2126,
    pickerReturnFocus = null;
  if (
    !window.supabase ||
    !window.FullCalendar ||
    !window.CalendarHolidays ||
    !window.CalendarPush
  ) {
    $("auth-status").textContent =
      "A required file could not load. Upload all files in the supplied calendar folder, then refresh.";
    $("login-submit").disabled = true;
    return;
  }
  const HOLIDAY_SOURCE_ID = CalendarHolidays.sourceId;
  const isPublicHoliday = (event) => event?.source?.id === HOLIDAY_SOURCE_ID;
  const uid = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pad = (n) => String(n).padStart(2, "0");
  const localDate = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const addDays = (value, amount) => {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return localDate(date);
  };
  const validDate = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    localDate(new Date(`${value}T12:00:00`)) === value;
  function message(text, error = false, persistent = false) {
    clearTimeout(noticeTimer);
    $("notice").textContent = text;
    $("notice").classList.toggle("error", error);
    $("notice").hidden = false;
    if (!persistent)
      noticeTimer = setTimeout(() => {
        $("notice").hidden = true;
      }, 6500);
  }
  function normalizeEvents(input) {
    if (!Array.isArray(input) || input.length > 10000)
      throw new Error(
        "The backup must contain an events array, with no more than 10,000 events.",
      );
    const ids = new Set();
    return input.map((item, index) => {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.title !== "string" ||
        !item.title.trim() ||
        item.title.length > 200
      )
        throw new Error(`Event ${index + 1} has an invalid title.`);
      const allDay =
        item.allDay === true || (item.allDay == null && validDate(item.start));
      let start = item.start,
        end = item.end;
      if (allDay) {
        if (!validDate(start))
          throw new Error(`Event ${index + 1} has an invalid start date.`);
        end = end || addDays(start, 1);
        if (!validDate(end) || end <= start)
          throw new Error(`Event ${index + 1} has an invalid end date.`);
      } else {
        const isoLike = (value) =>
          typeof value === "string" &&
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) &&
          Number.isFinite(new Date(value).getTime());
        if (!isoLike(start))
          throw new Error(`Event ${index + 1} has an invalid start time.`);
        start = new Date(start).toISOString();
        end =
          end || new Date(new Date(start).getTime() + 3600000).toISOString();
        if (!isoLike(end) || new Date(end) <= new Date(start))
          throw new Error(`Event ${index + 1} must end after it starts.`);
        end = new Date(end).toISOString();
      }
      const props = item.extendedProps || {};
      const location = props.location ?? item.location ?? "";
      const notes = props.notes ?? item.notes ?? props.description ?? "";
      if (
        typeof location !== "string" ||
        location.length > 300 ||
        typeof notes !== "string" ||
        notes.length > 4000
      )
        throw new Error(`Event ${index + 1} has invalid location or notes.`);
      let id = String(item.id || uid());
      if (ids.has(id)) id = uid();
      ids.add(id);
      const rawColor = item.backgroundColor || item.color;
      const color =
        typeof rawColor === "string" && /^#[0-9a-f]{6}$/i.test(rawColor)
          ? rawColor
          : colors[0];
      return {
        id,
        title: item.title.trim(),
        start,
        end,
        allDay,
        backgroundColor: color,
        borderColor: color,
        extendedProps: { location, notes },
      };
    });
  }
  function plainEvent(event) {
    return {
      id: event.id,
      title: event.title,
      start: event.allDay ? localDate(event.start) : event.start.toISOString(),
      end: event.end
        ? event.allDay
          ? localDate(event.end)
          : event.end.toISOString()
        : undefined,
      allDay: event.allDay,
      backgroundColor: event.backgroundColor || colors[0],
      borderColor: event.backgroundColor || colors[0],
      extendedProps: {
        location: event.extendedProps.location || "",
        notes: event.extendedProps.notes || "",
      },
    };
  }
  function renderUpcoming() {
    const now = new Date();
    const today = localDate(now);
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 30);
    const all = calendar.getEvents();
    const upcoming = all
      .filter((event) => {
        const hasNotEnded = event.allDay
          ? localDate(event.end || event.start) > today
          : (event.end || event.start) > now;
        return hasNotEnded && event.start <= horizon;
      })
      .sort((a, b) => a.start - b.start)
      .slice(0, 5);
    $("event-count").textContent = upcoming.length;
    $("upcoming").replaceChildren();
    if (!upcoming.length) {
      const empty = document.createElement("p");
      empty.className = "empty-upcoming";
      const strong = document.createElement("strong");
      strong.textContent = "A little breathing room.";
      empty.append(strong, "Plans for the next 30 days will appear here.");
      $("upcoming").append(empty);
    }
    for (const event of upcoming) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "upcoming-item";
      const marker = document.createElement("span");
      marker.className = "upcoming-marker";
      marker.style.backgroundColor = event.backgroundColor;
      marker.setAttribute("aria-hidden", "true");
      const detail = document.createElement("span");
      const title = document.createElement("span");
      title.className = "upcoming-title";
      title.textContent = event.title;
      const when = document.createElement("span");
      when.className = "upcoming-time";
      when.textContent =
        event.start.toLocaleDateString("en-AU", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }) +
        (event.allDay
          ? " · All day"
          : ` · ${event.start.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`);
      detail.append(title, when);
      button.append(marker, detail);
      button.addEventListener("click", () => {
        calendar.gotoDate(event.start);
        openForm(event);
      });
      $("upcoming").append(button);
    }
  }
  function updateAllDay() {
    const allDay = $("all-day").checked;
    for (const id of ["start-time", "end-time"]) {
      $(id).hidden = allDay;
      $(id).disabled = allDay;
      $(id).required = !allDay;
    }
    document.querySelectorAll(".time-label").forEach((label) => {
      label.hidden = allDay;
    });
    $("date-help").textContent = allDay
      ? "End date is the last day of the event, including that day."
      : "Times use your device’s timezone.";
    $("event-reminder-help").textContent = !reminderBackendReady
      ? "Finish the Supabase notification setup to save reminders."
      : "Only your reminder is saved. Enable a device under Notifications." +
        (allDay ? ` All-day events use 9 am in ${reminderTimezone}.` : "") +
        " Past reminder times are not replayed.";
  }
  function openForm(event = null, selection = null) {
    if (!user || !context?.family || writeBusy) return;
    form.reset();
    editingId = event?.id || null;
    draftId = event?.id || uid();
    const readOnly = isPublicHoliday(event);
    editingHoliday = readOnly;
    editingVersion = records.get(editingId)?.version ?? null;
    form.querySelectorAll("input, textarea, select").forEach((field) => {
      field.disabled = false;
    });
    form.querySelector('button[type="submit"]').hidden = readOnly;
    $("cancel-dialog").textContent = readOnly ? "Close" : "Cancel";
    $("form-error").hidden = true;
    $("dialog-title").textContent = readOnly
      ? "NSW public holiday"
      : event
        ? "Edit event"
        : "New event";
    $("delete-event").hidden = !event || readOnly;
    const start = event?.start
      ? new Date(event.start)
      : selection?.start
        ? new Date(selection.start)
        : new Date();
    const allDay = event ? event.allDay : selection ? selection.allDay : false;
    if (!event && (!selection || selection.allDay)) start.setHours(9, 0, 0, 0);
    const end = event?.end
      ? new Date(event.end)
      : selection?.end
        ? new Date(selection.end)
        : new Date(start.getTime() + 3600000);
    if (allDay) {
      const endExclusive = event?.end || selection?.end;
      $("end-date").value = endExclusive
        ? addDays(localDate(new Date(endExclusive)), -1)
        : localDate(start);
    } else {
      $("end-date").value = localDate(end);
    }
    $("start-date").value = localDate(start);
    $("start-time").value = localTime(start);
    $("end-time").value = localTime(end);
    $("all-day").checked = allDay;
    $("event-title").value = event?.title || "";
    $("event-location").value = event?.extendedProps.location || "";
    $("event-notes").value = event?.extendedProps.notes || "";
    const color = event?.backgroundColor || colors[0];
    const previousCustom = $("event-color").querySelector("[data-custom]");
    previousCustom?.remove();
    if (!colors.includes(color)) {
      const option = document.createElement("option");
      option.value = color;
      option.textContent = "Original colour";
      option.dataset.custom = "true";
      $("event-color").append(option);
    }
    $("event-color").value = color;
    $("event-sharing").hidden = readOnly;
    $("event-reminder-fields").hidden = readOnly;
    const savedReminder = reminders.get(event?.id);
    reminderTimezone =
      savedReminder?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "Australia/Sydney";
    $("event-reminder").value = savedReminder
      ? String(savedReminder.minutes)
      : "";
    $("event-reminder").disabled = readOnly || !reminderBackendReady;
    renderSharers(records.get(editingId));
    updateAllDay();
    if (readOnly)
      form.querySelectorAll("input, textarea, select").forEach((field) => {
        field.disabled = true;
      });
    dialog.showModal();
    (readOnly ? $("cancel-dialog") : $("event-title")).focus();
    calendar.unselect();
  }
  function download(content, filename) {
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const sb = window.supabase.createClient(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "sajal.family.calendar.auth.v1",
    },
  });
  async function rpc(name, args = {}) {
    const { data, error } = await sb.rpc(name, args);
    if (error) {
      if (/fetch|network|timeout/i.test(error.message || ""))
        cloudConnected = false;
      throw error;
    }
    return data;
  }
  const push = CalendarPush.create({ rpc });
  $("notification-settings").addEventListener("click", () => push.open());
  initCalendarNavigation();
  function explain(error) {
    if (["PGRST202", "42P01", "PGRST205"].includes(error?.code))
      return "The database is not ready. Run setup.sql in the Supabase SQL Editor first.";
    if (error?.code === "invalid_credentials")
      return "The email or password was not accepted.";
    return error?.message || "Check your connection and try again.";
  }
  function status(id, text, error = false) {
    $(id).textContent = text;
    $(id).classList.toggle("error", error);
  }
  function setBusy(value) {
    writeBusy = value;
    document
      .querySelectorAll(
        '.new-event,#event-form button[type="submit"],#delete-event,#import,#import-legacy',
      )
      .forEach((b) => (b.disabled = value));
    $("sync-status").textContent = value
      ? "Saving…"
      : cloudConnected
        ? "Synced"
        : "Connection interrupted";
  }
  const member = (id) => context?.members.find((person) => person.id === id);
  const currentEvents = () =>
    calendar
      .getEvents()
      .filter((e) => !isPublicHoliday(e))
      .map(plainEvent);
  function payload(e) {
    return {
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      color: e.backgroundColor || e.color || colors[0],
      extendedProps: {
        location: e.extendedProps?.location || "",
        notes: e.extendedProps?.notes || "",
      },
    };
  }
  function replacePersonalEvents() {
    calendar.batchRendering(() => {
      calendar
        .getEvents()
        .filter((e) => !isPublicHoliday(e))
        .forEach((e) => e.remove());
      normalizeEvents([...records.values()]).forEach((e) =>
        calendar.addEvent(e),
      );
    });
  }
  function renderSharers(row) {
    const owner = row?.owner_id || user.id,
      selected = new Set(row?.share_with || []);
    $("share-owner").textContent =
      owner === user.id
        ? "You keep access to events you create. Other family members see this event only if you select them below."
        : `Created by ${member(owner)?.display_name || "a family member"} and shared with you. Only its creator and selected people can access this event.`;
    $("event-sharing").querySelector(":scope > p:last-child").textContent =
      "Everyone included can edit or delete this event. Leave all unchecked to keep an event you create private.";
    $("share-options").replaceChildren();
    const candidates = context.members.filter((p) => p.id !== owner);
    if (!candidates.length) {
      const p = document.createElement("p");
      p.className = "field-help";
      p.textContent =
        "No one else has joined your family yet. Open Family for your joining code.";
      $("share-options").append(p);
    }
    for (const person of candidates) {
      const label = document.createElement("label");
      label.className = "share-person";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = person.id;
      input.checked = selected.has(person.id);
      const detail = document.createElement("span"),
        name = document.createElement("span"),
        email = document.createElement("small");
      name.textContent =
        person.display_name + (person.id === user.id ? " (you)" : "");
      email.textContent = person.email;
      detail.append(name, email);
      label.append(input, detail);
      $("share-options").append(label);
    }
  }
  function renderFamilyMembers() {
    if (!context?.family) return;
    $("family-dialog-title").textContent = context.family.name;
    $("invite-code").value = context.family.join_code;
    $("family-members").replaceChildren();
    for (const person of context.members) {
      const div = document.createElement("div");
      div.className = "family-person";
      const name = document.createElement("span"),
        email = document.createElement("small");
      name.textContent =
        person.display_name + (person.id === user.id ? " (you)" : "");
      email.textContent = person.email;
      div.append(name, email);
      $("family-members").append(div);
    }
  }
  function buildCalendar() {
    calendar = new FullCalendar.Calendar($("calendar"), {
      initialView: "dayGridMonth",
      firstDay: 1,
      timeZone: "local",
      locale: "en-gb",
      headerToolbar: {
        left: "today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
      },
      buttonText: {
        today: "Today",
        month: "Month",
        week: "Week",
        day: "Day",
        list: "Agenda",
      },
      height: "100%",
      expandRows: true,
      selectable: true,
      selectMirror: true,
      editable: true,
      eventResizableFromStart: true,
      nowIndicator: true,
      dayMaxEvents: true,
      moreLinkText: (count) =>
        phoneLayout.matches ? `+${count}` : `+${count} more`,
      moreLinkDidMount: (info) =>
        info.el.setAttribute("aria-label", `Show ${info.num} more events`),
      views: { timeGrid: { dayMaxEventRows: 2 } },
      fixedWeekCount: false,
      displayEventEnd: true,
      scrollTime: "08:00:00",
      slotDuration: "00:30:00",
      eventTimeFormat: {
        hour: "numeric",
        minute: "2-digit",
        meridiem: "short",
      },
      slotLabelFormat: {
        hour: "numeric",
        minute: "2-digit",
        meridiem: "short",
      },
      eventSources: [
        {
          id: CalendarHolidays.sourceId,
          events: (info, success) => success(CalendarHolidays.events(info)),
          editable: false,
        },
      ],
      eventsSet: () => {
        if (calendar) renderUpcoming();
      },
      datesSet: (info) => renderCalendarTitle(info.view),
      select: (info) => {
        if (Date.now() < suppressCalendarTapUntil) {
          calendar?.unselect();
          return;
        }
        openForm(null, info);
      },
      eventClick: (info) => {
        info.jsEvent.preventDefault();
        if (Date.now() < suppressCalendarTapUntil) return;
        openForm(info.event);
      },
      eventAllow: () => !writeBusy,
      eventDragStart: () => {
        dragging = true;
      },
      eventDragStop: () => {
        dragging = false;
      },
      eventResizeStart: () => {
        dragging = true;
      },
      eventResizeStop: () => {
        dragging = false;
      },
      eventDrop: saveMovedEvent,
      eventResize: saveMovedEvent,
      eventDidMount: (info) => {
        info.el.title = [
          info.event.title,
          info.event.extendedProps.location,
          info.event.extendedProps.notes,
        ]
          .filter(Boolean)
          .join("\n");
        info.el.tabIndex = 0;
        info.el.setAttribute(
          "aria-label",
          `${isPublicHoliday(info.event) ? "View" : "Edit"} ${info.event.title}`,
        );
        info.el.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openForm(info.event);
          }
        });
      },
    });
    replacePersonalEvents();
    calendar.render();
    calendarSizeObserver?.disconnect();
    let previousSize = "";
    calendarSizeObserver = new ResizeObserver(() => {
      const card = $("calendar").parentElement;
      const size = `${card.clientWidth}:${card.clientHeight}`;
      if (size === previousSize) return;
      previousSize = size;
      cancelAnimationFrame(calendarSizeFrame);
      calendarSizeFrame = requestAnimationFrame(() => calendar?.updateSize());
    });
    calendarSizeObserver.observe($("calendar").parentElement);
  }
  function renderCalendarTitle(view) {
    const title = $("calendar").querySelector(".fc-toolbar-title");
    if (!title) return;
    const makeButton = (label, part) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-title-button";
      button.dataset.pickerPart = part;
      button.textContent = label;
      button.setAttribute("aria-label", `Choose ${part}, currently ${label}`);
      button.addEventListener("click", () => openDatePicker(part, button));
      return button;
    };
    const date = calendar?.getDate() || view.currentStart;
    if (view.type === "dayGridMonth")
      title.replaceChildren(
        makeButton(
          date.toLocaleDateString("en-AU", { month: "long" }),
          "month",
        ),
        document.createTextNode(" "),
        makeButton(String(date.getFullYear()), "year"),
      );
    else title.replaceChildren(makeButton(view.title, "month and year"));
  }
  function closeAccountMenu(restoreFocus = false) {
    $("account-actions").removeAttribute("data-open");
    $("mobile-menu-toggle").setAttribute("aria-expanded", "false");
    $("mobile-menu-toggle").setAttribute("aria-label", "Open account menu");
    if (restoreFocus) $("mobile-menu-toggle").focus();
  }
  function canNavigateMonth() {
    return (
      calendar?.view.type === "dayGridMonth" &&
      !writeBusy &&
      !dragging &&
      !document.querySelector("dialog[open]") &&
      !$("account-actions").hasAttribute("data-open")
    );
  }
  function navigateMonth(direction) {
    if (!canNavigateMonth() || navigationBusy) return false;
    const date = calendar.getDate(),
      year = date.getFullYear(),
      month = date.getMonth();
    if (
      (direction < 0 && year <= 1 && month === 0) ||
      (direction > 0 && year >= 9999 && month === 11)
    )
      return false;
    navigationBusy = true;
    calendar.unselect();
    direction > 0 ? calendar.next() : calendar.prev();
    const view = $("calendar").querySelector(".fc-view-harness");
    if (!view || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      navigationBusy = false;
      return true;
    }
    navigationAnimation?.cancel();
    navigationAnimation = view.animate(
      [
        { transform: `translateX(${direction * 14}px)`, opacity: 0.7 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 120, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    navigationAnimation.finished
      .catch(() => {})
      .finally(() => {
        navigationBusy = false;
      });
    return true;
  }
  function option(value, label, selected, prefix) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "option");
    button.tabIndex = -1;
    button.id = `${prefix}-${value}`;
    button.dataset.value = value;
    button.setAttribute("aria-selected", String(selected));
    button.textContent = label;
    return button;
  }
  function renderMonthOptions() {
    $("month-options").replaceChildren(
      ...Array.from({ length: 12 }, (_, month) =>
        option(
          month,
          new Date(2026, month, 1).toLocaleDateString("en-AU", {
            month: "long",
          }),
          month === pickerMonth,
          "date-month",
        ),
      ),
    );
    $("month-options").setAttribute(
      "aria-activedescendant",
      `date-month-${pickerMonth}`,
    );
  }
  function renderYearOptions() {
    const fragment = document.createDocumentFragment();
    for (let year = yearStart; year <= yearEnd; year++)
      fragment.append(
        option(year, String(year), year === pickerYear, "date-year"),
      );
    $("year-options").replaceChildren(fragment);
    $("year-options").setAttribute(
      "aria-activedescendant",
      `date-year-${pickerYear}`,
    );
  }
  function chooseDatePart(part, value, scroll = false) {
    const list = $(part === "month" ? "month-options" : "year-options");
    if (part === "month") pickerMonth = Math.max(0, Math.min(11, value));
    else {
      pickerYear = Math.max(1, Math.min(9999, value));
      if (pickerYear < yearStart || pickerYear > yearEnd) {
        yearStart = Math.max(1, pickerYear - 100);
        yearEnd = Math.min(9999, pickerYear + 100);
        renderYearOptions();
      }
    }
    const chosen = part === "month" ? pickerMonth : pickerYear;
    for (const item of list.children)
      item.setAttribute(
        "aria-selected",
        String(Number(item.dataset.value) === chosen),
      );
    const item = list.querySelector(`[data-value="${chosen}"]`);
    list.setAttribute("aria-activedescendant", item.id);
    if (scroll) item.scrollIntoView({ block: "center", behavior: "instant" });
  }
  function openDatePicker(part, trigger) {
    if (!calendar || writeBusy) return;
    closeAccountMenu();
    const date = calendar.getDate();
    pickerMonth = date.getMonth();
    pickerYear = date.getFullYear();
    yearStart = Math.max(1, pickerYear - 100);
    yearEnd = Math.min(9999, pickerYear + 100);
    pickerReturnFocus = trigger;
    renderMonthOptions();
    renderYearOptions();
    $("date-picker-dialog").showModal();
    chooseDatePart("month", pickerMonth, true);
    chooseDatePart("year", pickerYear, true);
    $(part === "year" ? "year-options" : "month-options").focus({
      preventScroll: true,
    });
  }
  function initCalendarNavigation() {
    $("mobile-menu-toggle").addEventListener("click", () => {
      const actions = $("account-actions");
      if (actions.hasAttribute("data-open")) {
        closeAccountMenu();
        return;
      }
      document.documentElement.style.setProperty(
        "--phone-menu-top",
        `${$("mobile-menu-toggle").getBoundingClientRect().bottom + 8}px`,
      );
      actions.dataset.open = "true";
      $("mobile-menu-toggle").setAttribute("aria-expanded", "true");
      $("mobile-menu-toggle").setAttribute("aria-label", "Close account menu");
    });
    document.addEventListener("click", (event) => {
      if (
        !$("account-actions").contains(event.target) &&
        !$("mobile-menu-toggle").contains(event.target)
      )
        closeAccountMenu();
    });
    $("account-actions").addEventListener("click", (event) => {
      if (event.target.closest("button")) closeAccountMenu();
    });
    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        $("account-actions").hasAttribute("data-open")
      ) {
        event.preventDefault();
        closeAccountMenu(true);
      }
    });
    phoneLayout.addEventListener("change", () => closeAccountMenu());
    for (const part of ["month", "year"]) {
      const list = $(part === "month" ? "month-options" : "year-options");
      list.addEventListener("click", (event) => {
        const item = event.target.closest('[role="option"]');
        if (item) {
          chooseDatePart(part, Number(item.dataset.value));
          list.focus({ preventScroll: true });
        }
      });
      list.addEventListener("keydown", (event) => {
        let value = part === "month" ? pickerMonth : pickerYear;
        if (event.key === "ArrowDown") value++;
        else if (event.key === "ArrowUp") value--;
        else if (event.key === "PageDown") value += 5;
        else if (event.key === "PageUp") value -= 5;
        else if (event.key === "Home") value = part === "month" ? 0 : 1;
        else if (event.key === "End") value = part === "month" ? 11 : 9999;
        else return;
        event.preventDefault();
        chooseDatePart(part, value, true);
      });
    }
    $("year-options").addEventListener("scroll", () => {
      const list = $("year-options"),
        before = list.scrollTop;
      if (before < 150 && yearStart > 1) {
        const count = Math.min(50, yearStart - 1),
          rowHeight = list.firstElementChild.getBoundingClientRect().height;
        yearStart -= count;
        renderYearOptions();
        list.scrollTop = before + count * rowHeight;
      } else if (
        list.scrollHeight - list.clientHeight - before < 150 &&
        yearEnd < 9999
      ) {
        yearEnd = Math.min(9999, yearEnd + 50);
        renderYearOptions();
        list.scrollTop = before;
      }
    });
    for (const id of ["close-date-picker", "cancel-date-picker"])
      $(id).addEventListener("click", () => $("date-picker-dialog").close());
    $("date-picker-form").addEventListener("submit", (event) => {
      event.preventDefault();
      $("date-picker-dialog").close();
      calendar?.gotoDate(
        `${String(pickerYear).padStart(4, "0")}-${pad(pickerMonth + 1)}-01`,
      );
    });
    $("date-picker-dialog").addEventListener("close", () => {
      if (pickerReturnFocus?.isConnected)
        pickerReturnFocus.focus({ preventScroll: true });
      else
        $("calendar")
          .querySelector(".calendar-title-button")
          ?.focus({ preventScroll: true });
    });
    const root = $("calendar");
    let wheelTime = 0,
      wheelDistance = 0,
      wheelHandled = false;
    root.addEventListener(
      "wheel",
      (event) => {
        if (
          phoneLayout.matches ||
          !canNavigateMonth() ||
          event.ctrlKey ||
          !event.target.closest(".fc-view-harness") ||
          event.target.closest(".fc-popover")
        )
          return;
        if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY)
          return;
        event.preventDefault();
        const now = performance.now();
        if (now - wheelTime > 180) {
          wheelDistance = 0;
          wheelHandled = false;
        }
        wheelTime = now;
        wheelDistance +=
          event.deltaY *
          (event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? root.clientHeight
              : 1);
        if (
          !wheelHandled &&
          Math.abs(wheelDistance) >= 35 &&
          navigateMonth(Math.sign(wheelDistance))
        )
          wheelHandled = true;
      },
      { passive: false },
    );
    let swipe = null;
    root.addEventListener(
      "touchstart",
      (event) => {
        if (
          event.touches.length !== 1 ||
          !phoneLayout.matches ||
          !canNavigateMonth() ||
          !event.target.closest(".fc-daygrid-day") ||
          event.target.closest(
            ".fc-event,.fc-popover,.fc-daygrid-more-link,button,input,select",
          )
        )
          return;
        const touch = event.touches[0];
        swipe = {
          id: touch.identifier,
          x: touch.clientX,
          y: touch.clientY,
          started: performance.now(),
          active: false,
        };
      },
      { capture: true, passive: true },
    );
    root.addEventListener(
      "touchmove",
      (event) => {
        if (!swipe || event.touches.length !== 1) {
          swipe = null;
          return;
        }
        const touch = Array.from(event.touches).find(
          (item) => item.identifier === swipe.id,
        );
        if (!touch) return;
        const dx = touch.clientX - swipe.x,
          dy = touch.clientY - swipe.y;
        if (
          Math.abs(dx) > 12 &&
          Math.abs(dx) > Math.abs(dy) * 1.4 &&
          !dragging
        ) {
          swipe.active = true;
          suppressCalendarTapUntil = Date.now() + 350;
          calendar?.unselect();
          if (event.cancelable) event.preventDefault();
        }
      },
      { capture: true, passive: false },
    );
    root.addEventListener(
      "touchend",
      (event) => {
        if (!swipe) return;
        const touch = Array.from(event.changedTouches).find(
          (item) => item.identifier === swipe.id,
        );
        if (!touch) return;
        const current = swipe;
        swipe = null;
        const dx = touch.clientX - current.x,
          dy = touch.clientY - current.y;
        if (
          current.active &&
          Math.abs(dx) >= 48 &&
          Math.abs(dx) > Math.abs(dy) * 1.4 &&
          performance.now() - current.started < 800
        ) {
          suppressCalendarTapUntil = Date.now() + 350;
          navigateMonth(dx < 0 ? 1 : -1);
        }
      },
      { capture: true, passive: true },
    );
    root.addEventListener(
      "touchcancel",
      () => {
        swipe = null;
      },
      { capture: true, passive: true },
    );
    root.addEventListener(
      "click",
      (event) => {
        if (
          Date.now() < suppressCalendarTapUntil &&
          event.target.closest(".fc-view-harness")
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  }
  function closeForm() {
    dialog.close();
    form.reset();
    $("share-options").replaceChildren();
    $("share-owner").textContent = "";
    editingId = null;
    editingVersion = null;
    editingHoliday = false;
  }
  function clearAccountView() {
    document.body.classList.remove("calendar-home-active");
    closeAccountMenu();
    calendarSizeObserver?.disconnect();
    cancelAnimationFrame(calendarSizeFrame);
    navigationAnimation?.cancel();
    navigationBusy = false;
    for (const id of [
      "event-dialog",
      "confirm-dialog",
      "family-dialog",
      "date-picker-dialog",
    ])
      if ($(id).open) $(id).close();
    editingId = null;
    editingVersion = null;
    editingHoliday = false;
    calendar?.destroy();
    calendar = null;
    records.clear();
    reminders.clear();
    reminderLinkHandled = false;
    reminderBackendReady = false;
    context = null;
    lastSnapshot = "";
    writeBusy = false;
    dragging = false;
    cloudConnected = false;
    form.reset();
    $("share-owner").textContent = "";
    $("family-dialog-title").textContent = "Your family";
    $("calendar").replaceChildren();
    $("upcoming").replaceChildren();
    $("share-options").replaceChildren();
    $("family-members").replaceChildren();
    $("invite-code").value = "";
    $("account-name").textContent = "";
    $("notice").hidden = true;
    $("calendar-app").hidden = true;
    $("family-setup-screen").hidden = true;
    $("password-screen").hidden = true;
    $("password-form").reset();
    $("password-account").textContent = "";
    $("reset-form").hidden = true;
    $("login-screen").hidden = false;
    setBusy(false);
  }
  async function refreshCloud(first = false) {
    if (!user || passwordFlow) return false;
    const requestEpoch = epoch;
    if (refreshFlight?.epoch === requestEpoch) return refreshFlight.promise;
    const promise = (async () => {
      try {
        const [nextContext, rows, ownReminders] = await Promise.all([
          rpc("cal_get_context"),
          rpc("cal_list_events"),
          rpc("cal_list_my_reminders").catch(() => null),
        ]);
        if (requestEpoch !== epoch || !user) return false;
        if (nextContext.profile?.id !== user.id)
          throw new Error(
            "The account response did not match your sign-in. Sign out and try again.",
          );
        context = nextContext;
        reminderBackendReady = ownReminders !== null;
        reminders = new Map(
          (ownReminders || []).map((row) => [row.event_id, row]),
        );
        if (!context.family) {
          document.body.classList.remove("calendar-home-active");
          calendarSizeObserver?.disconnect();
          calendar?.destroy();
          calendar = null;
          records.clear();
          $("calendar-app").hidden = true;
          $("login-screen").hidden = true;
          $("family-setup-screen").hidden = false;
          $("setup-name").value = context.profile.display_name;
          return true;
        }
        $("family-setup-screen").hidden = true;
        $("login-screen").hidden = true;
        $("calendar-app").hidden = false;
        document.body.classList.add("calendar-home-active");
        $("account-name").textContent =
          `${context.profile.display_name} · ${context.family.name}`;
        const snapshot = JSON.stringify([context, rows, ownReminders]);
        if (snapshot !== lastSnapshot || !calendar) {
          records = new Map(rows.map((row) => [row.id, row]));
          lastSnapshot = snapshot;
          if (dialog.open && editingId && !editingHoliday) {
            const current = records.get(editingId);
            if (!current) {
              closeForm();
              message(
                "This event was deleted or is no longer shared with you.",
                true,
                true,
              );
            } else if (current.version !== editingVersion) {
              $("form-error").textContent =
                "This event changed elsewhere. Close and reopen it before saving.";
              $("form-error").hidden = false;
            }
          }
          if (!calendar) buildCalendar();
          else replacePersonalEvents();
          renderFamilyMembers();
          updateLegacyPrompt();
        }
        cloudConnected = true;
        $("sync-status").textContent = "Synced";
        if (!reminderLinkHandled) {
          const params = new URLSearchParams(location.search);
          const eventId = params.get("reminder");
          const accountId = params.get("account");
          if (eventId) {
            reminderLinkHandled = true;
            if (accountId && accountId !== user.id)
              message(
                "This reminder belongs to another account. Sign in to that account to view it.",
                true,
                true,
              );
            else {
              const event = calendar.getEventById(eventId);
              if (event && records.has(eventId)) {
                calendar.gotoDate(event.start);
                openForm(event);
              } else
                message(
                  "This event was deleted or is no longer shared with you.",
                  true,
                  true,
                );
            }
          }
        }
        return true;
      } catch (error) {
        if (requestEpoch !== epoch) return false;
        cloudConnected = false;
        if (first || !calendar) {
          $("login-screen").hidden = false;
          $("login-form").hidden = true;
          $("signed-in-error").hidden = false;
          status("auth-status", explain(error), true);
        } else {
          $("sync-status").textContent = "Connection interrupted";
          message(`Could not refresh: ${explain(error)}`, true, true);
        }
        return false;
      }
    })();
    refreshFlight = { epoch: requestEpoch, promise };
    try {
      return await promise;
    } finally {
      if (refreshFlight?.promise === promise) refreshFlight = null;
    }
  }
  function handleSession(session, event) {
    const next = session?.user || null;
    if (!next && emailLinkPending) {
      emailLinkPending = false;
      emailLinkError = true;
    }
    let nextFlow = next ? pendingPasswordFlow(next.id) : null;
    if (next && (emailLinkPending || event === "PASSWORD_RECOVERY")) {
      nextFlow = event === "PASSWORD_RECOVERY" ? "recovery" : emailLinkType;
      emailLinkPending = false;
    }
    if (
      next &&
      nextFlow &&
      (next.id !== user?.id || passwordFlow !== nextFlow)
    ) {
      initialSessionSeen = true;
      epoch++;
      user = next;
      push.setAccount(user.id);
      passwordFlow = nextFlow;
      rememberPasswordFlow(nextFlow, user.id);
      clearAccountView();
      $("login-screen").hidden = true;
      $("password-screen").hidden = false;
      $("password-heading").textContent =
        nextFlow === "invite"
          ? "Choose your password."
          : "Reset your password.";
      $("password-intro").textContent =
        nextFlow === "invite"
          ? "Finish setting up your calendar login."
          : "Choose a new password for your calendar.";
      $("password-account").textContent = user.email || "";
      status("password-status", "");
      $("new-password").focus();
      return;
    }
    if (initialSessionSeen && next?.id === user?.id) return;
    initialSessionSeen = true;
    epoch++;
    user = next;
    push.setAccount(user?.id || null);
    passwordFlow = null;
    if (!user) rememberPasswordFlow(null);
    clearAccountView();
    $("login-form").hidden = Boolean(user);
    $("signed-in-error").hidden = Boolean(!user);
    status(
      "auth-status",
      user
        ? "Loading your calendar…"
        : emailLinkError
          ? "This email link has expired or was already used. Request a new link, or sign in if your password is already set."
          : "",
      emailLinkError,
    );
    if (user)
      void refreshCloud(true).then(() => {
        if (emailLinkError)
          message(
            "This email link is no longer valid. You are using your existing sign-in. Request a new password reset link if needed.",
            true,
            true,
          );
      });
    else $("login-password").value = "";
  }
  $("password-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!user || !passwordFlow || $("password-submit").disabled) return;
    const requestEpoch = epoch;
    const password = $("new-password").value;
    if (password !== $("confirm-password").value) {
      status("password-status", "The passwords do not match.", true);
      return;
    }
    if (password.length < 12 || password.length > 128) {
      status(
        "password-status",
        "Use a password between 12 and 128 characters.",
        true,
      );
      return;
    }
    $("password-submit").disabled = true;
    status("password-status", "Saving your password…");
    try {
      const { data, error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      if (requestEpoch !== epoch) return;
      user = data.user;
      passwordFlow = null;
      rememberPasswordFlow(null);
      $("password-form").reset();
      $("password-screen").hidden = true;
      $("password-account").textContent = "";
      $("login-screen").hidden = false;
      $("login-form").hidden = true;
      $("signed-in-error").hidden = true;
      status("auth-status", "Password saved. Loading your calendar…");
      await refreshCloud(true);
    } catch (error) {
      if (requestEpoch === epoch)
        status("password-status", explain(error), true);
    } finally {
      $("password-submit").disabled = false;
    }
  });
  $("forgot-password").addEventListener("click", () => {
    $("login-form").hidden = true;
    $("reset-form").hidden = false;
    $("reset-email").value = $("login-email").value;
    status("auth-status", "");
    $("reset-email").focus();
  });
  $("reset-cancel").addEventListener("click", () => {
    $("reset-form").hidden = true;
    $("login-form").hidden = false;
    status("auth-status", "");
  });
  $("reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if ($("reset-submit").disabled) return;
    $("reset-submit").disabled = true;
    status("auth-status", "Requesting a reset link…");
    try {
      const { error } = await sb.auth.resetPasswordForEmail(
        $("reset-email").value.trim(),
        {
          redirectTo: new URL("./", location.href).href,
        },
      );
      if (error) throw error;
      status(
        "auth-status",
        "If that email has a calendar account, a reset link will arrive shortly. Check your spam folder too.",
      );
    } catch (error) {
      status("auth-status", explain(error), true);
    } finally {
      $("reset-submit").disabled = false;
    }
  });
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-submit").disabled = true;
    status("auth-status", "Signing in…");
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: $("login-email").value.trim(),
        password: $("login-password").value,
      });
      if (error) throw error;
    } catch (error) {
      status("auth-status", explain(error), true);
    } finally {
      $("login-submit").disabled = false;
    }
  });
  async function signOut() {
    try {
      await push.disconnect();
    } catch {
      /* Browser subscription is stopped even if the server is unavailable. */
    }
    const { error } = await sb.auth.signOut();
    if (error) {
      message(explain(error), true, true);
      status("auth-status", explain(error), true);
    }
  }
  for (const id of [
    "signout",
    "setup-signout",
    "family-setup-signout",
    "password-signout",
  ])
    $(id).addEventListener("click", signOut);
  $("retry-load").addEventListener("click", () => refreshCloud(true));
  async function setupFamily(e, join) {
    e.preventDefault();
    const requestEpoch = epoch,
      buttons = e.target.querySelectorAll("button");
    buttons.forEach((b) => (b.disabled = true));
    status("family-setup-status", "Saving…");
    try {
      const name = $("setup-name").value.trim();
      if (!name || name.length > 80)
        throw new Error("Enter your display name first.");
      await rpc("cal_update_profile", { p_name: name });
      await rpc(
        join ? "cal_join_family" : "cal_create_family",
        join
          ? { p_code: $("family-code").value.trim() }
          : { p_name: $("family-name").value.trim() },
      );
      if (requestEpoch === epoch) {
        status("family-setup-status", "");
        await refreshCloud(true);
      }
    } catch (error) {
      if (requestEpoch === epoch)
        status("family-setup-status", explain(error), true);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }
  $("create-family-form").addEventListener("submit", (e) =>
    setupFamily(e, false),
  );
  $("join-family-form").addEventListener("submit", (e) => setupFamily(e, true));
  $("family-settings").addEventListener("click", () => {
    renderFamilyMembers();
    status("family-dialog-status", "");
    $("family-dialog").showModal();
  });
  $("close-family").addEventListener("click", () => $("family-dialog").close());
  $("copy-family-code").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("invite-code").value);
      status("family-dialog-status", "Family code copied.");
    } catch {
      $("invite-code").select();
      status("family-dialog-status", "Select and copy the family code.");
    }
  });
  $("all-day").addEventListener("change", updateAllDay);
  $("close-dialog").addEventListener("click", closeForm);
  $("cancel-dialog").addEventListener("click", closeForm);
  document
    .querySelectorAll(".new-event")
    .forEach((b) => b.addEventListener("click", () => openForm()));
  function fieldDate(dateId, timeId) {
    const d = new Date(`${$(dateId).value}T${$(timeId).value}`);
    if (
      !Number.isFinite(d.getTime()) ||
      localDate(d) !== $(dateId).value ||
      localTime(d) !== $(timeId).value
    )
      throw new Error(
        "That time is not available in your timezone. Choose another time.",
      );
    return d;
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (editingHoliday || writeBusy || !user) return;
    const requestEpoch = epoch;
    setBusy(true);
    try {
      const allDay = $("all-day").checked,
        title = $("event-title").value.trim();
      if (!title) throw new Error("Please give the event a title.");
      const start = allDay
          ? $("start-date").value
          : fieldDate("start-date", "start-time").toISOString(),
        end = allDay
          ? addDays($("end-date").value, 1)
          : fieldDate("end-date", "end-time").toISOString();
      const normalized = normalizeEvents([
        {
          title,
          start,
          end,
          allDay,
          color: $("event-color").value,
          extendedProps: {
            location: $("event-location").value.trim(),
            notes: $("event-notes").value.trim(),
          },
        },
      ])[0];
      const data = { ...payload(normalized), id: editingId || draftId };
      await rpc(
        reminderBackendReady
          ? "cal_save_event_with_reminder"
          : "cal_save_event",
        {
          p_event: data,
          p_share_with: [
            ...$("share-options").querySelectorAll("input:checked"),
          ].map((i) => i.value),
          p_expected_version: editingVersion,
          ...(reminderBackendReady
            ? {
                p_reminder_minutes:
                  $("event-reminder").value === ""
                    ? null
                    : Number($("event-reminder").value),
                p_reminder_timezone: reminderTimezone,
              }
            : {}),
        },
      );
      if (requestEpoch !== epoch) return;
      closeForm();
      const refreshed = await refreshCloud();
      message(
        refreshed
          ? "Event saved to your account."
          : "Event saved. Account refresh will retry when connected.",
        !refreshed,
        !refreshed,
      );
    } catch (error) {
      if (requestEpoch === epoch) {
        $("form-error").textContent = explain(error);
        $("form-error").hidden = false;
        if (["40001", "42501"].includes(error.code)) await refreshCloud();
      }
    } finally {
      if (requestEpoch === epoch) setBusy(false);
    }
  });
  $("delete-event").addEventListener("click", () => {
    const shared = (records.get(editingId)?.share_with.length || 0) > 0;
    $("confirm-dialog").querySelector("p").textContent = shared
      ? "Deleting this shared event removes it for everyone."
      : "You can keep it by choosing Cancel.";
    $("confirm-dialog").returnValue = "";
    $("confirm-dialog").showModal();
  });
  $("confirm-dialog").addEventListener("close", async () => {
    if (
      $("confirm-dialog").returnValue !== "delete" ||
      !editingId ||
      editingHoliday ||
      writeBusy
    )
      return;
    const requestEpoch = epoch;
    setBusy(true);
    try {
      await rpc("cal_delete_event", {
        p_id: editingId,
        p_expected_version: editingVersion,
      });
      if (requestEpoch !== epoch) return;
      closeForm();
      await refreshCloud();
      message("Event deleted for everyone who had access.");
    } catch (error) {
      if (requestEpoch === epoch) {
        $("form-error").textContent = explain(error);
        $("form-error").hidden = false;
      }
    } finally {
      if (requestEpoch === epoch) setBusy(false);
    }
  });
  async function saveMovedEvent(info) {
    if (isPublicHoliday(info.event) || writeBusy) {
      info.revert();
      return;
    }
    const row = records.get(info.event.id),
      requestEpoch = epoch;
    setBusy(true);
    try {
      if (!row) throw new Error("Refresh the calendar and try again.");
      await rpc("cal_save_event", {
        p_event: { ...payload(plainEvent(info.event)), id: info.event.id },
        p_share_with: row.share_with,
        p_expected_version: row.version,
      });
      if (requestEpoch === epoch) {
        await refreshCloud();
        message("Event moved and saved.");
      }
    } catch (error) {
      if (requestEpoch === epoch) {
        info.revert();
        message(explain(error), true, true);
        await refreshCloud();
      }
    } finally {
      if (requestEpoch === epoch) setBusy(false);
    }
  }
  $("export").addEventListener("click", () => {
    if (!calendar) return;
    download(
      JSON.stringify(
        {
          format: "sajal-calendar-backup",
          version: 1,
          exportedAt: new Date().toISOString(),
          events: currentEvents(),
        },
        null,
        2,
      ),
      `sajal-calendar-${localDate(new Date())}.json`,
    );
    message(
      "Backup downloaded. Imported copies are private until you share them.",
    );
  });
  function fingerprint(event) {
    const e = normalizeEvents([event])[0];
    return JSON.stringify([e.title, e.start, e.end, e.allDay, e.extendedProps]);
  }
  async function importEvents(input, prefix) {
    const seen = new Set([...records.values()].map(fingerprint)),
      additions = [];
    for (const e of normalizeEvents(input)) {
      const key = fingerprint(e);
      if (seen.has(key)) continue;
      seen.add(key);
      additions.push({ ...payload(e), import_key: `${prefix}:${e.id}` });
    }
    return rpc("cal_import_events", { p_events: additions });
  }
  $("import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file || !user || writeBusy) return;
    const requestEpoch = epoch;
    setBusy(true);
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error("Choose a backup under 8 MB.");
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data) && data.version != null && data.version !== 1)
        throw new Error("This backup version is not supported.");
      const added = await importEvents(
        Array.isArray(data) ? data : data.events,
        "backup",
      );
      if (requestEpoch === epoch) {
        await refreshCloud();
        message(
          `Imported ${added} event${added === 1 ? "" : "s"} as private copies. Existing events were kept.`,
        );
      }
    } catch (error) {
      if (requestEpoch === epoch)
        message(
          `Import not confirmed: ${error instanceof SyntaxError ? "Choose a valid JSON calendar backup." : explain(error)}`,
          true,
          true,
        );
    } finally {
      e.target.value = "";
      if (requestEpoch === epoch) setBusy(false);
    }
  });
  function legacyEvents() {
    try {
      for (const key of legacyKeys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const value = JSON.parse(raw),
            events = normalizeEvents(
              Array.isArray(value) ? value : value.events,
            );
          if (events.length) return events;
        } catch {
          /* Leave unrecognised browser data untouched. */
        }
      }
    } catch {
      /* Browser storage may be unavailable. */
    }
    return [];
  }
  function updateLegacyPrompt() {
    try {
      $("legacy-prompt").hidden =
        Boolean(localStorage.getItem("sajal.calendar.legacy-imported-by")) ||
        legacyEvents().length === 0;
    } catch {
      $("legacy-prompt").hidden = true;
    }
  }
  $("import-legacy").addEventListener("click", async () => {
    if (writeBusy || !user) return;
    const requestEpoch = epoch;
    setBusy(true);
    try {
      const added = await importEvents(legacyEvents(), "browser");
      if (requestEpoch === epoch) {
        try {
          localStorage.setItem("sajal.calendar.legacy-imported-by", user.id);
        } catch {
          /* Cloud import already succeeded. */
        }
        await refreshCloud();
        $("legacy-prompt").hidden = true;
        message(
          `Imported ${added} browser event${added === 1 ? "" : "s"} into your account. Original browser data was kept.`,
        );
      }
    } catch (error) {
      if (requestEpoch === epoch)
        message(`Import not confirmed: ${explain(error)}`, true, true);
    } finally {
      if (requestEpoch === epoch) setBusy(false);
    }
  });
  $("today-label").textContent = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  $("timezone-label").textContent =
    `Device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone || "local"} · Account sync`;
  // Foreground polling catches edits, deletions and removed sharing permissions.
  setInterval(() => {
    if (user && context?.family && !document.hidden && !writeBusy && !dragging)
      void refreshCloud();
  }, 15000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && user && !writeBusy) void refreshCloud();
  });
  window.addEventListener("focus", () => {
    if (user && !writeBusy) void refreshCloud();
  });
  // An email link may target a tab that is already open on this page.
  window.addEventListener("hashchange", () => {
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has("access_token") || params.has("error")) location.reload();
  });
  // Never make Supabase requests from inside its auth callback/session lock.
  sb.auth.onAuthStateChange((event, session) =>
    setTimeout(() => handleSession(session, event), 0),
  );
  sb.auth.getSession().then(({ data, error }) => {
    if (error) {
      emailLinkPending = false;
      status("auth-status", explain(error), true);
    } else handleSession(data.session);
  });
})();
