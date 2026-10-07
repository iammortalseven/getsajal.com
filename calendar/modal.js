import { CALENDARS } from '../config.js';
import { ymd, hm, addDays, TZ } from '../dates.js';

const $ = (id) => document.getElementById(id);
const dlg = $('dlg');
const form = $('form');
const errorEl = $('f-error');
const f = {
  id: $('f-id'), title: $('f-title'), allDay: $('f-allday'),
  sd: $('f-sd'), st: $('f-st'), ed: $('f-ed'), et: $('f-et'),
  cal: $('f-cal'), loc: $('f-loc'), notes: $('f-notes'), del: $('f-del'),
};
let handlers = {};

f.cal.innerHTML = CALENDARS.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');

const showError = (msg, field) => {
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
  if (field) field.focus();
};
const syncTimes = () => { f.st.disabled = f.et.disabled = f.allDay.checked; };

f.allDay.addEventListener('change', () => {
  if (!f.allDay.checked && !f.st.value) { f.st.value = '09:00'; f.et.value = '10:00'; }
  syncTimes();
});

// Close: button, Cancel, backdrop click (Esc is handled natively by <dialog>)
$('dlgClose').addEventListener('click', () => dlg.close());
$('f-cancel').addEventListener('click', () => dlg.close());
dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) dlg.close(); });
form.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit();
});

f.del.addEventListener('click', async () => {
  await handlers.onDelete(f.id.value);
  dlg.close();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = f.title.value.trim();
  if (!title) return showError('Add a title for this event.', f.title);
  if (!f.sd.value || !f.ed.value) return showError('Choose a start and end date.');

  const base = {
    id: f.id.value || crypto.randomUUID(),
    title,
    allDay: f.allDay.checked,
    calendarId: f.cal.value,
    location: f.loc.value.trim(),
    notes: f.notes.value.trim(),
  };

  let event;
  if (base.allDay) {
    if (f.ed.value < f.sd.value) return showError('The end date is before the start date.', f.ed);
    event = { ...base, start: f.sd.value, end: addDays(f.ed.value, 1) }; // end is exclusive
  } else {
    if (!f.st.value || !f.et.value) return showError('Set a start and end time, or choose All day.', f.st);
    const start = new Date(`${f.sd.value}T${f.st.value}`);
    const end = new Date(`${f.ed.value}T${f.et.value}`);
    if (end <= start) return showError('The end must be after the start.', f.et);
    event = { ...base, start: start.toISOString(), end: end.toISOString(), tz: TZ };
  }

  try {
    await handlers.onSave(event);
    dlg.close();
  } catch (err) {
    console.error(err);
    showError('Could not save this event. Try again.');
  }
});

export function openEventForm({ event, isNew, onSave, onDelete }) {
  handlers = { onSave, onDelete };
  form.reset();
  showError('');
  $('dlgTitle').textContent = isNew ? 'New event' : 'Edit event';

  f.id.value = isNew ? '' : event.id;
  f.title.value = event.title || '';
  f.allDay.checked = !!event.allDay;
  f.cal.value = event.calendarId;
  f.loc.value = event.location || '';
  f.notes.value = event.notes || '';

  if (event.allDay) {
    f.sd.value = event.start;
    f.ed.value = event.end ? addDays(event.end, -1) : event.start; // show inclusive end
    f.st.value = f.et.value = '';
  } else {
    const s = new Date(event.start);
    const e = event.end ? new Date(event.end) : s;
    f.sd.value = ymd(s); f.st.value = hm(s);
    f.ed.value = ymd(e); f.et.value = hm(e);
  }

  f.del.hidden = isNew;
  syncTimes();
  dlg.showModal();
  f.title.focus();
}
