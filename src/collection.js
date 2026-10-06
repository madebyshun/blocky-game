// The Blockies page: every Blocky the buys brought, with filters, top holders and a detail card
// (portrait = the NFT image, links to OpenSea and Basescan once the contract is live).
import { CONFIG } from './config.js';
import { TRAIT_LABEL } from './sim.js';
import { blockySvg } from './voxel-svg.js';
import { fetchColony } from './data.js';
import { replay } from './replay.js';
import { lazyPortrait, portraitUrl } from './portraits.js';
import { mountSite, fmt, day, basescan, opensea, esc, nftInfo, downloadSvgPng } from './site.js';
import { addNames, nameOf, who } from './names.js';

mountSite('blockies');
const $ = (id) => document.getElementById(id);
for (const el of document.querySelectorAll('.tk')) el.textContent = CONFIG.ticker;
for (const el of document.querySelectorAll('.supply')) el.textContent = fmt(CONFIG.supply);

const PAGE = 60;
const RANK = { legendary: 0, rare: 1, uncommon: 2, common: 3 };
const here = (b) => !Number.isFinite(b.leftAt);
const teamReserve = (b) => b.id <= (CONFIG.nft.reserve?.count || 0) && b.from === CONFIG.nft.reserve.wallet.toLowerCase();
const filters = { q: '', rarity: 'all', trait: 'all', status: 'here', sort: 'new' };
let all = [], sim = null, info = { contract: null, citizenDays: CONFIG.citizenDays, openedAt: null }, list = [], shown = 0;
// a Blocky in the city is a citizen (an NFT its wallet can claim) once trading has opened and it has been
// there `citizenDays` (Infinity before opening day)
const citizenAt = (b) => Math.max(b.arrivedAt + info.citizenDays * 86400e3, info.openedAt ?? Infinity);

function stats(state) {
  const inCity = all.filter(here);
  const holders = new Set(inCity.map((b) => b.from)).size;
  const legendary = inCity.filter((b) => b.rarity.id === 'legendary').length;
  const live = state && state.source !== 'demo';
  $('stats').innerHTML = [
    [`${CONFIG.citizenPlural} in the city`, `${fmt(inCity.length)} <small>/ ${fmt(CONFIG.supply)}</small>`],
    ['Holders', fmt(holders)],
    ['Legendary', fmt(legendary)],
    ['Left the city', fmt(all.length - inCity.length)],
    ...(state?.waiting ? [['Waiting for a place', fmt(state.waiting)]] : []),
  ].map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('') + (live ? '' : '<div class="stat"><span class="k">Data</span><span class="v"><small>Demo: simulated buys</small></span></div>');
}

function sidebar() {
  const count = new Map();
  for (const b of all) if (here(b) && b.from) count.set(b.from, (count.get(b.from) || 0) + 1);
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 10);
  $('holders').innerHTML = top.length
    ? top.map(([a, n]) => `<li><button type="button" data-a="${esc(a)}" title="Show the ${CONFIG.citizenPlural} of ${esc(a)}"><span class="a">${esc(who(a, 22))}</span><b>${fmt(n)}</b></button></li>`).join('')
    : `<li class="none">No ${CONFIG.citizenPlural} yet.</li>`;
  $('holders').onclick = (e) => {
    const btn = e.target.closest('button[data-a]');
    if (!btn) return;
    $('q').value = filters.q = btn.dataset.a;
    filters.status = $('status').value = 'here';
    apply();
    $('q').scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const seen = all.filter(here);
  $('odds').innerHTML = `<tr><th>Rarity</th><th class="n">Odds</th><th class="n">Here</th></tr>${[...CONFIG.rarity].reverse().map((r) => `<tr><td><span class="rarity ${r.id}">${r.label}</span>${r.traits.length ? `<br><small>${r.traits.map((t) => TRAIT_LABEL[t]).join(', ')}</small>` : ''}</td><td class="n">${+(r.chance * 100).toFixed(1)}%</td><td class="n">${fmt(seen.filter((b) => b.rarity.id === r.id).length)}</td></tr>`).join('')}`;
}

