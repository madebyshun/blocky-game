// Vercel serverless function: Blocky Street (src/stocks.js), Coinbase's tokenized stocks on Base.
//   GET /api/stocks -> { stocks: [{ symbol, ticker, name, address, nav, multiplier, decimals, paused }],
//                        week: { usd24, n24, usd7, n7, closedShare, hours, tickers: { T: { n24, usd24, n7, usd7 } } },
//                        weekend: Blue Agent's weekend scorecard ({ call: { rows: [{ ticker, move, call }] } } or null),
//                        nyse: { open, why, time }, at, errors }
//   GET /api/stocks?wallet=0x…|name.base.eth -> { address, name, holdings: [{ ticker, name, address, units, shares, usd }] }
// Cached 5 minutes by the CDN (30 s while the week is still filling in or something failed).
import { stockList, readStockHours, readHoldings } from './_stocks.js';
import { addressOf, namesFor, cleanName } from './_names.js';
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

// Blue Agent's weekend scorecard (free, public): over the weekend, how far each stock's Base DEX price has
// moved from Friday's frozen Chainlink close, and Blue's call for Monday's open (UP / DOWN / FLAT)
export const BLUE_WEEKEND = 'https://blueagent.dev/api/x402/weekend-scorecard?weekends=1';
export async function readWeekend(fetchImpl = fetch) {
  try {
    const r = await fetchImpl(BLUE_WEEKEND, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = await r.json();
    const call = j.live || j.pending; // live: Saturday to the open (provisional); pending: Blue's Sunday call, waiting for the open
    const last = j.weekends?.[0];
    return {
      call: call ? { friday: call.friday, provisional: !!j.live, rows: (call.rows || []).map((x) => ({ ticker: x.ticker, move: x.weekend_move_pct, call: x.call, dex: x.dex_usd, close: x.close_usd })) } : null,
      graded: j.summary ? { calls: j.summary.calls, hits: j.summary.hits, ready: j.summary.ready, hitRate: j.summary.hit_rate } : null,
      lastFriday: last?.friday ?? null,
      page: j.page || 'https://blueagent.dev/markets/weekend',
    };
  } catch { return null; }
}

let last = null;
export default async function handler(req, res) {
  // ?wallet=0x…|name.base.eth: that wallet's Coinbase stocks (Blocky Street's "your stocks, block by block")
  let who = String(req.query?.wallet ?? new URL(req.url, 'http://x').searchParams.get('wallet') ?? '').trim().toLowerCase();
  if (who) {
    try {
      if (!who.startsWith('0x') && !who.includes('.')) who = `${who}.base.eth`;
      let address = /^0x[0-9a-f]{40}$/.test(who) ? who : null, name = null;
      if (!address) {
        name = cleanName(who);
        if (!name) return res.status(400).json({ error: 'Paste a 0x address or a name.base.eth' });
        address = await addressOf(name);
        if (!address) return res.status(404).json({ error: `${name} doesn't point to a wallet on Base` });
      } else {
        try { name = (await namesFor([address]))[address] || null; } catch { /* no name */ }
      }
      const holdings = await readHoldings(address.toLowerCase(), await stockList());
      res.setHeader('cache-control', 'public, s-maxage=60');
      return res.status(200).json({ address: address.toLowerCase(), name, holdings });
    } catch (e) {
      res.setHeader('cache-control', 'no-store');
      return res.status(502).json({ error: String(e.message || e) });
    }
  }
  const filling = () => last && (last.errors.length || !last.week || last.week.hours < 168);
  try {
    if (!last || Date.now() - last.at > (filling() ? 25000 : 240000)) {
      const errors = [];
      const list = await stockList();
      const [week, weekend] = await Promise.all([readStockHours(store, list).catch((e) => { errors.push(String(e.message || e).slice(0, 200)); return null; }), readWeekend()]);
      if (week?.errors?.length) errors.push(...week.errors);
      last = {
        stocks: list.map(({ symbol, ticker, name, address, nav, navAt, multiplier, decimals, paused }) => ({ symbol, ticker, name, address, nav, navAt, multiplier, decimals, paused })),
        week, weekend, errors, at: Date.now(),
      };
    }
    res.setHeader('cache-control', filling() ? 'public, s-maxage=30' : 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ ...last, nyse: nyseHours() });
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: String(e.message || e) });
  }
}
