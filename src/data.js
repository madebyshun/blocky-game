import { CONFIG } from './config.js';

// Colony state = { progressUsd, boughtUsd, population, arrivals[], crew[], recentBuys[], cityStart, source, mode }.
// Live mode reads it from the API; demo mode fakes fee growth locally.

const forceDemo = new URLSearchParams(location.search).has('demo');
const demoStart = Date.now();

function demoState() {
  const t = (Date.now() - demoStart) / 1000;
  // ~1 new citizen every 30s so the loop is visible while developing/pitching
  const progressUsd = 21.3 + t * 0.17;
  const population = 1 + Math.floor(progressUsd / CONFIG.usdPerBlocky);
  return { progressUsd, boughtUsd: progressUsd, population, arrivals: null, crew: null, recentBuys: [], source: 'demo', mode: 'buys' };
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
      mode: s.mode || 'fees',
      crew: Array.isArray(s.crew) ? s.crew : null,
      recentBuys: Array.isArray(s.recentBuys) ? s.recentBuys : [],
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
