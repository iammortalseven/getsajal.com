// All-day events: plain 'YYYY-MM-DD' strings, end date exclusive (same as FullCalendar).
// Timed events: ISO instants (UTC) plus the timezone they were created in.
const pad = (n) => String(n).padStart(2, '0');

export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const addDays = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
};
