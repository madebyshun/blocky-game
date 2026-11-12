// Blocky Street: Coinbase's tokenized stocks on Base (CONFIG.stocks, the block north of Base Live).
// A tower for each of the big ones, built block by block: its height is the stock's last 24 hours of
// transfers on Base (USD, a log scale), and every transfer that happens now drops one more block on top,
// in the stock's colour. A block laid while Wall Street is shut (src/nysehours.js) glows: Base doesn't
// close. The board at the north end says whether NYSE is open, and how much of the week's stock volume
// on Base moved while it wasn't. Every number is read from Base (api/_stocks.js, api/_baselive.js); fake
// "...c" tokens never count, only Coinbase's own list. Render only: the sim never sees any of this.
import * as THREE from 'three';
import { PITCH } from './sim.js';
import { CONFIG } from './config.js';
import { nyseHours } from './nysehours.js';
import { esc } from './names.js';

// Quadra (madebyshun/quadra) trades the stocks: `?do=swap&buy=<token>` opens its Swap with the stock picked;
// the swap goes through Relay and is signed in the visitor's own wallet (Quadra blocks the U.S.)
export const QUADRA = 'https://quadra-eta.vercel.app';
export const quadraBuy = (address) => `${QUADRA}/?do=swap&buy=${address}`;

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
const mat = (color, emissive = 0, ei = 1) => {
  const k = `${color}|${emissive}|${ei}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei }));
  return mats.get(k);
};
function box(parent, w, h, d, color, x, y, z, emissive) {
  const m = new THREE.Mesh(UNIT, mat(color, emissive));
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
// a canvas panel facing +z, redrawn with draw(fn)
function panel(w, h, px = 512) {
  const c = document.createElement('canvas');
  c.width = px; c.height = Math.round(px * h / w);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.userData.draw = (fn) => { fn(c.getContext('2d'), c.width, c.height); tex.needsUpdate = true; };
  return m;
}

// the stocks' own colours
const COLORS = { NVDA: 0x76b900, TSLA: 0xe31937, AAPL: 0xa3aab4, MSFT: 0x00a4ef, AMZN: 0xff9900, GOOGL: 0x4285f4, META: 0x0467df, COIN: 0x0052ff, CRCL: 0x3d6bf0 };
const colorOf = (t) => COLORS[t] ?? 0x8a94a6;
const compact = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v)}`);
const usd = (v) => `$${compact(v)}`;

const CUBE = 0.92, GAP = 0.05, PER_LAYER = 9, MAX_BLOCKS = 360; // 3x3 blocks a layer
// the height a day's volume gets: a log scale, so $10k and $10M both read
export const layersFor = (usd24) => Math.max(1, Math.round(1 + 3 * Math.log10(1 + (usd24 || 0) / 1e4)));