function controls() {
  const chips = [['all', 'All'], ...CONFIG.rarity.map((r) => [r.id, r.label])];
  $('rarity').innerHTML = chips.map(([id, label]) => `<button type="button" class="chip${id === filters.rarity ? ' on' : ''}" data-r="${id}" aria-pressed="${id === filters.rarity}">${label}</button>`).join('');
  $('rarity').onclick = (e) => {
    const c = e.target.closest('[data-r]');
    if (!c) return;
    filters.rarity = c.dataset.r;
    for (const x of $('rarity').children) { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', String(x === c)); }
    apply();
  };
  $('trait').innerHTML = `<option value="all">All traits</option><option value="none">No trait</option>${Object.entries(TRAIT_LABEL).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}`;
  let t = 0;
  $('q').oninput = () => { clearTimeout(t); t = setTimeout(() => { filters.q = $('q').value.trim(); apply(); }, 150); };
  for (const id of ['trait', 'status', 'sort']) $(id).onchange = () => { filters[id] = $(id).value; apply(); };
  $('more').onclick = more;
}

function matches(b) {
  const f = filters;
  if (f.status === 'here' && !here(b)) return false;
  if (f.status === 'left' && here(b)) return false;
  if (f.rarity !== 'all' && b.rarity.id !== f.rarity) return false;
  if (f.trait === 'none' ? b.trait : f.trait !== 'all' && b.trait !== f.trait) return false;
  const q = f.q.toLowerCase();
  if (!q) return true;
  if (/^#?\d+$/.test(q)) return b.id === Number(q.replace('#', ''));
  if (q.startsWith('0x')) return (b.from || '').startsWith(q);
  return b.name.toLowerCase().includes(q) || (nameOf(b.from) || '').includes(q); // a Blocky's name or its wallet's Basename
}

function apply() {
  const now = Date.now();
  list = all.filter(matches);
  const by = {
    new: (a, b) => b.id - a.id,
    old: (a, b) => a.id - b.id,
    rare: (a, b) => RANK[a.rarity.id] - RANK[b.rarity.id] || a.id - b.id,
    blocks: (a, b) => sim.blocksBy(b, now) - sim.blocksBy(a, now) || a.id - b.id,
  }[filters.sort];
  list.sort(by);
  shown = 0;
  $('tiles').innerHTML = '';
  more();
  $('shown').textContent = `${fmt(list.length)} ${list.length === 1 ? CONFIG.citizen : CONFIG.citizenPlural}${filters.q || filters.rarity !== 'all' || filters.trait !== 'all' ? ' match' : ''}`;
  if (!list.length) $('tiles').innerHTML = `<p class="empty">${all.length ? `No ${CONFIG.citizenPlural} match.` : `No ${CONFIG.citizenPlural} yet: every $${CONFIG.usdPerBlocky} of ${CONFIG.ticker} bought brings one.`}</p>`;
}

function more() {
  const frag = document.createDocumentFragment();
  for (const b of list.slice(shown, shown + PAGE)) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `tile${here(b) ? '' : ' gone'}`;
    el.innerHTML = `<div class="pic"><img alt="${esc(b.name)}" width="256" height="256" /></div>
      <div class="info"><div class="name">${esc(b.name)}</div>
      <div class="sub"><span class="rarity ${b.rarity.id}">${b.rarity.label}</span><span>${esc(who(b.from, 16))}</span></div></div>
      ${here(b) ? '' : '<span class="flag gone">Left</span>'}`;
    el.onclick = () => open(b);
    lazyPortrait(el.querySelector('img'), b);
    frag.appendChild(el);
  }
  shown = Math.min(list.length, shown + PAGE);
  $('tiles').appendChild(frag);
  $('more').hidden = shown >= list.length;
  $('more').textContent = `Show more (${fmt(list.length - shown)} left)`;
}
// keep loading as you scroll
if (typeof IntersectionObserver === 'function') new IntersectionObserver((e) => { if (e[0].isIntersecting && !$('more').hidden) more(); }, { rootMargin: '800px 0px' }).observe($('more'));

// ---------- one Blocky ----------

const d = $('detail');
d.querySelector('.close').onclick = () => d.close();
d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
d.addEventListener('close', () => history.replaceState(null, '', location.pathname + location.search));

function open(b) {
  const now = Date.now(), blocks = sim.blocksBy(b, now);
  const end = here(b) ? now : b.leftAt;
  d.querySelector('img').src = portraitUrl(b, { size: 1024, label: true });
  d.querySelector('img').alt = `${b.name}, a ${b.rarity.label} Blocky`;
  const citizen = citizenAt(b) <= now;
  $('d-eyebrow').textContent = `${CONFIG.citizen.toUpperCase()} #${b.id} · ${!here(b) ? 'LEFT THE CITY' : citizen ? 'CITIZEN' : 'NEWCOMER'}`;
  $('d-name').textContent = b.name;
  $('d-tags').innerHTML = `<span class="rarity ${b.rarity.id}">${b.rarity.label}</span>${b.trait ? `<span>${esc(TRAIT_LABEL[b.trait])}</span>` : ''}<span>· ${esc(b.role.label)}</span>`;
  const rows = [
    ['Blocks placed', fmt(blocks)],
    [here(b) ? 'Building for' : 'Built for', `${fmt((end - b.arrivedAt) / 3600000)} hours`],
    ['Arrived', day(b.arrivedAt)],
    ...(here(b) ? (Number.isFinite(citizenAt(b)) ? [[citizen ? 'Citizen since' : 'Citizen on', day(citizenAt(b))]] : [['NFT', 'when trading opens']]) : [['Left', day(b.leftAt)]]),
    [teamReserve(b) ? 'Team reserve' : 'Brought by', b.from ? `<a href="${basescan(`address/${b.from}`)}" target="_blank" rel="noopener" title="${esc(b.from)}">${esc(who(b.from, 30))}</a>` : '—'],
  ];
  $('d-dl').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const site = CONFIG.siteUrl || location.origin;
  const text = `${b.name} is a ${b.rarity.label}${b.trait ? ` (${TRAIT_LABEL[b.trait]})` : ''} Blocky building ${CONFIG.cityName} on Base: ${fmt(blocks)} blocks placed so far.${CONFIG.xHandle ? ` @${CONFIG.xHandle}` : ''}`;
  $('d-actions').innerHTML = `<button class="btn primary" type="button" data-act="png">⬇ PNG</button>
    ${info.contract && here(b) && citizen ? `<a class="btn" href="${opensea(info.contract, b.id)}" target="_blank" rel="noopener">OpenSea ↗</a><a class="btn" href="${basescan(`nft/${info.contract}/${b.id}`)}" target="_blank" rel="noopener">Basescan ↗</a>` : ''}
    <a class="btn" href="https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${site}/collection.html#${b.id}`)}" target="_blank" rel="noopener">Share on 𝕏</a>
    <a class="btn" href="/claim.html${b.from ? `?address=${b.from}` : ''}">Claim page</a>`;
  d.querySelector('[data-act="png"]').onclick = () => downloadSvgPng(blockySvg(b, { size: 1024 }), b.name);
  history.replaceState(null, '', `#${b.id}`);
  if (!d.open) d.showModal();
}

(async () => {
  controls();
  $('shown').textContent = 'Loading…';
  const [state, nft] = await Promise.all([fetchColony().catch(() => null), nftInfo()]);
  info = nft;
  addNames(state?.names);
  const r = replay(state);
  all = r.blockies;
  sim = r.sim;
  stats(state);
  sidebar();
  apply();
  const n = Number(location.hash.slice(1));
  if (n && all[n - 1]) open(all[n - 1]);
})();
