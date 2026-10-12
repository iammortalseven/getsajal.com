/* My Calendar: static GitHub Pages app. No credentials or backend required. */
(() => {
  'use strict';
  const STORAGE_KEY = 'sajal.calendar.events.v1';
  const LEGACY_KEYS = ['calendarEvents', 'myCalendarEvents', 'fullcalendar-events', 'events'];
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
  const currentEvents = () => calendar.getEvents().map(plainEvent);
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
    $('form-error').hidden = true;
    $('dialog-title').textContent = event ? 'Edit event' : 'New event';
    $('delete-event').hidden = !event;
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
    updateAllDay(); dialog.showModal(); $('event-title').focus();
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
      calendar.batchRendering(() => { calendar.removeAllEvents(); calendar.addEventSource(events); });
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
    events: initialEvents,
    select: info => openForm(null, info),
    eventClick: info => { info.jsEvent.preventDefault(); openForm(info.event); },
    eventDrop: saveMovedEvent, eventResize: saveMovedEvent,
    eventDidMount: info => {
      info.el.title = [info.event.title, info.event.extendedProps.location, info.event.extendedProps.notes].filter(Boolean).join('\n');
      info.el.tabIndex = 0;
      info.el.setAttribute('aria-label', `Edit ${info.event.title}`);
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
    calendar.batchRendering(() => { calendar.removeAllEvents(); calendar.addEventSource(events); }); renderUpcoming();
  });
})();