export function createBlockyStreet(city, { baseLive, open = () => true, log = () => {}, feed = '/api' } = {}) {
  const group = new THREE.Group();
  city.root.add(group);
  const lots = CONFIG.stocks?.lots || [[0, 0]];
  const span = (k) => [Math.min(...lots.map((l) => l[k])), Math.max(...lots.map((l) => l[k]))];
  const [i0, i1] = span(0), [j0, j1] = span(1);
  const cx = ((i0 + i1) / 2) * PITCH, cz = ((j0 + j1) / 2) * PITCH;
  const W = (i1 - i0 + 1) * PITCH - 2, D = (j1 - j0 + 1) * PITCH - 2;
  group.position.set(cx, 0, cz);
  const center = new THREE.Vector3(cx, 2, cz);

  // the ground: a dark street down the middle (north-south), pale sidewalks, gold kerbs
  box(group, W, 0.1, D, 0xd9dde4, 0, 0.02, 0);
  box(group, 3.2, 0.11, D, 0x2b313b, 0, 0.03, 0);
  for (let z = -D / 2 + 1.5; z < D / 2; z += 3) box(group, 0.18, 0.12, 1.2, 0xf4f6fa, 0, 0.04, z); // the centre line
  for (const s of [-1, 1]) box(group, 0.2, 0.16, D, 0xffc83d, 1.7 * s, 0.05, 0);

  // the arch over the south end: BLOCKY STREET
  const arch = new THREE.Group(); arch.position.set(0, 0, D / 2 - 0.8); group.add(arch);
  for (const s of [-1, 1]) box(arch, 0.6, 6, 0.6, 0x1d2430, 2.6 * s, 3, 0);
  box(arch, 6, 1.3, 0.6, 0x0052ff, 0, 6.3, 0);
  const title = panel(5.6, 1.1); title.position.set(0, 6.3, 0.31); arch.add(title);
  title.userData.draw((g, w, h) => { g.fillStyle = '#0052ff'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `900 ${h * 0.58}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('BLOCKY STREET', w / 2, h / 2 + 3); });

  // the board at the north end: is Wall Street open, and the week on Base
  const boardG = new THREE.Group(); boardG.position.set(0, 0, -D / 2 + 1); group.add(boardG);
  for (const s of [-1, 1]) box(boardG, 0.4, 5, 0.4, 0x1d2430, 3.4 * s, 2.5, 0);
  const board = panel(7.2, 3.6, 768); board.position.set(0, 5.2, 0.05); boardG.add(board);
  box(boardG, 7.5, 3.9, 0.25, 0x1d2430, 0, 5.2, -0.1);
  // a bell on top: it rings at the open and the close
  const bell = new THREE.Group(); bell.position.set(0, 7.6, 0); boardG.add(bell);
  box(bell, 0.9, 0.7, 0.9, 0xffc83d, 0, 0, 0); box(bell, 1.2, 0.2, 1.2, 0xffc83d, 0, -0.4, 0); box(bell, 0.2, 0.3, 0.2, 0x7a5a3a, 0, 0.5, 0);

  // ---------- the towers ----------
  const tickers = (CONFIG.stocks?.towers || []).slice(0, 8);
  const SLOTS = [];
  const rows = Math.ceil(tickers.length / 2), dz = (D - 9) / Math.max(1, rows - 1);
  for (let r = 0; r < rows; r++) for (const s of [-1, 1]) SLOTS.push([s * (W / 4 + 0.9), -D / 2 + 5.5 + r * dz]);
  const towers = new Map(), hits = [];
  tickers.forEach((t, i) => {
    const [x, z] = SLOTS[i], g = new THREE.Group(); g.position.set(x, 0, z); group.add(g);
    box(g, 3.2, 0.5, 3.2, 0xe8ebf0, 0, 0.25, 0);
    const blocks = new THREE.InstancedMesh(UNIT, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_BLOCKS);
    blocks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BLOCKS * 3), 3);
    blocks.count = 0; blocks.castShadow = true; blocks.receiveShadow = true;
    g.add(blocks);
    const glow = new THREE.InstancedMesh(UNIT, mat(colorOf(t), colorOf(t), 0.9), 90); // after-hours blocks
    glow.count = 0; g.add(glow);
    const label = panel(3.2, 1.2); label.position.set(0, 1.0, 1.62); g.add(label);
    label.rotation.y = 0; // faces the street through the tower's +z… turned below
    g.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2; // the label faces the street
    // what a tap hits: an invisible box round the tower, as tall as the tallest it gets
    const hit = new THREE.Mesh(UNIT, new THREE.MeshBasicMaterial({ visible: false }));
    hit.scale.set(3.4, 26, 3.4); hit.position.y = 13; hit.userData.ticker = t; g.add(hit); hits.push(hit);
    towers.set(t, { t, g, blocks, glow, label, n: 0, nGlow: 0, falling: [], base: 0, price: null, usd24: null });
  });

  const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color();
  const slotPos = (k) => { const l = Math.floor(k / PER_LAYER), c = k % PER_LAYER; return [((c % 3) - 1) * (CUBE + GAP), 0.5 + CUBE / 2 + l * (CUBE + 0.02), (Math.floor(c / 3) - 1) * (CUBE + GAP)]; };
  function setBlock(tw, k, y) {
    const [x, , z] = slotPos(k);
    tmpM.makeTranslation(x, y, z).scale(new THREE.Vector3(CUBE, CUBE, CUBE));
    tw.blocks.setMatrixAt(k, tmpM);
    tmpC.setHex(colorOf(tw.t)).multiplyScalar(0.82 + ((k * 37) % 7) * 0.035); // a little grain, block to block
    tw.blocks.setColorAt(k, tmpC);
    tw.blocks.instanceMatrix.needsUpdate = true; tw.blocks.instanceColor.needsUpdate = true;
  }
  // build a tower to its day's height at once (no drop): the base it stands on
  function buildTo(tw, layers) {
    const n = Math.min(MAX_BLOCKS - 90, layers * PER_LAYER);
    if (n <= tw.base && tw.n > 0) return;
    for (let k = 0; k < n; k++) setBlock(tw, k, slotPos(k)[1]);
    tw.blocks.count = Math.max(tw.blocks.count, n); tw.n = Math.max(tw.n, n); tw.base = n;
  }
  // one more block, dropped from the sky: a transfer that just happened
  function drop(tw, after) {
    if (tw.n >= MAX_BLOCKS) { // full: start the tower over from its base (it keeps its day's height)
      tw.blocks.count = tw.base; tw.n = tw.base; tw.glow.count = 0; tw.nGlow = 0;
    }
    const k = tw.n++;
    tw.blocks.count = tw.n;
    const y0 = slotPos(k)[1] + 14;
    setBlock(tw, k, y0);
    tw.falling.push({ k, y: y0, vy: 0, after });
  }

  // ---------- the feed ----------
  const S = { stocks: null, week: null, nyse: nyseHours(), byTicker: new Map(), bellAt: -9, wasOpen: null, live: { n: 0, usd: 0, closedUsd: 0 } };
  async function load() {
    try {
      const r = await fetch(`${feed}/stocks`);
      if (!r.ok) return;
      const j = await r.json();
      S.stocks = j.stocks; S.week = j.week; S.weekend = j.weekend || null;
      S.byTicker = new Map((j.stocks || []).map((s) => [s.ticker, s]));
      for (const tw of towers.values()) {
        tw.price = S.byTicker.get(tw.t)?.nav ?? null;
        tw.usd24 = j.week?.tickers?.[tw.t]?.usd24 ?? null;
        buildTo(tw, layersFor(tw.usd24));
      }
      drawAll();
    } catch { /* the board says so */ }
  }
  // each Base block Base Live plays: its stock transfers drop onto their towers
  baseLive?.onBlock((b) => {
    if (!b.stocks) return;
    const after = !nyseHours(b.t).open;
    for (const [t, [n, v]] of Object.entries(b.stocks)) {
      S.live.n += n; S.live.usd += v; if (after) S.live.closedUsd += v;
      const tw = towers.get(t);
      if (!tw) continue;
      for (let i = 0; i < Math.min(n, 4); i++) drop(tw, after);
      if (v >= 100000) log(`📈 ${usd(v)} of ${t} just moved on Base${after ? ', with Wall Street closed' : ''}`);
    }
  });

  // ---------- drawing ----------
  function drawTower(tw) {
    const s = S.byTicker.get(tw.t), w24 = S.week?.tickers?.[tw.t];
    const wk = !S.nyse.open && S.weekend?.call?.rows?.find((r) => r.ticker === tw.t); // the weekend: Base's price vs Friday's close
    tw.label.userData.draw((g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = `#${colorOf(tw.t).toString(16).padStart(6, '0')}`; g.fillRect(0, 0, w * 0.06, h);
      g.fillStyle = '#0a0b0d'; g.textBaseline = 'middle';
      g.font = `900 ${h * 0.4}px Inter, sans-serif`; g.fillText(tw.t, w * 0.1, h * 0.3);
      g.font = `700 ${h * 0.24}px Inter, sans-serif`; g.textAlign = 'right';
      g.fillText(s?.nav ? `$${s.nav >= 100 ? s.nav.toFixed(0) : s.nav.toFixed(2)}` : '—', w * 0.96, h * 0.3);
      g.textAlign = 'left'; g.fillStyle = '#5b6472'; g.font = `600 ${h * 0.2}px Inter, sans-serif`;
      if (wk && Number.isFinite(wk.move)) {
        g.fillStyle = wk.move >= 0 ? '#16a34a' : '#dc2626'; g.font = `800 ${h * 0.21}px Inter, sans-serif`;
        g.fillText(`${wk.move >= 0 ? '▲' : '▼'} ${Math.abs(wk.move).toFixed(2)}% on Base this weekend`, w * 0.1, h * 0.74);
      } else g.fillText(w24 ? `24h on Base · ${usd(w24.usd24)} · ${w24.n24.toLocaleString('en-US')} moves` : 'on Base · reading…', w * 0.1, h * 0.74);
    });
  }
  function drawBoard() {
    const ny = S.nyse, wk = S.week;
    board.userData.draw((g, w, h) => {
      g.fillStyle = '#0a0b0d'; g.fillRect(0, 0, w, h);
      g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillStyle = '#9aa3b2'; g.font = `700 ${h * 0.07}px Inter, sans-serif`; g.fillText('WALL STREET', w * 0.05, h * 0.12);
      g.fillStyle = ny.open ? '#3ddc84' : '#ff5c5c'; g.font = `900 ${h * 0.15}px Inter, sans-serif`;
      g.fillText(ny.open ? 'OPEN' : 'CLOSED', w * 0.05, h * 0.27);
      g.fillStyle = '#9aa3b2'; g.font = `600 ${h * 0.065}px Inter, sans-serif`; g.fillText(ny.open ? ny.time : `${ny.why} · ${ny.time}`, w * 0.05, h * 0.39);
      g.textAlign = 'right'; g.fillStyle = '#9aa3b2'; g.font = `700 ${h * 0.07}px Inter, sans-serif`; g.fillText('BASE', w * 0.95, h * 0.12);
      g.fillStyle = '#3d7bff'; g.font = `900 ${h * 0.15}px Inter, sans-serif`; g.fillText('OPEN', w * 0.95, h * 0.27);
      g.fillStyle = '#9aa3b2'; g.font = `600 ${h * 0.065}px Inter, sans-serif`; g.fillText('24/7, every 200 ms', w * 0.95, h * 0.39);
      g.fillStyle = '#1d2430'; g.fillRect(w * 0.05, h * 0.47, w * 0.9, 2);
      g.textAlign = 'left'; g.fillStyle = '#ffffff';
      if (wk?.hours) {
        g.font = `900 ${h * 0.16}px Inter, sans-serif`;
        g.fillText(wk.closedShare != null ? `${Math.round(wk.closedShare * 100)}%` : '—', w * 0.05, h * 0.64);
        g.font = `600 ${h * 0.06}px Inter, sans-serif`; g.fillStyle = '#c9d0db';
        g.fillText('of tokenized stock volume on Base', w * 0.36, h * 0.6);
        g.fillText(`moved while Wall Street was closed`, w * 0.36, h * 0.68);
        g.fillStyle = '#9aa3b2'; g.font = `600 ${h * 0.058}px Inter, sans-serif`;
        g.fillText(`${wk.dayHours >= 24 ? `${usd(wk.usd24)} moved in 24h` : `${usd(wk.usd7)} so far`} · last ${wk.hours >= 168 ? '7 days' : `${wk.hours} h`} · Coinbase's stocks only`, w * 0.05, h * 0.84);
        const gr = S.weekend?.graded; // Blue Agent's weekend calls, graded at the open
        if (!ny.open && S.weekend?.call) { g.fillStyle = '#3d7bff'; g.fillText(`Weekend prices on Base vs Friday's close · calls by Blue Agent${gr?.calls ? ` · ${gr.hits}/${gr.calls} right so far` : ''}`, w * 0.05, h * 0.93); }
      } else {
        g.font = `700 ${h * 0.08}px Inter, sans-serif`; g.fillText('Reading Base…', w * 0.05, h * 0.66);
      }
    });
  }
  function drawAll() { for (const tw of towers.values()) drawTower(tw); drawBoard(); }
  drawAll();

  let started = false, slowAcc = 0;
  function update(t, dt) {
    group.visible = open();
    if (!group.visible) return;
    if (!started) { started = true; load(); setInterval(load, 5 * 60000); }
    for (const tw of towers.values()) {
      for (let i = tw.falling.length - 1; i >= 0; i--) {
        const f = tw.falling[i], yEnd = slotPos(f.k)[1];
        f.vy -= 30 * dt; f.y += f.vy * dt;
        if (f.y <= yEnd) {
          f.y = yEnd; tw.falling.splice(i, 1);
          if (f.after && tw.nGlow < 90) { // after hours: this block glows, for good
            const [x, , z] = slotPos(f.k);
            tmpM.makeTranslation(x, yEnd, z).scale(new THREE.Vector3(CUBE + 0.02, CUBE + 0.02, CUBE + 0.02));
            tw.glow.setMatrixAt(tw.nGlow++, tmpM); tw.glow.count = tw.nGlow; tw.glow.instanceMatrix.needsUpdate = true;
          }
        }
        setBlock(tw, f.k, f.y);
      }
    }
    // the bell rings at the open and the close
    slowAcc += dt;
    if (slowAcc > 2) {
      slowAcc = 0;
      const ny = nyseHours();
      if (S.wasOpen !== null && ny.open !== S.wasOpen) { S.bellAt = t; log(ny.open ? '🔔 Wall Street just opened. Blocky Street never closed.' : '🔔 Wall Street just closed. Blocky Street keeps building.'); }
      if (ny.open !== S.nyse.open || ny.why !== S.nyse.why || ny.time !== S.nyse.time) { const flip = ny.open !== S.nyse.open; S.nyse = ny; if (flip) drawAll(); else drawBoard(); } // the towers read the weekend only while NYSE is shut
      S.wasOpen = ny.open;
    }
    const ring = t - S.bellAt < 4 ? Math.sin((t - S.bellAt) * 14) * 0.35 * (1 - (t - S.bellAt) / 4) : 0;
    bell.rotation.z = ring;
  }

  // ---------- the card a tower opens: its numbers, and "Add a block" (buy it on Quadra) ----------
  const card = document.createElement('div');
  card.className = 'bl-panel st-card'; card.hidden = true;
  document.body.appendChild(card);
  function showCard(t) {
    const s = S.byTicker.get(t), w = S.week?.tickers?.[t], wk = S.weekend?.call?.rows?.find((r) => r.ticker === t);
    const ny = S.nyse, hex = `#${colorOf(t).toString(16).padStart(6, '0')}`;
    const row = (k, v) => `<div class="st-row"><span>${k}</span><b>${v}</b></div>`;
    card.innerHTML = `
      <div class="bl-ph"><i class="st-chip" style="background:${hex}"></i><b>${esc(t)}</b><span class="st-name">${esc(s?.name || '')}</span><button class="bl-x" title="Close">✕</button></div>
      <p class="bl-sub">Coinbase's tokenized ${esc(t)} on Base. Every block on its tower is a real transfer${ny.open ? '' : '; the glowing ones moved while Wall Street was closed'}.</p>
      ${row('Reference price (Chainlink NAV)', s?.nav ? `$${s.nav.toFixed(2)}` : '—')}
      ${row('Moved on Base, 24 h', Number.isFinite(w?.usd24) ? `${usd(w.usd24)} · ${w.n24.toLocaleString('en-US')} transfers` : '—')}
      ${row('Moved on Base, 7 d', Number.isFinite(w?.usd7) ? usd(w.usd7) : '—')}
      ${wk && Number.isFinite(wk.move) ? row("This weekend on Base vs Friday's close", `<span style="color:${wk.move >= 0 ? '#16a34a' : '#dc2626'}">${wk.move >= 0 ? '▲' : '▼'} ${Math.abs(wk.move).toFixed(2)}%</span>${wk.call ? ` · Blue's call: ${esc(wk.call)}` : ''}`) : ''}
      ${row('Wall Street', ny.open ? `open · ${ny.time}` : `closed (${ny.why}) · ${ny.time}`)}
      ${s?.paused?.length ? '<p class="bl-err">Coinbase has paused some features of this stock right now.</p>' : ''}
      ${s ? `<a class="btn primary st-buy" target="_blank" rel="noopener" href="${quadraBuy(s.address)}">＋ Add a block: buy ${esc(t)} on Quadra</a>` : ''}
      <div class="st-links">
        <a target="_blank" rel="noopener" href="${QUADRA}/?do=basket">A basket of stocks (Quadra)</a>
        <a target="_blank" rel="noopener" href="https://blueagent.dev/markets/weekend">Weekend calls (Blue Agent)</a>
        ${s ? `<a target="_blank" rel="noopener" href="https://basescan.org/token/${s.address}">Basescan ↗</a>` : ''}
      </div>
      <p class="st-note">Swaps go through Relay on Quadra, signed in your own wallet. Tokenized stocks aren't offered in the U.S. Not financial advice.</p>`;
    card.querySelector('.bl-x').onclick = () => (card.hidden = true);
    card.hidden = false;
  }

  return {
    update,
    // a tap: the tower it hit opens its card (true), or nothing here (false)
    pick(ray) {
      if (!group.visible) return false;
      const t = ray.intersectObjects(hits, false)[0]?.object.userData.ticker;
      if (!t) return false;
      showCard(t);
      return true;
    },
    closeCard() { card.hidden = true; },
    get center() { return center; },
    get week() { return S.week; },
    get live() { return S.live; },
  };
}
