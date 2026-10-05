import { CONFIG } from './config.js';

// Colony state = { boughtUsd, potUsd, population, arrivals[], crew[], recentBuys[], market, cityStart, source, mode }.
// Live mode reads it from the API; demo mode fakes buys locally.

const forceDemo = new URLSearchParams(location.search).has('demo');
const demoStart = Date.now();

// Demo: a city with 3 days of history (10 Blockies), then a new buyer every 30s.
// Buys are mostly $5-$60, a Base Builder every 6th Blocky, a Whale as #14.
const HOUR = 3600000, HISTORY = 11;
const demoCityStart = demoStart - 72 * HOUR;
const demoAt = (id) => (id === 1 ? demoCityStart : id <= HISTORY ? demoCityStart + (id - 1) * 6.5 * HOUR : demoStart + (id - HISTORY) * 30000);
function demoBuy(id) {
  const r = Math.abs((Math.sin(id * 12.9898) * 43758.5453) % 1);
  const usd = id === 14 ? 1500 : id % 6 === 0 ? 120 + r * 300 : 5 + r * 55;
  return { from: `0xdemo${((id * 2654435761) >>> 0).toString(16).padStart(8, '0')}${'0'.repeat(26)}${id.toString(16).padStart(2, '0')}`, usd: Math.round(usd * 100) / 100, at: demoAt(id) };
}

function demoState() {
  const t = (Date.now() - demoStart) / 1000;
  const population = HISTORY + Math.floor(t / 30);
  const crew = [null], arrivals = [demoCityStart];
  for (let id = 2; id <= population; id++) { crew.push(demoBuy(id)); arrivals.push(demoAt(id)); }
  // the market swings slowly so every kind of weather shows up while you watch
  const market = { priceUsd: 0.00003, change1h: Math.sin(t / 9) * 3, change24h: Math.sin(t / 25) * 22, volume24h: 1200, stocks: [{ symbol: 'NVDAc', priceUsd: 180 + Math.sin(t / 40) * 4 }] };
  const recentBuys = crew.slice(-4).filter(Boolean).map((c) => ({ ...c, blockies: 1 }));
  const boughtUsd = crew.reduce((s, c) => s + (c?.usd || 0), 0);
  return { progressUsd: boughtUsd, boughtUsd, potUsd: (t * 0.07) % 5, population, arrivals, crew, recentBuys, market, cityStart: demoCityStart, source: 'demo', mode: 'buys' };
}

let mode = forceDemo || !CONFIG.apiUrl ? 'demo' : null; // decided by the first fetch

// Returns the latest state, or null if a live refresh failed (keep the last one).
export async function fetchColony() {
  if (mode === 'demo') return demoState();
  try {
    const res = await fetch(CONFIG.apiUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = await res.json();
    const progressUsd = s.progressUsd ?? s.feesUsd;
    if (typeof progressUsd !== 'number') throw new Error(s.error || 'bad payload');
    mode = 'live';
    return {
      progressUsd,
      boughtUsd: s.boughtUsd ?? progressUsd,
      potUsd: typeof s.potUsd === 'number' ? s.potUsd : 0,
      mode: s.mode || 'fees',
      crew: Array.isArray(s.crew) ? s.crew : null,
      recentBuys: Array.isArray(s.recentBuys) ? s.recentBuys : [],
      market: s.market && typeof s.market.change24h === 'number' ? { ...s.market, stocks: Array.isArray(s.market.stocks) ? s.market.stocks.filter((x) => x && typeof x.priceUsd === 'number' && x.priceUsd > 0) : [] } : null,
      population: s.population ?? 1 + Math.floor(progressUsd / CONFIG.usdPerBlocky),
      arrivals: Array.isArray(s.arrivals) ? s.arrivals : null,
      cityStart: typeof s.cityStart === 'number' ? s.cityStart : null,
      source: s.source || 'live',
    };
  } catch (e) {
    if (mode === 'live') return null;
    console.warn('[colony] live data unavailable, using demo mode:', e.message);
    mode = 'demo';
    return demoState();
  }
}
