import { CONFIG } from './config.js';

// Colony state = { minted, supply, blockies: [[from, at]...] (only new ones after the first fetch),
//   since, whales[], boughtUsd, recentBuys[], market, cityStart, source, mode }.
// Live mode reads it from the API; demo mode fakes buys locally with the same counting rules.

const forceDemo = new URLSearchParams(location.search).has('demo');
const demoStart = Date.now();
const HOUR = 3600000;

// Same rule as the API: every $usdPerBlocky a wallet buys (added up) brings one Blocky, up to supply.
function count(buys) {
  const credit = new Map(), blockies = [], whales = [], recent = [];
  let bought = 0;
  for (const b of buys) {
    bought += b.usd;
    const c = credit.get(b.from) || { usd: 0, n: 0 };
    c.usd += b.usd;
    let added = 0;
    while (c.n < Math.floor(c.usd / CONFIG.usdPerBlocky) && blockies.length < CONFIG.supply) { blockies.push([b.from, b.at]); c.n++; added++; }
    credit.set(b.from, c);
    if (b.usd >= CONFIG.whaleUsd) whales.push({ from: b.from, usd: b.usd, at: b.at });
    recent.unshift({ ...b, blockies: added });
  }
  return { blockies, whales, bought, recent: recent.slice(0, 10) };
}

// Demo: three days of history, then a buy every 30s (a whale at 2 minutes).
const demoCityStart = demoStart - 72 * HOUR;
const wallet = (k) => `0xdemo${((k * 2654435761) >>> 0).toString(16).padStart(8, '0')}${'0'.repeat(28)}`;
function demoBuys(t) {
  const buys = [];
  for (let i = 0; i < 40; i++) { // history
    const r = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
    buys.push({ from: wallet(i % 23), usd: Math.round((3 + r * 45) * 100) / 100, at: demoCityStart + (i + 1) * 1.7 * HOUR });
  }
  for (let i = 0; i <= Math.floor(t / 30); i++) { // live
    const r = Math.abs((Math.sin((i + 50) * 12.9898) * 43758.5453) % 1);
    buys.push({ from: wallet(30 + (i % 9)), usd: i === 4 ? 1000 : Math.round((5 + r * 40) * 100) / 100, at: demoStart + i * 30000 });
  }
  return buys;
}

function demoState(since) {
  const t = (Date.now() - demoStart) / 1000;
  const { blockies, whales, bought, recent } = count(demoBuys(t));
  // the market swings slowly so every kind of weather shows up while you watch
  const market = { priceUsd: 0.00003, change1h: Math.sin(t / 9) * 3, change24h: Math.sin(t / 25) * 22, volume24h: 1200, stocks: [{ symbol: 'NVDAc', priceUsd: 180 + Math.sin(t / 40) * 4 }] };
  return { minted: blockies.length, supply: CONFIG.supply, blockies: blockies.slice(since), since, whales, boughtUsd: bought, recentBuys: recent, market, cityStart: demoCityStart, source: 'demo', mode: 'buys' };
}

let mode = forceDemo || !CONFIG.apiUrl ? 'demo' : null; // decided by the first fetch

// Returns the latest state with the Blockies after the first `since`, or null if a live refresh
// failed (keep the last one).
export async function fetchColony(since = 0) {
  if (mode === 'demo') return demoState(since);
  try {
    const res = await fetch(`${CONFIG.apiUrl}${since ? `?since=${since}` : ''}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = await res.json();
    if (!Array.isArray(s.blockies)) throw new Error(s.error || 'bad payload');
    mode = 'live';
    return {
      minted: s.minted ?? s.blockies.length,
      supply: s.supply ?? CONFIG.supply,
      blockies: s.blockies,
      since: s.since ?? 0, // a stale full answer comes back with since 0
      whales: Array.isArray(s.whales) ? s.whales : [],
      boughtUsd: s.boughtUsd ?? 0,
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
    return demoState(since);
  }
}
