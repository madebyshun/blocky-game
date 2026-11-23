// IPO Day: when Coinbase lists a tokenized stock on Base that BaseCity has never seen, the city gets
// an empty lot with a crane on it that day, and Blocky Street builds it live — a tower for the
// newcomer, block by block from its first real transfers. Ideas doc: docs/STOCK-NFTS-IDEAS.md (#6).
//
// The detection is server-side (api/ipoday.js): it diffs Coinbase's public stock list against
// `stocks:known:v1` in KV and stamps each first sighting with a time. The client only renders it.
//
// Render only: the sim never sees any of this, so nothing the city already built changes.

const DAY = 864e5;
const short = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`);

// A listing is "new" for this long after its first sighting: the city keeps the crane up for a day.
export const IPO_DAYS = 1; // whole days a newly listed stock keeps its crane
export const isLive = (ipo, now = Date.now()) => Boolean(ipo) && Number.isFinite(ipo.firstSeenAt) && now - ipo.firstSeenAt < IPO_DAYS * DAY;

// Each listing on Coinbase's list, with the day BaseCity first saw it. `known` is { [ticker]: firstSeenAt }.
// `list` is stockList()'s output. Returns the same shape, sorted newest first.
export function iposOf(list, known = {}) {
  return (list || [])
    .filter((s) => s && s.ticker)
    .map((s) => ({ ...s, firstSeenAt: known[s.ticker] ?? null }))
    .sort((a, b) => (b.firstSeenAt ?? 0) - (a.firstSeenAt ?? 0));
}

// The next snapshot: every ticker in the list gets a firstSeenAt (now, for a ticker seen for the first
// time). Pure, so a test can run it.
// `seeding`: the store has never seen this list (the first run, or a fresh KV). Then every ticker is
// stamped but nothing is `fresh`: a first run must not put 300 cranes up for stocks that were there all
// along. Only what appears after that first snapshot is an IPO.
export function stampFirstSeen(list, known = {}, now = Date.now(), { seeding = false } = {}) {
  const next = { ...known };
  const fresh = [];
  for (const s of list || []) {
    if (!s?.ticker) continue;
    if (next[s.ticker] == null) { next[s.ticker] = now; if (!seeding) fresh.push(s.ticker); }
  }
  return { known: next, fresh };
}

// True when the store holds no tickers yet: the next stamp seeds it rather than announcing anything.
export const isSeeding = (known) => !known || Object.keys(known).length === 0;

// ---------- the panel ----------

// The card a new listing opens, and the banner the city shows while it is fresh.
export function createIpoDay({ feed = '/api', log = () => {}, goTo = () => {} } = {}) {
  const el = document.createElement('div');
  el.className = 'bl-panel ipo-panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="bl-ph"><b>IPO Day</b><button class="bl-x" title="Close">Close</button></div>
    <p class="bl-sub">A stock Coinbase listed on Base that BaseCity had never seen gets an empty lot and a crane the day it lands, and Blocky Street builds it live from its first real transfers.</p>
    <div class="ipo-list"></div>
    <p class="st-note">Read from Coinbase's public list (api.coinbase.com). Tokenized stocks aren't offered in the U.S. Not financial advice.</p>`;
  document.body.appendChild(el);
  el.querySelector('.bl-x').onclick = () => (el.hidden = true);

  const listEl = el.querySelector('.ipo-list');
  const S = { rows: [], loaded: false, seen: new Set(), announced: [] };

  function draw() {
    if (!S.rows.length) { listEl.innerHTML = '<p class="muted">Reading the list…</p>'; return; }
    const now = Date.now();
    const row = (s) => {
      const live = S.announced.includes(s.ticker); // only a real announcement counts, never a seed stamp
      const when = s.firstSeenAt ? new Date(s.firstSeenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
      const ago = s.firstSeenAt ? Math.floor((now - s.firstSeenAt) / 36e5) : null;
      const left = live ? Math.max(1, Math.ceil((IPO_DAYS * DAY - (now - s.firstSeenAt)) / 36e5)) : 0;
      return `<div class="ipo-row${live ? ' live' : ''}">
        <span class="ipo-tick">${esc(s.ticker)}</span>
        <span class="ipo-name">${esc(s.name || '')}</span>
        <b>${live ? `crane up · ${left} h left` : when}</b>
        ${ago != null && ago < 24 * 30 ? `<small>seen ${ago < 1 ? 'just now' : `${ago} h ago`}</small>` : ''}
      </div>`;
    };
    // fresh ones first, then the last few seen, never the whole 200+
    const fresh = S.announced.map((t) => S.rows.find((s) => s.ticker === t)).filter(Boolean);
    const rest = S.rows.filter((s) => !S.announced.includes(s.ticker) && s.firstSeenAt).slice(0, 12);
    listEl.innerHTML = `${fresh.length ? `<h4>Building now</h4>${fresh.map(row).join('')}` : '<p class="muted">No new listing right now. The crane goes up the hour Coinbase adds one.</p>'}
      ${rest.length ? `<h4>Recently listed</h4>${rest.map(row).join('')}` : ''}`;
  }
  function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

  async function load() {
    try {
      const r = await fetch(`${feed}/ipoday`);
      if (!r.ok) return;
      const j = await r.json();
      const announced = (j.live || []).filter((t) => (j.stocks || []).some((s) => s.ticker === t));
      const prev = new Set(S.announced);
      S.rows = (j.stocks || []).map((s) => ({ ...s, firstSeenAt: s.firstSeenAt ?? null }));
      S.announced = announced;
      S.loaded = true;
      // the feed line only for what *this* answer newly announced: a seed run says nothing
      for (const t of announced) {
        if (prev.has(t)) continue;
        const s = S.rows.find((x) => x.ticker === t);
        log(`<b>IPO DAY:</b> ${esc(s?.name || t)} just listed on Base. Blocky Street is breaking ground`);
      }
      draw();
    } catch { /* the panel says it is reading */ }
  }

  return {
    load, draw,
    open() { el.hidden = false; draw(); load(); },
    close() { el.hidden = true; },
    toggle() { if (el.hidden) this.open(); else this.close(); },
    get live() { return S.announced.map((t) => S.rows.find((s) => s.ticker === t)).filter(Boolean); },
    get panel() { return el; },
  };
}
