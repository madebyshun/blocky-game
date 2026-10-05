import { CONFIG } from './config.js';
import { newLedger, applyTrade, snapshot } from './ledger.js';

// Colony state = the ledger snapshot (src/ledger.js): { minted, issued, departed, supply, waiting,
//   blockies: [[from, at, leftAt, seed]...] after `since`, departures: [[number, at]...] after `dsince`,
//   whales[], boughtUsd, recentBuys[], cityStart } plus { market, source, mode }.
// Live mode reads it from the API; demo mode runs the same ledger on made-up trades.

const forceDemo = new URLSearchParams(location.search).has('demo');
const demoStart = Date.now();
const HOUR = 3600000;
const RULES = { per: CONFIG.usdPerBlocky, supply: CONFIG.supply, whaleUsd: CONFIG.whaleUsd };

// Demo: three days of history (one trader sells half), then a trade every 30s: a $1,000 whale at
// two minutes and a seller at three and a half.
const demoCityStart = demoStart - 72 * HOUR;
const wallet = (k) => `0x${[1, 2, 3, 4, 5].map((s) => ((Math.imul(k + 1, 2654435761) ^ Math.imul(s, 0x9e3779b9)) >>> 0).toString(16).padStart(8, '0')).join('')}`;
const roll = (i) => Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
function demoTrades(t) {
  const trades = [];
  for (let i = 0; i < 40; i++) {
    const usd = Math.round((3 + roll(i) * 45) * 100) / 100;
    trades.push({ who: wallet(i % 23), kind: 'buy', usd, tokens: usd * 33000, at: demoCityStart + (i + 1) * 1.7 * HOUR, tx: `0xdemo-history-${i}` });
    if (i === 30) trades.push({ who: wallet(7), kind: 'sell', usd: 20, tokens: 600000, at: demoCityStart + (i + 1.5) * 1.7 * HOUR, tx: '0xdemo-sell' });
  }
  for (let i = 0; i <= Math.floor(t / 30); i++) {
    const at = demoStart + i * 30000;
    if (i === 7) { trades.push({ who: wallet(31), kind: 'sell', usd: 25, tokens: 1e9, at, tx: '0xdemo-live-sell' }); continue; }
    const usd = i === 4 ? 1000 : Math.round((5 + roll(i + 50) * 40) * 100) / 100;
    trades.push({ who: wallet(30 + (i % 9)), kind: 'buy', usd, tokens: usd * 33000, at, tx: `0xdemo-live-${i}` });
  }
  return trades;
}

function demoState(since, dsince) {
  const t = (Date.now() - demoStart) / 1000;
  const L = newLedger(demoCityStart);
  for (const trade of demoTrades(t)) applyTrade(L, trade, RULES);
  // the market swings slowly so every kind of weather shows up while you watch
  const market = { priceUsd: 0.00003, change1h: Math.sin(t / 9) * 3, change24h: Math.sin(t / 25) * 22, volume24h: 1200, stocks: [{ symbol: 'NVDAc', priceUsd: 180 + Math.sin(t / 40) * 4 }] };
  return { ...snapshot(L, RULES, since, dsince), market, source: 'demo', mode: 'buys' };
}

let mode = forceDemo || !CONFIG.apiUrl ? 'demo' : null; // decided by the first fetch

// Returns the latest state with the Blockies after the first `since` and the departures after the
// first `dsince`, or null if a live refresh failed (keep the last one).
export async function fetchColony(since = 0, dsince = 0) {
  if (mode === 'demo') return demoState(since, dsince);
  try {
    const q = since || dsince ? `?since=${since}&dsince=${dsince}` : '';
    const res = await fetch(`${CONFIG.apiUrl}${q}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = await res.json();
    if (!Array.isArray(s.blockies)) throw new Error(s.error || 'bad payload');
    mode = 'live';
    return {
      minted: s.minted ?? s.blockies.length,
      issued: s.issued ?? s.blockies.length,
      departed: s.departed ?? 0,
      supply: s.supply ?? CONFIG.supply,
      waiting: s.waiting ?? 0,
      since: s.since ?? 0, // a stale full answer comes back with since 0
      dsince: s.dsince ?? 0,
      blockies: s.blockies,
      departures: Array.isArray(s.departures) ? s.departures : [],
      whales: Array.isArray(s.whales) ? s.whales : [],
      boughtUsd: s.boughtUsd ?? 0,
      price: typeof s.price === 'number' ? s.price : null,
      mode: s.mode || 'buys',
      recentBuys: Array.isArray(s.recentBuys) ? s.recentBuys : [],
      market: s.market && typeof s.market.change24h === 'number' ? { ...s.market, stocks: Array.isArray(s.market.stocks) ? s.market.stocks.filter((x) => x && typeof x.priceUsd === 'number' && x.priceUsd > 0) : [] } : null,
      cityStart: typeof s.cityStart === 'number' ? s.cityStart : null,
      source: s.source || 'live',
    };
  } catch (e) {
    if (mode === 'live') return null;
    console.warn('[colony] live data unavailable, using demo mode:', e.message);
    mode = 'demo';
    return demoState(since, dsince);
  }
}
