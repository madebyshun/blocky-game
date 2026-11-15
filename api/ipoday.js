// Vercel serverless function: IPO Day (src/ipoday.js) — the tokenized stocks Coinbase listed on Base
// recently, and when BaseCity first saw each one.
//   GET /api/ipoday -> { stocks: [{ ticker, name, address, nav, firstSeenAt }], live: [tickers],
//                        known: { [ticker]: firstSeenAt }, fresh: [tickers], seeding, at, errors }
// The store (`stocks:known:v1`) holds { first: {ticker: firstSeenAt}, announced: {ticker: announcedAt} }.
// `first` is written once per ticker and never rewritten: the day a stock joins Blocky Street is a fact
// the city can point at. `announced` is a short list of the ones BaseCity put a crane up for, kept
// IPO_DAYS and then forgotten.
// The very first run seeds `first` from the whole list and announces nothing: 300 stocks were there all
// along, and the city must not pave the street with cranes on launch day.
// Cached 10 minutes: Coinbase's list changes at most a few times a day.
import { stockList } from './_stocks.js';
import { stampFirstSeen, iposOf, isLive, isSeeding, IPO_DAYS } from '../src/ipoday.js';
import { useKv, kv, KEY_BASE } from './_store.js';

const KEY = `${KEY_BASE}:stocks:known:v1`;
const DAY = 864e5;
let memory = null; // no KV in dev: this instance's memory

async function readStore() {
  let raw = memory;
  if (useKv()) { try { raw = JSON.parse((await kv('GET', KEY)) || 'null'); } catch { raw = null; } }
  const s = raw || {};
  return { first: s.first || {}, announced: s.announced || {} };
}
async function writeStore(v) {
  memory = v;
  if (useKv()) { try { await kv('SET', KEY, JSON.stringify(v)); } catch { /* the next call tries again */ } }
}

export default async function handler(req, res) {
  const errors = [];
  try {
    const list = await stockList();
    const store = await readStore();
    const seeding = isSeeding(store.first);
    const { known, fresh } = stampFirstSeen(list, store.first, Date.now(), { seeding });

    // announce this call's new tickers; drop announcements older than IPO_DAYS
    const now = Date.now();
    const announced = Object.fromEntries(Object.entries(store.announced).filter(([, at]) => now - at < IPO_DAYS * DAY));
    for (const t of fresh) announced[t] = now;
    const changed = fresh.length || seeding || Object.keys(announced).length !== Object.keys(store.announced).length;
    if (changed) await writeStore({ first: known, announced });

    const rows = iposOf(list, known);
    const live = Object.keys(announced).filter((t) => isLive({ firstSeenAt: announced[t] }, now));

    res.setHeader('cache-control', 'public, s-maxage=600, stale-while-revalidate=1800');
    res.status(200).json({
      stocks: rows.map(({ ticker, name, address, nav, firstSeenAt }) => ({ ticker, name, address, nav, firstSeenAt })),
      live, known, fresh, seeding, at: now, errors,
    });
  } catch (e) {
    errors.push(String(e.message || e).slice(0, 200));
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: errors[0], stocks: [], live: [], known: {}, fresh: [], seeding: false, at: Date.now(), errors });
  }
}
