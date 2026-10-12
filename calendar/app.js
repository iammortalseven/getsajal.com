/* My Calendar: static GitHub Pages app. No credentials or backend required. */
(() => {
  'use strict';
  const STORAGE_KEY = 'sajal.calendar.events.v1';
  const LEGACY_KEYS = ['calendarEvents', 'myCalendarEvents', 'fullcalendar-events', 'events'];
  const HOLIDAY_SOURCE_ID = 'nsw-public-holidays';
  const HOLIDAY_SOURCE_URL = 'https://www.nsw.gov.au/about-nsw/public-holidays';
  // Standard NSW holiday rules, checked 12 October 2026, generate each year
  // as it is viewed. Only confirmed one-off declarations belong in this table.
  // The August Bank Holiday is not a statewide public holiday.
  const FIRST_HOLIDAY_YEAR = 2026;
  const DECLARED_EXTRA_HOLIDAYS = [
    ['2026-04-27', 'Anzac Day (additional holiday)'],
    ['2027-04-26', 'Anzac Day (additional holiday)']
  ];
  const $ = id => document.getElementById(id);
  const dialog = $('event-dialog');
  const form = $('event-form');
  const colors = ['#28634c', '#3b6b9c', '#9b5f2d', '#855593', '#b44b60'];
  let calendar, editingId = null, noticeTimer, corruptData = null;
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pad = n => String(n).padStart(2, '0');
  const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const addDays = (value, amount) => {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + amount);
    return localDate(date);
  };
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(new Date(`${value}T12:00:00`)) === value;
  function message(text, error = false, persistent = false) {
    clearTimeout(noticeTimer);
    $('notice').textContent = text;
    $('notice').classList.toggle('error', error);
    $('notice').hidden = false;
    if (!persistent) noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 6500);
  }
  function normalizeEvents(input) {
    if (!Array.isArray(input) || input.length > 10000) throw new Error('The backup must contain an events array, with no more than 10,000 events.');
    const ids = new Set();
    return input.map((item, index) => {
      if (!item || typeof item !== 'object' || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200) throw new Error(`Event ${index + 1} has an invalid title.`);
      const allDay = item.allDay === true || (item.allDay == null && validDate(item.start));
      let start = item.start, end = item.end;
      if (allDay) {
        if (!validDate(start)) throw new Error(`Event ${index + 1} has an invalid start date.`);
        end = end || addDays(start, 1);
        if (!validDate(end) || end <= start) throw new Error(`Event ${index + 1} has an invalid end date.`);
      } else {
        const isoLike = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && Number.isFinite(new Date(value).getTime());
        if (!isoLike(start)) throw new Error(`Event ${index + 1} has an invalid start time.`);
        start = new Date(start).toISOString();
        end = end || new Date(new Date(start).getTime() + 3600000).toISOString();
        if (!isoLike(end) || new Date(end) <= new Date(start)) throw new Error(`Event ${index + 1} must end after it starts.`);
        end = new Date(end).toISOString();
      }
      const props = item.extendedProps || {};
      const location = props.location ?? item.location ?? '';
      const notes = props.notes ?? item.notes ?? props.description ?? '';
      if (typeof location !== 'string' || location.length > 300 || typeof notes !== 'string' || notes.length > 4000) throw new Error(`Event ${index + 1} has invalid location or notes.`);
      let id = String(item.id || uid());
      if (ids.has(id)) id = uid();
      ids.add(id);
      const rawColor = item.backgroundColor || item.color;
      const color = typeof rawColor === 'string' && /^#[0-9a-f]{6}$/i.test(rawColor) ? rawColor : colors[0];
      return { id, title: item.title.trim(), start, end, allDay, backgroundColor: color, borderColor: color, extendedProps: { location, notes } };
    });
  }
  function storedEvents() {
    corruptData = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        try { return normalizeEvents(JSON.parse(raw)); }
        catch (error) {
          corruptData = raw;
          message('Your stored events could not be read. Export the recovery backup first, then import a valid backup to restore editing. Nothing has been overwritten.', true, true);
          return [];
        }
      }
      for (const key of LEGACY_KEYS) {
        const old = localStorage.getItem(key);
        if (!old) continue;
        try {
          const data = JSON.parse(old);
          const events = normalizeEvents(Array.isArray(data) ? data : data.events);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
          message(`Recovered ${events.length} event${events.length === 1 ? '' : 's'} from the previous calendar. Export a backup to keep a copy.`, false, true);
          return events;
        } catch { /* Leave unrecognised legacy data untouched. */ }
      }
    } catch {
      message('Browser storage is unavailable. Changes cannot be saved here. Try a normal browser window with site storage enabled.', true, true);
    }
    return [];
  }
  function plainEvent(event) {
    return {
      id: event.id, title: event.title,
      start: event.allDay ? localDate(event.start) : event.start.toISOString(),
      end: event.end ? (event.allDay ? localDate(event.end) : event.end.toISOString()) : undefined,
      allDay: event.allDay, backgroundColor: event.backgroundColor || colors[0],
      borderColor: event.backgroundColor || colors[0],
      extendedProps: { location: event.extendedProps.location || '', notes: event.extendedProps.notes || '' }
    };
  }
  const isPublicHoliday = event => event?.source?.id === HOLIDAY_SOURCE_ID;
  // Holidays are supplied by the app, not mixed into personal storage/backups.
  const currentEvents = () => calendar.getEvents().filter(event => !isPublicHoliday(event)).map(plainEvent);
  function replacePersonalEvents(events) {
    calendar.batchRendering(() => {
      calendar.getEvents().filter(event => !isPublicHoliday(event)).forEach(event => event.remove());
      events.forEach(event => calendar.addEvent(event));
    });
  }
  // UTC arithmetic keeps date-only holiday calculations independent of DST.
  const holidayDate = (year, month, day) => new Date(Date.UTC(year, month - 1, day, 12));
  const holidayDateString = date => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  function shiftedHolidayDate(date, days) {
    const shifted = new Date(date);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted;
  }
  function nthMonday(year, month, occurrence) {
    const first = holidayDate(year, month, 1);
    return holidayDate(year, month, 1 + (8 - first.getUTCDay()) % 7 + 7 * (occurrence - 1));
  }
  function easterSunday(year) {
    // Oudin's Gregorian computus, documented by the US Naval Observatory:
    // https://aa.usno.navy.mil/faq/easter
    const floor = Math.floor;
    const century = floor(year / 100);
    const cycle = year % 19;
    const correction = floor((century - 17) / 25);
    let epact = (century - floor(century / 4) - floor((century - correction) / 3) + 19 * cycle + 15) % 30;
    epact -= floor(epact / 28) * (1 - floor(epact / 28) * floor(29 / (epact + 1)) * floor((21 - cycle) / 11));
    const weekday = (year + floor(year / 4) + epact + 2 - century + floor(century / 4)) % 7;
    const difference = epact - weekday;
    const month = 3 + floor((difference + 40) / 44);
    const day = difference + 28 - 31 * floor(month / 4);
    return holidayDate(year, month, day);
  }
  function holidaysForYear(year) {
    if (!Number.isInteger(year) || year < FIRST_HOLIDAY_YEAR) return [];
    const holidays = [];
    const add = (date, title) => holidays.push([holidayDateString(date), title]);
    const newYear = holidayDate(year, 1, 1);
    add(newYear, "New Year's Day");
    if ([0, 6].includes(newYear.getUTCDay())) {
      add(shiftedHolidayDate(newYear, newYear.getUTCDay() === 6 ? 2 : 1), "New Year's Day (additional holiday)");
    }
    const australiaDay = holidayDate(year, 1, 26);
    // Australia Day moves to Monday when the 26th is on a weekend.
    add(shiftedHolidayDate(australiaDay, australiaDay.getUTCDay() === 6 ? 2 : australiaDay.getUTCDay() === 0 ? 1 : 0), 'Australia Day');
    const easter = easterSunday(year);
    add(shiftedHolidayDate(easter, -2), 'Good Friday');
    add(shiftedHolidayDate(easter, -1), 'Easter Saturday');
    add(easter, 'Easter Sunday');
    add(shiftedHolidayDate(easter, 1), 'Easter Monday');
    add(holidayDate(year, 4, 25), 'Anzac Day');
    add(nthMonday(year, 6, 2), "King's Birthday");
    add(nthMonday(year, 10, 1), 'Labour Day');
    const christmas = holidayDate(year, 12, 25);
    const boxingDay = holidayDate(year, 12, 26);
    add(christmas, 'Christmas Day');
    add(boxingDay, 'Boxing Day');
    // Allocate additional Christmas/Boxing weekdays without colliding with
    // the actual 25th/26th or an already allocated additional holiday.
    const occupied = new Set([holidayDateString(christmas), holidayDateString(boxingDay)]);
    for (const [date, title] of [[christmas, 'Christmas Day'], [boxingDay, 'Boxing Day']]) {
      if (![0, 6].includes(date.getUTCDay())) continue;
      let observed = shiftedHolidayDate(date, date.getUTCDay() === 6 ? 2 : 1);
      while ([0, 6].includes(observed.getUTCDay()) || occupied.has(holidayDateString(observed))) {
        observed = shiftedHolidayDate(observed, 1);
      }
      add(observed, `${title} (additional holiday)`);
      occupied.add(holidayDateString(observed));
    }
    holidays.push(...DECLARED_EXTRA_HOLIDAYS.filter(([date]) => date.startsWith(`${year}-`)));
    return holidays.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  }
  function publicHolidayEvents(fetchInfo) {
    const currentYear = new Date().getFullYear();
    // Also keep this and next year's holidays available for Coming up.
    const years = new Set([currentYear, currentYear + 1]);
    for (let year = fetchInfo.start.getFullYear(); year <= new Date(fetchInfo.end.getTime() - 1).getFullYear(); year++) {
      years.add(year);
    }
    return [...years].flatMap(holidaysForYear).map(([date, title]) => ({
      // Easter and Anzac Day can share a date; names keep their IDs distinct.
      id: `nsw-public-holiday-${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      title, start: date, end: addDays(date, 1), allDay: true,
      editable: false, startEditable: false, durationEditable: false,
      backgroundColor: colors[2], borderColor: colors[2],
      extendedProps: {
        location: 'New South Wales',
        notes: `Statewide NSW public holiday.\nCalculated from current NSW rules, checked 12 October 2026.\nSource: ${HOLIDAY_SOURCE_URL}\nFuture law changes and new one-off declarations require an update.\nThis reference entry cannot be edited or moved.`
      }
    }));
  }
  function writeEvents(events, restoring = false) {
    if (corruptData !== null && !restoring) throw new Error('Export your recovery backup, then import a valid backup before editing.');
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(events)); }
    catch { throw new Error('The event was not saved: browser storage is blocked or full. Export a backup and check your browser settings.'); }
    corruptData = null;
  }
  function renderUpcoming() {
    const now = new Date();
    const today = localDate(now);
    const all = calendar.getEvents();
    $('event-count').textContent = all.length;
    const upcoming = all.filter(event => event.allDay ? localDate(event.end || event.start) > today : (event.end || event.start) > now).sort((a, b) => a.start - b.start).slice(0, 5);
    $('upcoming').replaceChildren();
    if (!upcoming.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-upcoming';
      const strong = document.createElement('strong'); strong.textContent = 'A little breathing room.';
      empty.append(strong, 'Your next plans will appear here.'); $('upcoming').append(empty);
    }
    for (const event of upcoming) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'upcoming-item';
      const marker = document.createElement('span'); marker.className = 'upcoming-marker'; marker.style.backgroundColor = event.backgroundColor; marker.setAttribute('aria-hidden', 'true');
      const detail = document.createElement('span');
      const title = document.createElement('span'); title.className = 'upcoming-title'; title.textContent = event.title;
      const when = document.createElement('span'); when.className = 'upcoming-time';
      when.textContent = event.start.toLocaleDateString('en-AU', { weekday: 'short', month: 'short', day: 'numeric' }) + (event.allDay ? ' · All day' : ` · ${event.start.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`);
      detail.append(title, when); button.append(marker, detail);
      button.addEventListener('click', () => { calendar.gotoDate(event.start); openForm(event); }); $('upcoming').append(button);
    }
  }
  function updateAllDay() {
    const allDay = $('all-day').checked;
    for (const id of ['start-time', 'end-time']) { $(id).hidden = allDay; $(id).disabled = allDay; $(id).required = !allDay; }
    document.querySelectorAll('.time-label').forEach(label => { label.hidden = allDay; });
    $('date-help').textContent = allDay ? 'End date is the last day of the event, including that day.' : 'Times use your device’s timezone.';
  }
  function openForm(event = null, selection = null) {
    if (corruptData !== null) { message('Export your recovery backup, then import a valid backup before editing.', true, true); return; }
    form.reset(); editingId = event?.id || null;
    const readOnly = isPublicHoliday(event);
    form.querySelectorAll('input, textarea, select').forEach(field => { field.disabled = false; });
    form.querySelector('button[type="submit"]').hidden = readOnly;
    $('cancel-dialog').textContent = readOnly ? 'Close' : 'Cancel';
    $('form-error').hidden = true;
    $('dialog-title').textContent = readOnly ? 'NSW public holiday' : event ? 'Edit event' : 'New event';
    $('delete-event').hidden = !event || readOnly;
    const start = event?.start ? new Date(event.start) : selection?.start ? new Date(selection.start) : new Date();
    const allDay = event ? event.allDay : selection ? selection.allDay : false;
    if (!event && (!selection || selection.allDay)) start.setHours(9, 0, 0, 0);
    const end = event?.end ? new Date(event.end) : selection?.end ? new Date(selection.end) : new Date(start.getTime() + 3600000);
    if (allDay) {
      const endExclusive = event?.end || selection?.end;
      $('end-date').value = endExclusive ? addDays(localDate(new Date(endExclusive)), -1) : localDate(start);
    } else { $('end-date').value = localDate(end); }
    $('start-date').value = localDate(start); $('start-time').value = localTime(start); $('end-time').value = localTime(end);
    $('all-day').checked = allDay;
    $('event-title').value = event?.title || '';
    $('event-location').value = event?.extendedProps.location || '';
    $('event-notes').value = event?.extendedProps.notes || '';
    const color = event?.backgroundColor || colors[0];
    const previousCustom = $('event-color').querySelector('[data-custom]'); previousCustom?.remove();
    if (!colors.includes(color)) { const option = document.createElement('option'); option.value = color; option.textContent = 'Original colour'; option.dataset.custom = 'true'; $('event-color').append(option); }
    $('event-color').value = color;
    updateAllDay();
    if (readOnly) form.querySelectorAll('input, textarea, select').forEach(field => { field.disabled = true; });
    dialog.showModal();
    (readOnly ? $('cancel-dialog') : $('event-title')).focus();
    calendar.unselect();
  }
  function closeForm() { dialog.close(); editingId = null; }
  function fieldDate(dateId, timeId) {
    const value = `${$(dateId).value}T${$(timeId).value}`;
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || localDate(parsed) !== $(dateId).value || localTime(parsed) !== $(timeId).value) throw new Error('That time is not available in your timezone. Choose another time.');
    return parsed;
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (editingId && isPublicHoliday(calendar.getEventById(editingId))) return;
    try {
      const title = $('event-title').value.trim();
      if (!title) throw new Error('Please give your event a title.');
      const allDay = $('all-day').checked;
      const start = allDay ? $('start-date').value : fieldDate('start-date', 'start-time').toISOString();
      const end = allDay ? addDays($('end-date').value, 1) : fieldDate('end-date', 'end-time').toISOString();
      if (allDay ? $('end-date').value < start : new Date(end) <= new Date(start)) throw new Error('The end must be after the start. For an all-day event, the dates can be the same.');
      const id = editingId || uid(); const color = $('event-color').value;
      const result = normalizeEvents([{ id, title, start, end, allDay, color, extendedProps: { location: $('event-location').value.trim(), notes: $('event-notes').value.trim() } }])[0];
      const events = currentEvents().filter(item => item.id !== id); events.push(result);
      if (events.length > 10000) throw new Error('This calendar has reached its 10,000-event limit. Export a backup and remove old events first.');
      writeEvents(events);
      const wasEdit = Boolean(editingId);
      calendar.batchRendering(() => { calendar.getEventById(id)?.remove(); calendar.addEvent(result); });
      closeForm(); renderUpcoming(); message(wasEdit ? 'Event updated and saved.' : 'Event added and saved.');
    } catch (error) { $('form-error').textContent = error.message; $('form-error').hidden = false; }
  });
  $('all-day').addEventListener('change', updateAllDay);
  $('close-dialog').addEventListener('click', closeForm);
  $('cancel-dialog').addEventListener('click', closeForm);
  dialog.addEventListener('close', () => { editingId = null; });
  $('delete-event').addEventListener('click', () => { $('confirm-dialog').returnValue = ''; $('confirm-dialog').showModal(); });
  $('confirm-dialog').addEventListener('close', () => {
    if ($('confirm-dialog').returnValue !== 'delete' || !editingId) return;
    if (isPublicHoliday(calendar.getEventById(editingId))) return;
    try {
      writeEvents(currentEvents().filter(item => item.id !== editingId));
      calendar.getEventById(editingId)?.remove(); closeForm(); renderUpcoming(); message('Event deleted and saved.');
    } catch (error) { $('form-error').textContent = error.message; $('form-error').hidden = false; }
  });
  function download(content, filename) {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $('export').addEventListener('click', () => {
    if (!calendar) return;
    if (corruptData !== null) { download(corruptData, `sajal-calendar-recovery-${localDate(new Date())}.json`); return; }
    download(JSON.stringify({ format: 'sajal-calendar-backup', version: 1, exportedAt: new Date().toISOString(), events: currentEvents() }, null, 2), `sajal-calendar-${localDate(new Date())}.json`);
    message('Backup downloaded. Keep it somewhere safe.');
  });
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file || !calendar) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('This file is too large. Choose a calendar JSON backup under 8 MB.');
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data) && data.version != null && data.version !== 1) throw new Error('This backup version is not supported.');
      const imported = normalizeEvents(Array.isArray(data) ? data : data.events);
      const existing = currentEvents(); const byId = new Map(existing.map(item => [item.id, item]));
      const duplicates = new Set(existing.map(item => JSON.stringify([item.title, item.start, item.end, item.allDay, item.extendedProps])));
      let added = 0;
      for (const item of imported) {
        const fingerprint = JSON.stringify([item.title, item.start, item.end, item.allDay, item.extendedProps]);
        if (duplicates.has(fingerprint)) continue;
        if (byId.has(item.id)) item.id = uid();
        byId.set(item.id, item); duplicates.add(fingerprint); added++;
      }
      const events = [...byId.values()];
      if (events.length > 10000) throw new Error('Import would exceed the 10,000-event limit.');
      if (corruptData !== null) download(corruptData, `sajal-calendar-recovery-${localDate(new Date())}.json`);
      writeEvents(events, true);
      replacePersonalEvents(events);
      renderUpcoming(); message(`Imported ${added} event${added === 1 ? '' : 's'}. Existing events were kept.`);
    } catch (error) { message(`Import failed. ${error instanceof SyntaxError ? 'Choose a valid JSON calendar backup.' : error.message} Your calendar was not changed.`, true, true); }
    finally { event.target.value = ''; }
  });
  $('today-label').textContent = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  $('timezone-label').textContent = `Device timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'} · Browser storage`;
  if (!window.FullCalendar) {
    message('The calendar could not load. Check that calendar/vendor/fullcalendar-6.1.18.min.js was uploaded, then refresh the page.', true, true);
    document.querySelectorAll('.new-event, #export, #import').forEach(button => { button.disabled = true; }); return;
  }
  const initialEvents = storedEvents();
  function saveMovedEvent(info) {
    try { writeEvents(currentEvents()); renderUpcoming(); message('Event moved and saved.'); }
    catch (error) { info.revert(); message(error.message, true, true); }
  }
  calendar = new FullCalendar.Calendar($('calendar'), {
    initialView: 'dayGridMonth', firstDay: 1, timeZone: 'local', locale: 'en-gb',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
    buttonText: { today: 'Today', month: 'Month', week: 'Week', day: 'Day', list: 'Agenda' },
    height: 'auto', selectable: true, selectMirror: true, editable: true,
    eventStartEditable: true, eventDurationEditable: true, eventResizableFromStart: true,
    nowIndicator: true, dayMaxEvents: 3, fixedWeekCount: false,
    displayEventEnd: true, scrollTime: '08:00:00', slotDuration: '00:30:00',
    eventTimeFormat: { hour: 'numeric', minute: '2-digit', meridiem: 'short' },
    slotLabelFormat: { hour: 'numeric', minute: '2-digit', meridiem: 'short' },
    eventSources: [
      { events: initialEvents },
      { id: HOLIDAY_SOURCE_ID, events: (info, success) => success(publicHolidayEvents(info)), editable: false }
    ],
    eventsSet: () => { if (calendar) renderUpcoming(); },
    select: info => openForm(null, info),
    eventClick: info => { info.jsEvent.preventDefault(); openForm(info.event); },
    eventDrop: saveMovedEvent, eventResize: saveMovedEvent,
    eventDidMount: info => {
      info.el.title = [info.event.title, info.event.extendedProps.location, info.event.extendedProps.notes].filter(Boolean).join('\n');
      info.el.tabIndex = 0;
      info.el.setAttribute('aria-label', `${isPublicHoliday(info.event) ? 'View' : 'Edit'} ${info.event.title}`);
      info.el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openForm(info.event); } });
    }
  });
  calendar.render(); renderUpcoming();
  document.querySelectorAll('.new-event').forEach(button => button.addEventListener('click', () => openForm()));
  // Keep separate tabs on this origin in sync without overwriting an open form.
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    if (dialog.open) { closeForm(); message('The calendar changed in another tab. The event form was closed to avoid overwriting those changes.', false, true); }
    const events = storedEvents();
    replacePersonalEvents(events); renderUpcoming();
  });
})();
