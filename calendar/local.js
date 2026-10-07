// Storage adapter. Every store exposes the same async API, so a Supabase
// adapter can replace this file later without touching the UI code.
const KEY = 'calendar.events.v2';

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};
const write = (list) => localStorage.setItem(KEY, JSON.stringify(list));

export const localStore = {
  async list() {
    return read();
  },
  async upsert(event) {
    const list = read();
    const record = { ...event, updatedAt: new Date().toISOString() };
    const i = list.findIndex((e) => e.id === event.id);
    if (i >= 0) list[i] = record; else list.push(record);
    write(list);
    return record;
  },
  async remove(id) {
    write(read().filter((e) => e.id !== id));
  },
};
