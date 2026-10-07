import { CALENDARS, DEFAULT_CAL } from './config.js';
import { ymd, addDays, TZ } from './dates.js';
import { localStore as store } from './store/local.js'; // swap this line for the Supabase store later
import { openEventForm } from './ui/modal.js';
import { initSidebar } from './ui/sidebar.js';
import { toast } from './ui/toast.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const mobile = matchMedia('(max-width: 800px)');
const calById = (id) => CALENDARS.find((c) => c.id === id) || CALENDARS[0];

let events = [];

// ---------- Model <-> FullCalendar ----------
const toFc = (e) => {
  const color = calById(e.calendarId).color;
  return {
    id: e.id, title: e.title, start: e.start, end: e.end || undefined, allDay: e.allDay,
    backgroundColor: color, borderColor: color,
    extendedProps: { location: e.location, notes: e.notes, calendarId: e.calendarId },
  };
};

const fromFc = (ev) => {
  const x = ev.extendedProps;
  const base = {
    id: ev.id, title: ev.title, allDay: ev.allDay,
    location: x.location || '', notes: x.notes || '', calendarId: x.calendarId,
  };
  if (ev.allDay) {
    const start = ymd(ev.start);
    return { ...base, start, end: ev.end ? ymd(ev.end) : addDays(start, 1) };
  }
  return { ...base, start: ev.start.toISOString(), end: ev.end ? ev.end.toISOString() : null, tz: TZ };
};

// ---------- Data ----------
async function load() {
  try {
    events = await store.list();
  } catch (err) {
    console.error(err);
    toast('Could not load events.');
  }
  calendar.refetchEvents();
}

async function save(event) {
  await store.upsert(event);
  await load();
}

async function remove(id) {
  const previous = events.find((e) => e.id === id);
  if (!previous) return;
  await store.remove(id);
  await load();
  toast('Event deleted', { onAction: () => save(previous) });
}

const formHandlers = { onSave: save, onDelete: remove };

async function persistChange(info) {
  try {
    await store.upsert(fromFc(info.event));
    await load();
  } catch (err) {
    console.error(err);
    info.revert();
    toast('Could not save that change.');
  }
}

// ---------- Creating events ----------
function openNew(start, end, allDay) {
  const event = { title: '', calendarId: DEFAULT_CAL, location: '', notes: '', allDay };
  if (allDay) {
    event.start = ymd(start);
    event.end = end ? ymd(end) : addDays(event.start, 1);
  } else {
    event.start = start.toISOString();
    event.end = (end || new Date(start.getTime() + 3600000)).toISOString();
  }
  openEventForm({ event, isNew: true, ...formHandlers });
}

function openNewNextHour() {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);
  openNew(start, new Date(start.getTime() + 3600000), false);
}

// ---------- Calendar ----------
const sidebar = initSidebar({
  onNavigate: (date) => { calendar.gotoDate(date); app.classList.remove('open'); },
  onToggle: () => calendar.refetchEvents(),
});

const calendar = new FullCalendar.Calendar($('calendar'), {
  initialView: localStorage.getItem('calendar.view') || 'dayGridMonth',
  headerToolbar: false, // we use our own toolbar
  height: '100%',
  nowIndicator: true,
  selectable: true,
  selectMirror: true,
  editable: true,
  dayMaxEvents: true,
  navLinks: true,
  scrollTime: '07:00:00',
  eventTimeFormat: { hour: 'numeric', minute: '2-digit', meridiem: 'short' },

  events: (_info, success) =>
    success(events.filter((e) => sidebar.isVisible(e.calendarId)).map(toFc)),

  datesSet: (info) => {
    $('title').textContent = info.view.title;
    localStorage.setItem('calendar.view', info.view.type);
    document.querySelectorAll('[data-view]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.view === info.view.type)));
    sidebar.syncDate(calendar.getDate());
  },

  // `select` covers both clicking a day and dragging across several
  select: (info) => {
    calendar.unselect();
    openNew(info.start, info.end, info.allDay);
  },

  eventClick: (info) => {
    info.jsEvent.preventDefault();
    const event = events.find((e) => e.id === info.event.id);
    if (event) openEventForm({ event, isNew: false, ...formHandlers });
  },

  eventDidMount: (info) => {
    const { location } = info.event.extendedProps;
    info.el.title = [info.event.title, location].filter(Boolean).join(' · ');
  },

  eventDrop: persistChange,
  eventResize: persistChange,
});

calendar.render();
load();

// ---------- Toolbar ----------
$('todayBtn').addEventListener('click', () => calendar.today());
$('prevBtn').addEventListener('click', () => calendar.prev());
$('nextBtn').addEventListener('click', () => calendar.next());
$('newBtn').addEventListener('click', openNewNextHour);
document.querySelectorAll('[data-view]').forEach((b) =>
  b.addEventListener('click', () => calendar.changeView(b.dataset.view)));

$('menuBtn').addEventListener('click', () => app.classList.toggle(mobile.matches ? 'open' : 'collapsed'));

$('themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
});

// ---------- Keyboard shortcuts ----------
const shortcuts = {
  c: openNewNextHour,
  t: () => calendar.today(),
  j: () => calendar.next(), k: () => calendar.prev(),
  m: () => calendar.changeView('dayGridMonth'),
  w: () => calendar.changeView('timeGridWeek'),
  d: () => calendar.changeView('timeGridDay'),
  a: () => calendar.changeView('listMonth'),
};
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || $('dlg').open) return;
  if (e.target.closest('input, textarea, select')) return;
  const action = shortcuts[e.key.toLowerCase()];
  if (action) { e.preventDefault(); action(); }
});
