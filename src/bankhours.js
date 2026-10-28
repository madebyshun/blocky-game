// US bank hours, for Base Live and api/_baselive.js (the USDC that moves while banks are shut)
// Mon-Fri 9:00-17:00 New York time, not on federal holidays
// "The Always-On Dollar" (Coinbase x The Block, 2026): most stablecoin volume moves when banks are closed
const HOLIDAYS = new Set(['2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-10-11', '2027-11-11', '2027-11-25', '2027-12-24']);
const NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function bankHours(at = Date.now()) {
  const p = Object.fromEntries(NY.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  const day = `${p.year}-${p.month}-${p.day}`, h = Number(p.hour) + Number(p.minute) / 60;
  const why = p.weekday === 'Sat' || p.weekday === 'Sun' ? 'weekend' : HOLIDAYS.has(day) ? 'holiday' : h < 9 || h >= 17 ? 'after hours' : null;
  return { open: !why, why, time: `${p.hour}:${p.minute} ET` };
}
