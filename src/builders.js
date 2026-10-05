// The Base Builders page: every legend with its voxel PFP, where it is in the city, and a download.
import { CONFIG } from './config.js';
import { makeBuilder } from './sim.js';
import { fetchColony } from './data.js';
import { renderPfp, downloadPfp } from './pfp.js';

const $ = (id) => document.getElementById(id);
$('ticker').textContent = CONFIG.ticker;
if (CONFIG.buyUrl) { $('buy').hidden = false; $('buy').href = CONFIG.buyUrl; $('buy').textContent = `Buy ${CONFIG.ticker}`; }

const ago = (ms) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};

// Replay the city's arrivals to see which legends already live in it (same rules as the city).
function arrivals(state) {
  const found = new Map(); // legend index -> { id, at }
  const taken = new Set();
  const pop = state?.population || 1;
  for (let id = 2; id <= pop; id++) {
    const b = makeBuilder(id, state.arrivals?.[id - 1] ?? 0, state.crew?.[id - 1] ?? null, taken);
    if (b.legendIdx >= 0) { taken.add(b.legendIdx); found.set(b.legendIdx, { id, at: state.arrivals?.[id - 1] }); }
  }
  return found;
}

function card(b, rank, status, here) {
  const el = document.createElement('article');
  el.className = 'card';
  const name = b.legend?.name ?? b.name;
  el.innerHTML = `
    <div class="pic"><img alt="Voxel PFP of ${name}" width="512" height="512" /><span class="rank">${rank}</span></div>
    <div class="body">
      <h2></h2>
      <div class="title"></div>
      <div class="status${here ? ' here' : ''}"></div>
      <div class="row"><button class="btn primary dl">⬇ Download PFP</button>${b.legend?.x ? '<a class="btn x" target="_blank" rel="noopener">𝕏</a>' : ''}</div>
    </div>`;
  el.querySelector('h2').textContent = name;
  el.querySelector('.title').textContent = b.legend?.title ?? b.role.label;
  el.querySelector('.status').textContent = status;
  if (b.legend?.x) el.querySelector('.x').href = `https://x.com/${b.legend.x.replace(/^@/, '')}`;
  el.querySelector('.dl').onclick = () => downloadPfp(b, name);
  return { el, img: el.querySelector('img'), b };
}

(async () => {
  let state = null;
  try { state = await fetchColony(); } catch { /* show the line-up without live status */ }
  const found = arrivals(state);
  const legends = CONFIG.legends || [];
  const nextFree = legends.findIndex((l, i) => !l.wallet && !found.has(i));
  const live = state && state.source !== 'demo';
  $('count').textContent = `${found.size} of ${legends.length} builders live in ${CONFIG.cityName}${live ? '' : ' (demo data)'}`;

  const cards = [];
  const founder = makeBuilder(1, 0);
  cards.push(card(founder, 'Founder', `Blocky #1 · built ${CONFIG.cityName} from empty land`, true));
  legends.forEach((legend, i) => {
    const there = found.get(i);
    const b = { ...makeBuilder(there?.id ?? 100 + i, 0, { usd: CONFIG.tiers[1].min }, new Set(legends.map((_, k) => k))), legend, legendIdx: i, name: legend.name };
    let status;
    if (there) status = `In ${CONFIG.cityName} as Blocky #${there.id}${there.at ? ` · joined ${ago(there.at)}` : ''}`;
    else if (legend.wallet) status = 'Arrives when their own wallet buys';
    else if (i === nextFree) status = `Next up: arrives with the next ${'$'}${CONFIG.tiers[1].min}+ buy`;
    else status = `In line: #${legends.slice(0, i).filter((l, k) => !l.wallet && !found.has(k)).length + 1} for a ${'$'}${CONFIG.tiers[1].min}+ buy`;
    cards.push(card(b, `★ ${i + 1}`, status, !!there));
  });
  for (const c of cards) $('grid').appendChild(c.el);
  // render the PFPs one at a time so the page stays responsive
  for (const c of cards) {
    c.img.src = renderPfp(c.b, { size: 512 });
    await new Promise((r) => setTimeout(r, 0));
  }
})();
