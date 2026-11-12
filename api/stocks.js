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
import { crewEntry, crewView, crewTotals, dueForCheck, GO_KINDS } from './_crew.js';

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

// Street Crew (api/_crew.js): one hash, address -> entry
const CREW_KEY = `${KEY_BASE}:stocks:crew:v1`;
const crewMemory = new Map();
const crewStore = {
  async all() {
    if (!useKv()) return [...crewMemory.values()];
    const flat = (await kv('HGETALL', CREW_KEY)) || [];
    const out = [];
    for (let i = 1; i < flat.length; i += 2) { try { out.push(JSON.parse(flat[i])); } catch { /* skip */ } }
    return out;
  },
  async get(a) { if (!useKv()) return crewMemory.get(a) || null; const v = await kv('HGET', CREW_KEY, a); return v ? JSON.parse(v) : null; },
  async put(a, e) {
    if (!useKv()) { if (e) crewMemory.set(a, e); else crewMemory.delete(a); return; }
    if (e) await kv('HSET', CREW_KEY, a, JSON.stringify(e)); else await kv('HDEL', CREW_KEY, a);
  },
};
// clicks out to Quadra from BaseCity, per kind (GO_KINDS), for the board and the pitch
const GO_KEY = `${KEY_BASE}:stocks:go:v1`;
const goMemory = new Map();
async function goCount(kind) {
  if (!useKv()) { goMemory.set(kind, (goMemory.get(kind) || 0) + 1); return; }
  await kv('HINCRBY', GO_KEY, kind, 1);
}
async function goCounts() {
  if (!useKv()) return Object.fromEntries(GO_KINDS.map((k) => [k, goMemory.get(k) || 0]));
  const vals = (await kv('HMGET', GO_KEY, ...GO_KINDS)) || [];
  return Object.fromEntries(GO_KINDS.map((k, i) => [k, Number(vals[i] || 0)]));
}

async function crewUpdate(address, name, holdings) {
  const prev = await crewStore.get(address);
  const e = crewEntry(prev, { address, name, holdings });
  if (e || prev) await crewStore.put(address, e);
  return { joined: !!e && !prev, left: !e && !!prev, entry: e };
}

let last = null;
export default async function handler(req, res) {
  // ?wallet=0x…|name.base.eth: that wallet's Coinbase stocks (Blocky Street's "your stocks, block by block")
  const q = req.query ?? Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  // ?go=block|basket|city: a click out to Quadra (sent with sendBeacon, so a POST works too)
  if (q.go !== undefined) {
    if (GO_KINDS.includes(String(q.go))) { try { await goCount(String(q.go)); } catch { /* not counted */ } }
    res.setHeader('cache-control', 'no-store');
    return res.status(204).end();
  }
  // ?crew: the Street Crew; a few members' holdings are read again each call (sell under $10 and they leave)
  if (q.crew !== undefined) {
    try {
      let entries = await crewStore.all();
      const due = dueForCheck(entries);
      if (due.length) {
        const list = await stockList();
        await Promise.all(due.map(async (e) => {
          try { await crewUpdate(e.a, e.name, await readHoldings(e.a, list)); } catch { /* next time */ }
        }));
        entries = await crewStore.all();
      }
      res.setHeader('cache-control', 'public, s-maxage=60');
      let go = null;
      try { go = await goCounts(); } catch { /* no counts */ }
      return res.status(200).json({ crew: crewView(entries), totals: crewTotals(entries), go });
    } catch (e) {
      res.setHeader('cache-control', 'no-store');
      return res.status(502).json({ error: String(e.message || e) });
    }
  }
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
      let crew = null;
      try { crew = await crewUpdate(address.toLowerCase(), name, holdings); } catch { /* the tower still goes up */ }
      res.setHeader('cache-control', 'private, no-store'); // it updates the crew: every lookup must reach us
      return res.status(200).json({ address: address.toLowerCase(), name, holdings, crew: crew && { joined: crew.joined, left: crew.left, blockies: crew.entry?.blockies ?? 0, since: crew.entry?.since ?? null } });
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
