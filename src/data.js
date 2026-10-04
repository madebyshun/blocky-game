import { CONFIG } from './config.js';

// Colony state = { feesUsd, population, arrivals[], source }.
// Live mode reads it from the API; demo mode fakes fee growth locally.

const forceDemo = new URLSearchParams(location.search).has('demo');
const demoStart = Date.now();

function demoState() {
  const t = (Date.now() - demoStart) / 1000;
  // ~1 new citizen every 30s so the loop is visible while developing/pitching
  const feesUsd = 21.3 + t * 0.17;
  const population = 1 + Math.floor(feesUsd / CONFIG.feePerCitizen);
  return { feesUsd, population, arrivals: null, source: 'demo' };
}

let mode = forceDemo || !CONFIG.apiUrl ? 'demo' : null; // decided by the first fetch

// Returns the latest state, or null if a live refresh failed (keep the last one).
export async function fetchColony() {
  if (mode === 'demo') return demoState();
  try {
    const res = await fetch(CONFIG.apiUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = await res.json();
    if (typeof s.feesUsd !== 'number') throw new Error('bad payload');
    mode = 'live';
    return {
      feesUsd: s.feesUsd,
      population: s.population ?? 1 + Math.floor(s.feesUsd / CONFIG.feePerCitizen),
      arrivals: Array.isArray(s.arrivals) ? s.arrivals : null,
      source: s.source || 'live',
    };
  } catch (e) {
    if (mode === 'live') return null;
    console.warn('[colony] live data unavailable, using demo mode:', e.message);
    mode = 'demo';
    return demoState();
  }
}
