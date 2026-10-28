// base.html: Base, live, as a bento board. Reads /api/basestats (the week's USDC flow, fees, TVL) and
// polls /api/baselive (the blocks themselves) for the live numbers; saves as a 1600x900 image.
import { toPng } from 'html-to-image';
import { mountSite } from './site.js';
import { CONFIG } from './config.js';

mountSite('base');
const $ = (id) => document.getElementById(id);
const board = $('bb');
const X = CONFIG.xHandle || 'blockyonbase';
const SITE = (CONFIG.siteUrl || 'https://basecity.space').replace(/\/$/, '');

// the board is drawn at 1600x900 and scaled to the page
const fit = () => board.style.setProperty('--s', String(Math.min(1, board.parentElement.clientWidth / 1600)));
const sizeBox = () => { fit(); board.parentElement.style.height = `${900 * Math.min(1, board.parentElement.clientWidth / 1600)}px`; };
addEventListener('resize', sizeBox); sizeBox();

const money = (v, d = 1) => (v >= 1e9 ? `$${(v / 1e9).toFixed(d)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(d)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(d)}k` : `$${Math.round(v)}`);
const int = (v) => Math.round(v).toLocaleString('en-US');

// sending $200: the research's fee table (share of $200), and USDC on Base now (live)
const OTHERS = [['Bank wire (SWIFT)', 16.0], ['Cash agent (WU, MG)', 9.0], ['Blended fiat', 7.1], ['Online to bank (WU, MG)', 3.5], ['Digital MTO (Remitly, WorldRemit)', 3.5], ['Wise', 1.4]];
function drawBars(feeUsd) {
  const max = 19; // room for the % after the longest bar
  const rows = OTHERS.map(([k, pct]) => `<div class="bar"><span>${k}</span><i style="width:${(pct / max) * 100}%"><em>${pct.toFixed(1)}%</em></i></div>`);
  const pct = feeUsd === null ? null : (feeUsd / 200) * 100;
  rows.push(`<div class="bar base"><span>USDC on Base, now</span><i style="width:${pct === null ? 0 : Math.max(0.4, (pct / max) * 100)}%"><em>${pct === null ? '—' : pct < 0.01 ? `${pct.toFixed(4)}%` : `${pct.toFixed(2)}%`}</em></i></div>`);
  $('v-bars').innerHTML = rows.join('');
}
drawBars(null);

const S = { stats: null, blocks: [], head: 0 };
const bt = () => { const b = S.blocks; if (b.length < 6) return 2; const s = (b.at(-1).t - b[0].t) / 1000 / (b.length - 1); return s > 0 ? s : 2; };
function feeNow() {
  const f = S.stats?.fees, b = S.blocks.at(-1);
  if (!f?.ethUsd || !b) return null;
  return ((f.gas * (b.gwei * 1e9 + f.prioWei) + f.l1FeeWei) / 1e18) * f.ethUsd;
}
function render() {
  const st = S.stats, flow = st?.flow, b = S.blocks.at(-1);
  if (flow?.usd24h) { $('v-usd').textContent = money(flow.usd24h); $('v-usd-n').textContent = `${int(flow.n24h)} transfers · estimated from sampled blocks`; }
  else if (flow) { $('v-usd').textContent = '…'; $('v-usd-n').textContent = `measuring: ${flow.hours} of 24 hours in`; }
  if (flow?.closedShare !== null && flow?.closedShare !== undefined) {
    $('v-pct').textContent = `${Math.round(flow.closedShare * 100)}%`;
    $('v-pct-n').textContent = `last ${flow.hours >= 168 ? '7 days' : `${flow.hours} hours`} · banks closed ${int(flow.closedHours)} of ${int(flow.hours)} hours`;
  }
  const fee = feeNow();
  $('v-fee').textContent = fee === null ? '—' : fee < 0.01 ? `$${fee.toFixed(4)}` : `$${fee.toFixed(2)}`;
  drawBars(fee);
  if (b) {
    const win = S.blocks.slice(-15), span = (win.at(-1).t - win[0].t) / 1000 + bt();
    $('v-tps').textContent = int(win.reduce((s, x) => s + x.tx, 0) / span);
    $('v-bt').textContent = bt() < 1 ? `${Math.round(bt() * 1000)} ms` : `${bt().toFixed(1)} s`;
    $('v-gas').textContent = `${Math.round(b.gas * 100)}%`;
    $('v-gwei').textContent = `${b.gwei < 0.01 ? b.gwei.toFixed(4) : b.gwei.toFixed(3)} gwei`;
    const usdPerSec = win.reduce((s, x) => s + x.usdc.usd, 0) / span;
    $('v-read').textContent = money(usdPerSec * 5);
  } else if (flow?.lastHourUsd) $('v-read').textContent = money((flow.lastHourUsd / 3600) * 5);
  const apps = st?.apps || {};
  $('v-apps').innerHTML = [['Morpho', 'morpho', '#2470ff'], ['Aave', 'aave', '#9391f7'], ['Aerodrome', 'aerodrome', '#1f4bff'], ['Uniswap', 'uniswap', '#ff007a']]
    .sort((a, c) => (apps[c[1]] || 0) - (apps[a[1]] || 0))
    .map(([name, id, color]) => `<li><span><i style="background:${color}"></i>${name}</span><b>${apps[id] ? money(apps[id]) : '—'}</b></li>`).join('')
    + (st?.tvl ? `<li><span><i style="background:#0a0b0d"></i>All of Base</span><b>${money(st.tvl)}</b></li>` : '');
  // the share text follows the numbers
  const parts = [flow?.usd24h && `${money(flow.usd24h)} in USDC moved on Base in 24h`, flow?.closedShare != null && `${Math.round(flow.closedShare * 100)}% of it while US banks were closed`, fee !== null && `sending $200 costs ${fee < 0.01 ? `$${fee.toFixed(4)}` : `$${fee.toFixed(2)}`}`].filter(Boolean);
  $('bb-share').href = `https://x.com/intent/post?text=${encodeURIComponent(`Base, live:\n${parts.map((p) => `→ ${p}`).join('\n')}\n\nthe always-on chain, read block by block by @${X}\n${SITE}/base.html`)}`;
}

