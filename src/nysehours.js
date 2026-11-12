// NYSE hours, for Blocky Street (src/stocks.js) and api/_stocks.js: Coinbase's tokenized stocks trade
// on Base around the clock, Wall Street doesn't. Mon-Fri 9:30-16:00 New York time, not on NYSE
// holidays, 13:00 on its early-close days. (NYSE's holidays aren't the banks': Good Friday is closed,
// Columbus and Veterans Day are open.)
const HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);
const EARLY = new Set(['2026-11-27', '2026-12-24', '2027-11-26']); // closes at 13:00
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

// { open, why: null | 'weekend' | 'holiday' | 'pre-market' | 'after hours', time }
export function nyseHours(at = Date.now()) {
  const p = Object.fromEntries(NY.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const day = `${p.year}-${p.month}-${p.day}`, h = Number(p.hour) + Number(p.minute) / 60;
  const close = EARLY.has(day) ? 13 : 16;
  const why = p.weekday === 'Sat' || p.weekday === 'Sun' ? 'weekend' : HOLIDAYS.has(day) ? 'holiday' : h < 9.5 ? 'pre-market' : h >= close ? 'after hours' : null;
  return { open: !why, why, time: `${p.hour}:${p.minute} ET` };
}
