// The Base Builders page: every Base Builder with a voxel PFP, live stats from the city, and a download.
import { CONFIG } from './config.js';
import { cityCrew, makeBlocky, CitySim } from './sim.js';
import { fetchColony } from './data.js';
import { renderPfp, downloadPfp } from './pfp.js';

const $ = (id) => document.getElementById(id);
$('ticker').textContent = CONFIG.ticker;
if (CONFIG.buyUrl) { $('buy').hidden = false; $('buy').href = CONFIG.buyUrl; $('buy').textContent = `Buy ${CONFIG.ticker}`; }
$('profile').querySelector('.close').onclick = () => $('profile').close();
$('profile').addEventListener('click', (e) => { if (e.target === $('profile')) $('profile').close(); });
$('profile').addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));

const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const day = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Replay the city (same rules as the game) to know how much every builder has built.
function replay(state) {
  const start = state?.cityStart ?? Date.now();
  const crew = cityCrew(start);
  (state?.blockies || []).forEach(([from, at], i) => crew.push(makeBlocky(i + 1, Math.max(start, at), from)));
  const sim = new CitySim(start);
  sim.setCrew(crew, state?.whales || []);
  sim.advance(Date.now());
  return { crew, sim, minted: state?.minted ?? 0 };
}

function statsOf(b, sim) {
  const now = Date.now();
  if (b.arrivedAt > now) return null;
  const blocks = sim.blocksBy(b, now);
  return { hours: (now - b.arrivedAt) / 3600000, blocks, share: sim.work ? (blocks / sim.work) * 100 : 0, skill: b.skill, joined: b.arrivedAt };
}

function card(b, rank, status, here, stats) {
  const el = document.createElement('article');
  el.className = 'card';
  el.id = slug(b.name);
  el.innerHTML = `
    <div class="pic"><img alt="Voxel PFP of ${b.name}" width="512" height="512" /><span class="rank">${rank}</span></div>
    <div class="body">
      <h2></h2>
      <div class="title"></div>
      <div class="status${here ? ' here' : ''}"></div>
      ${stats ? `<div class="mini"><span>⏱ ${fmt(stats.hours)}h</span><span>🧱 ${fmt(stats.blocks)}</span><span>${stats.share.toFixed(1)}%</span></div>` : ''}
      <div class="row"><button class="btn primary dl">⬇ PFP</button><button class="btn open">Profile</button>${b.legend?.x ? '<a class="btn x" target="_blank" rel="noopener">𝕏</a>' : ''}</div>
    </div>`;
  el.querySelector('h2').textContent = b.name;
  el.querySelector('.title').textContent = b.role.label;
  el.querySelector('.status').textContent = status;
  if (b.legend?.x) el.querySelector('.x').href = `https://x.com/${b.legend.x.replace(/^@/, '')}`;
  el.querySelector('.dl').onclick = () => downloadPfp(b, b.name);
  const open = () => openProfile(b, status, here, stats);
  el.querySelector('.open').onclick = open;
  el.querySelector('.pic').onclick = open;
  return { el, img: el.querySelector('img'), b };
}

// the profile: big PFP, every stat, download, share
function openProfile(b, status, here, stats) {
  const d = $('profile');
  d.querySelector('img').src = renderPfp(b, { size: 1024 });
  d.querySelector('img').alt = `Voxel PFP of ${b.name}`;
  d.querySelector('h2').textContent = b.name;
  d.querySelector('.title').textContent = b.role.label;
  const st = d.querySelector('.status');
  st.textContent = status; st.className = `status${here ? ' here' : ''}`;
  const rows = stats ? [
    ['Role', b.kind === 'founder' ? 'Founder' : 'Base Builder'],
    ['Building for', `${fmt(stats.hours)} hours`],
    ['Blocks placed', fmt(stats.blocks)],
    ['Share of the city', `${stats.share.toFixed(1)}%`],
    ['Skill', `${stats.skill.toFixed(1)}×`],
    ['Building since', day(stats.joined)],
  ] : [['Joins', day(b.arrivedAt)]];
  d.querySelector('dl').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  d.querySelector('.dl').onclick = () => downloadPfp(b, b.name);
  d.querySelector('.share').onclick = () => {
    const who = b.legend?.x ? `@${b.legend.x.replace(/^@/, '')}` : b.name;
    const text = stats
      ? `${who} is building ${CONFIG.cityName} on Base as a voxel Base Builder: ${fmt(stats.blocks)} blocks placed in ${fmt(stats.hours)} hours, 24/7.`
      : `${who} joins ${CONFIG.cityName} as a Base Builder on ${day(b.arrivedAt)}.`;
    open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${CONFIG.siteUrl || location.origin}/builders.html#${slug(b.name)}`)}`, '_blank', 'noopener');
  };
  history.replaceState(null, '', `#${slug(b.name)}`);
  d.showModal();
}

(async () => {
  let state = null;
  try { state = await fetchColony(); } catch { /* show the line-up without live stats */ }
  const { crew, sim, minted } = replay(state);
  const now = Date.now();
  const team = crew.filter((b) => b.kind !== 'blocky');
  const live = state && state.source !== 'demo';
  $('count').textContent = `${team.filter((b) => b.arrivedAt <= now).length - 1} Base builders · ${fmt(minted)} of ${fmt(CONFIG.supply)} Blockies minted${live ? '' : ' (demo data)'}`;
  const cards = team.map((b, i) => {
    const here = b.arrivedAt <= now;
    const status = b.kind === 'founder' ? `Built ${CONFIG.cityName} from empty land` : here ? `Building ${CONFIG.cityName} since ${day(b.arrivedAt)}` : `Joins on ${day(b.arrivedAt)}`;
    return card(b, b.kind === 'founder' ? 'Founder' : `★ ${i}`, status, here, statsOf(b, sim));
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
