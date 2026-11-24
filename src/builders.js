// The Base Builders page: every Base Builder with a voxel PFP, live stats from the city, and a download.
import { CONFIG } from './config.js';
import { fetchColony } from './data.js';
import { renderPfp, downloadPfp } from './pfp.js';
import { replay } from './replay.js';
import { mountSite, fmt, day } from './site.js';
import { OFFICE_RANK } from './sim.js';

const $ = (id) => document.getElementById(id);
mountSite('builders');
$('profile').querySelector('.close').onclick = () => $('profile').close();
$('profile').addEventListener('click', (e) => { if (e.target === $('profile')) $('profile').close(); });
$('profile').addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));

const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function statsOf(b, sim) {
  const now = Date.now();
  if (b.arrivedAt > now) return null;
  const blocks = sim.blocksBy(b, now);
  const total = sim.workAt(now);
  return { hours: (now - b.arrivedAt) / 3600000, blocks, share: total ? (blocks / total) * 100 : 0, skill: b.skill, joined: b.arrivedAt };
}

function card(b, status, here, stats) {
  const el = document.createElement('article');
  el.className = 'card';
  el.id = slug(b.name);
  el.innerHTML = `
    <button class="pic" type="button"><img alt="" width="384" height="384" /></button>
    <div class="body">
      <h2></h2>
      <div class="title"></div>
      <div class="status${here ? ' here' : ''}"></div>
      ${stats ? `<div class="mini"><span>${fmt(stats.hours)}h</span><span>${fmt(stats.blocks)} blocks</span><span>${stats.share.toFixed(1)}%</span></div>` : ''}
      <div class="row"><button class="btn primary dl">Save PFP</button><button class="btn open">Profile</button>${b.legend?.x ? '<a class="btn x" target="_blank" rel="noopener">X</a>' : ''}</div>
    </div>`;
  el.querySelector('h2').textContent = b.name;
  el.querySelector('.pic').setAttribute('aria-label', `View ${b.name}`);
  el.querySelector('.title').textContent = b.office ? `${b.office.label} · ${b.role.label}` : b.role.label;
  el.querySelector('.status').textContent = status;
  if (b.legend?.x) el.querySelector('.x').href = `https://x.com/${b.legend.x.replace(/^@/, '')}`;
  el.querySelector('.dl').onclick = () => downloadPfp(b, b.name, { studio: true });
  const open = () => openProfile(b, status, here, stats);
  el.querySelector('.open').onclick = open;
  el.querySelector('.pic').onclick = open;
  return { el, img: el.querySelector('img'), b };
}

// the profile: big PFP, every stat, download, share
function openProfile(b, status, here, stats) {
  const d = $('profile');
  let full = false;
  const views = d.querySelectorAll('[data-view]');
  function setView(value) {
    full = value;
    d.querySelector('img').src = renderPfp(b, { size: 640, studio: true, full });
    for (const button of views) button.setAttribute('aria-pressed', String((button.dataset.view === 'full') === full));
    d.querySelector('.dl').textContent = full ? 'Download full body' : 'Download PFP';
  }
  for (const button of views) button.onclick = () => setView(button.dataset.view === 'full');
  setView(false);
  d.querySelector('img').alt = `Voxel character of ${b.name}`;
  d.querySelector('.view-3d').href = `/blocky.html?n=${encodeURIComponent(slug(b.name))}`;
  d.querySelector('h2').textContent = b.name;
  d.querySelector('.title').textContent = b.office ? `${b.office.label} · ${b.role.label}` : b.role.label;
  const st = d.querySelector('.status');
  st.textContent = status; st.className = `status${here ? ' here' : ''}`;
  const rows = stats ? [
    ['Role', b.kind === 'founder' ? 'Founder' : 'Base Builder'],
    ...(b.office ? [['City Council', b.office.label]] : []),
    ['Building for', `${fmt(stats.hours)} hours`],
    ['Blocks placed', fmt(stats.blocks)],
    ['Share of the city', `${stats.share.toFixed(1)}%`],
    ['Skill', `${stats.skill.toFixed(1)}×`],
    ['Building since', day(stats.joined)],
  ] : [['Joins', day(b.arrivedAt)]];
  d.querySelector('dl').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  d.querySelector('.dl').onclick = () => downloadPfp(b, full ? `${b.name}-full` : b.name, { studio: true, full });
  d.querySelector('.share').onclick = () => {
    const who = b.legend?.x ? `@${b.legend.x.replace(/^@/, '')}` : b.name;
    const text = stats
      ? `${who} is building ${CONFIG.cityName} on Base as a voxel Base Builder${b.office ? ` and its ${b.office.label}` : ''}: ${fmt(stats.blocks)} blocks placed in ${fmt(stats.hours)} hours, 24/7.`
      : `${who} joins ${CONFIG.cityName} as a Base Builder on ${day(b.arrivedAt)}.`;
    const tag = CONFIG.xHandle ? ` @${CONFIG.xHandle}` : '';
    open(`https://x.com/intent/tweet?text=${encodeURIComponent(text + tag)}&url=${encodeURIComponent(`${CONFIG.siteUrl || location.origin}/builders.html#${slug(b.name)}`)}`, '_blank', 'noopener');
  };
  history.replaceState(null, '', `#${slug(b.name)}`);
  d.showModal();
}

(async () => {
  let state = null;
  try { state = await fetchColony(); } catch { /* show the line-up without live stats */ }
  const { team, sim, minted } = replay(state);
  const now = Date.now();
  const live = state && state.source !== 'demo';
  $('count').textContent = `${team.filter((b) => b.arrivedAt <= now).length - 1} Base builders · ${fmt(minted)} of ${fmt(CONFIG.supply)} Blockies in the city${live ? '' : ' (demo data)'}`;
  // the founder first, then the City Council by rank (Mayor, Governor, ...), then everyone else
  const rank = (b) => (b.kind === 'founder' ? -1 : b.office ? OFFICE_RANK.indexOf(b.office.id) : 999);
  const order = team.slice().sort((a, b) => rank(a) - rank(b));
  const cards = order.map((b) => {
    const here = b.arrivedAt <= now;
    const status = b.kind === 'founder' ? `Built ${CONFIG.cityName} from empty land` : here ? `Building ${CONFIG.cityName} since ${day(b.arrivedAt)}` : `Joins on ${day(b.arrivedAt)}`;
    return card(b, status, here, statsOf(b, sim));
  });
  for (const c of cards) $('grid').appendChild(c.el);
  const linked = cards.find((c) => location.hash && c.el.id === location.hash.slice(1));
  if (linked) linked.el.querySelector('.open').click();
  const search = $('builder-search');
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    let matches = 0;
    for (const { el, b } of cards) {
      el.hidden = ![b.name, b.role.label, b.office?.label, b.legend?.x].some((value) => value?.toLowerCase().includes(query));
      if (!el.hidden) matches++;
    }
    $('builder-empty').hidden = matches > 0;
  });

  const portraits = new Map(cards.map((c) => [c.img, c.b]));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) continue;
        observer.unobserve(target);
        requestAnimationFrame(() => {
          target.src = renderPfp(portraits.get(target), { size: 384, mark: false, studio: true });
        });
      }
    }, { rootMargin: '160px' });
    for (const { img } of cards) observer.observe(img);
  } else {
    for (const { img, b } of cards) img.src = renderPfp(b, { size: 384, mark: false, studio: true });
  }
})();
