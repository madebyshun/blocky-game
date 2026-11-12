// Vercel serverless function: Blocky Street (src/stocks.js), Coinbase's tokenized stocks on Base.
//   GET /api/stocks -> { stocks: [{ symbol, ticker, name, address, nav, multiplier, decimals, paused }],
//                        week: { usd24, n24, usd7, n7, closedShare, hours, tickers: { T: { n24, usd24, n7, usd7 } } },
//                        nyse: { open, why, time }, at, errors }
// Cached 5 minutes by the CDN (30 s while the week is still filling in or something failed).
import { stockList, readStockHours } from './_stocks.js';
import { nyseHours } from '../src/nysehours.js';
import { useKv, kv, KEY_BASE } from './_store.js';

const KEY = `${KEY_BASE}:stocks:hours:v1`;
const memory = new Map();
const store = {
  async get(hours) {
    if (!useKv()) return Object.fromEntries(hours.filter((h) => memory.has(h)).map((h) => [h, memory.get(h)]));
    const vals = await kv('HMGET', KEY, ...hours.map(String));
    return Object.fromEntries(hours.map((h, i) => [h, vals?.[i] ? JSON.parse(vals[i]) : null]).filter(([, v]) => v));
  },
  async set(h, v) { if (useKv()) await kv('HSET', KEY, String(h), JSON.stringify(v)); else memory.set(h, v); },
};

let last = null;
export default async function handler(req, res) {
  const filling = () => last && (last.errors.length || !last.week || last.week.hours < 168);
  try {
    if (!last || Date.now() - last.at > (filling() ? 25000 : 240000)) {
      const errors = [];
      const list = await stockList();
      const week = await readStockHours(store, list).catch((e) => { errors.push(String(e.message || e).slice(0, 200)); return null; });
      if (week?.errors?.length) errors.push(...week.errors);
      last = {
        stocks: list.map(({ symbol, ticker, name, address, nav, navAt, multiplier, decimals, paused }) => ({ symbol, ticker, name, address, nav, navAt, multiplier, decimals, paused })),
        week, errors, at: Date.now(),
      };
    }
    res.setHeader('cache-control', filling() ? 'public, s-maxage=30' : 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ ...last, nyse: nyseHours() });
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: String(e.message || e) });
  }
}
