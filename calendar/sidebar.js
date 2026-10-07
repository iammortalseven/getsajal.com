import { CALENDARS } from '../config.js';

const HIDDEN_KEY = 'calendar.hidden';

function loadHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); }
}

export function initSidebar({ onNavigate, onToggle }) {
  const hidden = loadHidden();
  const list = document.getElementById('calList');

  for (const cal of CALENDARS) {
    const label = document.createElement('label');
    label.className = 'cal-item';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !hidden.has(cal.id);
    box.style.accentColor = cal.color;
    box.addEventListener('change', () => {
      if (box.checked) hidden.delete(cal.id); else hidden.add(cal.id);
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
      onToggle();
    });
    label.append(box, cal.name);
    const li = document.createElement('li');
    li.append(label);
    list.append(li);
  }

  const mini = new FullCalendar.Calendar(document.getElementById('mini'), {
    initialView: 'dayGridMonth',
    headerToolbar: false,
    height: 'auto',
    dayHeaderFormat: { weekday: 'narrow' },
    dateClick: (info) => onNavigate(info.date),
    datesSet: (info) => { document.getElementById('miniTitle').textContent = info.view.title; },
  });
  mini.render();
  document.getElementById('miniPrev').addEventListener('click', () => mini.prev());
  document.getElementById('miniNext').addEventListener('click', () => mini.next());

  return {
    isVisible: (calendarId) => !hidden.has(calendarId),
    syncDate: (date) => mini.gotoDate(date),
  };
}
