// The Base Builders page: every legend with its voxel PFP, where it is in the city, and a download.
import { CONFIG } from './config.js';
import { makeBuilder, CitySim } from './sim.js';
import { fetchColony } from './data.js';
import { renderPfp, downloadPfp } from './pfp.js';

const $ = (id) => document.getElementById(id);
$('ticker').textContent = CONFIG.ticker;
if (CONFIG.buyUrl) { $('buy').hidden = false; $('buy').href = CONFIG.buyUrl; $('buy').textContent = `Buy ${CONFIG.ticker}`; }

$('profile').querySelector('.close').onclick = () => $('profile').close();
$('profile').addEventListener('click', (e) => { if (e.target === $('profile')) $('profile').close(); });
$('profile').addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));

const ago = (ms) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};

// Replay the city: who arrived (same legend rules as the city) and how much each Blocky built.
function replay(state) {
  const found = new Map(); // legend index -> builder
  if (!state) return { found, sim: null, founder: null };
  const taken = new Set(), list = [];
  const start = state.cityStart ?? state.arrivals?.[0] ?? Date.now();
  const pop = state.population || 1;
  for (let id = 1; id <= pop; id++) {
    const at = id === 1 ? start : Math.max(start, state.arrivals?.[id - 1] ?? Date.now());
    const b = makeBuilder(id, at, state.crew?.[id - 1] ?? null, taken);
    if (b.legendIdx >= 0) { taken.add(b.legendIdx); found.set(b.legendIdx, b); }
    list.push(b);
  }
  const sim = new CitySim(start);
  sim.setBuilders(list);
  sim.advance(Date.now());
  return { found, sim, founder: list[0], crew: state.crew || [] };
}

const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
function statsOf(b, ctx) {
  if (!ctx.sim || !b?.arrivedAt) return null;
  const now = Date.now(), blocks = ctx.sim.blocksBy(b, now);
  const by = ctx.crew[b.id - 1];
  return {
    id: b.id, hours: (now - b.arrivedAt) / 3600000, blocks, share: ctx.sim.work ? (blocks / ctx.sim.work) * 100 : 0,
    skill: b.skill, joined: b.arrivedAt, by: b.id === 1 ? 'Founder' : by?.pot ? 'the community pot' : by ? `${short(by.from)} ($${by.usd} buy)` : '—',
  };
}

function card(b, rank, status, here, stats) {
  const el = document.createElement('article');
  el.className = 'card';
  el.id = slug(b.legend?.name ?? b.name);
  const name = b.legend?.name ?? b.name;
  el.innerHTML = `
    <div class="pic"><img alt="Voxel PFP of ${name}" width="512" height="512" /><span class="rank">${rank}</span></div>
    <div class="body">
      <h2></h2>
      <div class="title"></div>
      <div class="status${here ? ' here' : ''}"></div>
      ${stats ? `<div class="mini"><span>⏱ ${fmt(stats.hours)}h</span><span>🧱 ${fmt(stats.blocks)}</span><span>${stats.share.toFixed(1)}%</span></div>` : ''}
      <div class="row"><button class="btn primary dl">⬇ PFP</button><button class="btn open">Profile</button>${b.legend?.x ? '<a class="btn x" target="_blank" rel="noopener">𝕏</a>' : ''}</div>
    </div>`;
  el.querySelector('h2').textContent = name;
  el.querySelector('.title').textContent = b.legend?.title ?? b.role.label;
  el.querySelector('.status').textContent = status;
  if (b.legend?.x) el.querySelector('.x').href = `https://x.com/${b.legend.x.replace(/^@/, '')}`;
  el.querySelector('.dl').onclick = () => downloadPfp(b, name);
  const open = () => openProfile(b, status, here, stats);
  el.querySelector('.open').onclick = open;
  el.querySelector('.pic').onclick = open;
  return { el, img: el.querySelector('img'), b };
}