async function loadStats() { try { const r = await fetch('/api/basestats'); if (r.ok) S.stats = await r.json(); } catch { /* the cells say — */ } render(); }
async function poll() {
  if (document.visibilityState !== 'visible') return;
  try {
    const r = await fetch(`/api/baselive?since=${S.head}`, { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    for (const x of j.blocks || []) if (x.n > S.head) { S.blocks.push(x); S.head = x.n; }
    if (!S.head && j.head) S.head = j.head;
    S.blocks = S.blocks.slice(-40);
    render();
  } catch { /* next time */ }
}
loadStats(); poll();
setInterval(poll, 4000);
setInterval(loadStats, 60000);

// The saved image must use the page's own fonts: html-to-image can't read Google Fonts' cross-origin
// stylesheet, so it fell back to another font (wider: lines wrapped, '2.0 s' broke). Fetch the CSS and
// its latin font files once and hand them over inlined.
let fontCss = null;
async function embedFonts() {
  if (fontCss !== null) return fontCss;
  fontCss = '';
  try {
    const href = document.querySelector('link[href*="fonts.googleapis.com/css2"]')?.href;
    if (!href) return fontCss;
    const css = await (await fetch(href)).text();
    const latin = css.split('/*').filter((b) => /^\s*latin \*\//.test(b)).map((b) => `/*${b}`); // the latin subsets only
    const blocks = await Promise.all(latin.map(async (b) => {
      const url = b.match(/url\((https:[^)]+)\)/)?.[1];
      if (!url) return '';
      const buf = await (await fetch(url)).arrayBuffer();
      let bin = ''; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return b.replace(url, `data:font/woff2;base64,${btoa(bin)}`);
    }));
    fontCss = blocks.join('\n');
  } catch (e) { console.warn('[bento] fonts not embedded', e); }
  return fontCss;
}

$('bb-save').onclick = async () => {
  const btn = $('bb-save'); btn.textContent = 'Saving…';
  try {
    await document.fonts.ready;
    const fontEmbedCSS = await embedFonts();
    const prev = board.style.transform; board.style.transform = 'none';
    const url = await toPng(board, { width: 1600, height: 900, pixelRatio: 2, cacheBust: true, ...(fontEmbedCSS ? { fontEmbedCSS } : {}) });
    board.style.transform = prev;
    const a = document.createElement('a'); a.href = url; a.download = `base-live-${new Date().toISOString().slice(0, 10)}.png`; a.click();
  } catch (e) { console.error(e); }
  btn.textContent = 'Save image';
};