const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// the profile: big PFP, every stat, download, share
function openProfile(b, status, here, stats) {
  const d = $('profile'), name = b.legend?.name ?? b.name;
  d.querySelector('img').src = renderPfp(b, { size: 1024 });
  d.querySelector('img').alt = `Voxel PFP of ${name}`;
  d.querySelector('h2').textContent = name;
  d.querySelector('.title').textContent = b.legend?.title ?? b.role.label;
  const st = d.querySelector('.status');
  st.textContent = status; st.className = `status${here ? ' here' : ''}`;
  const rows = stats ? [
    ['In the city as', `Blocky #${stats.id}`],
    ['Building for', `${fmt(stats.hours)} hours`],
    ['Blocks placed', fmt(stats.blocks)],
    ['Share of the city', `${stats.share.toFixed(1)}%`],
    ['Skill', `${stats.skill.toFixed(1)}×`],
    ['Joined', new Date(stats.joined).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
    ['Brought by', stats.by],
    ['Fees earned', 'Coming soon'],
  ] : [['Status', 'Not in the city yet'], ['Fees earned', 'Coming soon']];
  d.querySelector('dl').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  d.querySelector('.dl').onclick = () => downloadPfp(b, name);
  d.querySelector('.share').onclick = () => {
    const who = b.legend?.x ? `@${b.legend.x.replace(/^@/, '')}` : name;
    const text = stats
      ? `${who} lives in ${CONFIG.cityName} as a voxel Blocky: ${fmt(stats.blocks)} blocks placed in ${fmt(stats.hours)} hours, building 24/7 on Base.`
      : `${who} is a legend in ${CONFIG.cityName}, waiting to arrive with the next ${'$'}${CONFIG.tiers[1].min}+ buy of ${CONFIG.ticker}.`;
    open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${CONFIG.siteUrl || location.origin}/builders.html#${slug(name)}`)}`, '_blank', 'noopener');
  };
  history.replaceState(null, '', `#${slug(name)}`);
  d.showModal();
}

(async () => {
  let state = null;
  try { state = await fetchColony(); } catch { /* show the line-up without live status */ }
  const ctx = replay(state);
  const { found } = ctx;
  const legends = CONFIG.legends || [];
  const nextFree = legends.findIndex((l, i) => !l.wallet && !found.has(i));
  const live = state && state.source !== 'demo';
  $('count').textContent = `${found.size} of ${legends.length} builders live in ${CONFIG.cityName}${live ? '' : ' (demo data)'}`;

  const cards = [];
  const founder = ctx.founder ?? makeBuilder(1, 0);
  cards.push(card(founder, 'Founder', `Blocky #1 · built ${CONFIG.cityName} from empty land`, true, statsOf(ctx.founder, ctx)));
  legends.forEach((legend, i) => {
    const there = found.get(i);
    const b = there ?? { ...makeBuilder(100 + i, 0, { usd: CONFIG.tiers[1].min }, new Set(legends.map((_, k) => k))), legend, legendIdx: i, name: legend.name };
    let status;
    if (there) status = `In ${CONFIG.cityName} as Blocky #${there.id}${there.at ? ` · joined ${ago(there.at)}` : ''}`;
    else if (legend.wallet) status = 'Arrives when their own wallet buys';
    else if (i === nextFree) status = `Next up: arrives with the next ${'$'}${CONFIG.tiers[1].min}+ buy`;
    else status = `In line: #${legends.slice(0, i).filter((l, k) => !l.wallet && !found.has(k)).length + 1} for a ${'$'}${CONFIG.tiers[1].min}+ buy`;
    cards.push(card(b, `★ ${i + 1}`, status, !!there, statsOf(there, ctx)));
  });
  for (const c of cards) $('grid').appendChild(c.el);
  const linked = cards.find((c) => location.hash && c.el.id === location.hash.slice(1));
  if (linked) linked.el.querySelector('.open').click();
  // render the PFPs one at a time so the page stays responsive
  for (const c of cards) {
    c.img.src = renderPfp(c.b, { size: 512 });
    await new Promise((r) => setTimeout(r, 0));
  }
})();
