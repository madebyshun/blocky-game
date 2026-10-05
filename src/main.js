import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { createCity } from './city.js';
import { BuilderView } from './citizens.js';
import { createTraffic } from './vehicles.js';
import { createSky } from './sky.js';
import { createWeather, WEATHER } from './weather.js';
import { computeDistricts } from './districts.js';
import { makeBuilder, CitySim, PITCH, tierOf } from './sim.js';
import { fetchColony } from './data.js';
import { createAirship } from './airship.js';
import { now } from './time.js';

const $ = (id) => document.getElementById(id);
const usd = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const plural = CONFIG.citizenPlural || `${CONFIG.citizen}s`;
const HOUR = 3600000;
const size = (L) => `${2 * L + 1}×${2 * L + 1}`;
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const PER = CONFIG.usdPerBlocky;
const TIERS = CONFIG.tiers;
const money = (v) => (v >= 1000 ? `$${v / 1000}k` : `$${v}`);
const BADGE = { base: '🔷', whale: '🐋' };
const badge = (b) => (b.legend ? '★ ' : BADGE[b.tier.id] ? `${BADGE[b.tier.id]} ` : '');
function dur(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

function ago(ms) {
  const s = Math.max(0, (now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---------- static copy ----------

document.title = `${CONFIG.cityName} · ${CONFIG.tagline}`;
$('title').textContent = CONFIG.cityName;
$('tagline').textContent = CONFIG.tagline;
$('pop-label').textContent = plural;
$('leaders-title').textContent = `Top ${plural}`;
$('tiers').innerHTML = TIERS.map((t) => `<span class="tier ${t.id}"><b>${money(t.min)}+</b> ${BADGE[t.id] || ''}${t.id === 'blocky' ? CONFIG.citizen : t.label} <em>${t.skill[0]}${t.skill[1] > t.skill[0] ? `–${t.skill[1]}` : ''}×</em></span>`).join('');
$('tiers').title = 'One buy brings one Blocky. Bigger buys bring more skilled builders.';
if (CONFIG.buyUrl) { $('buy').hidden = false; $('buy').href = CONFIG.buyUrl; $('buy').textContent = `Buy ${CONFIG.ticker}`; }
if (CONFIG.chartUrl) { $('chart').hidden = false; $('chart').href = CONFIG.chartUrl; }
if (CONFIG.tokenAddress) {
  const ca = $('ca'), a = CONFIG.tokenAddress;
  const label = `CA ${a.slice(0, 6)}…${a.slice(-4)} ⧉`;
  ca.hidden = false;
  ca.textContent = label;
  ca.onclick = async () => {
    try { await navigator.clipboard.writeText(a); ca.textContent = 'Copied ✓'; } catch { ca.textContent = a; }
    setTimeout(() => (ca.textContent = label), 1500);
  };
}

const CAPTIONS = [
  `Every buy shows up in the <em>city log</em>`,
  `Buy <em>${money(PER)}+</em> of ${CONFIG.ticker}, bring a <em>new ${CONFIG.citizen}</em>`,
  `<em>${money(TIERS[1].min)}+</em> brings a <em>${TIERS[1].label}</em>: ${TIERS[1].skill[0]}× skill, builds skyscrapers`,
  `<em>${money(TIERS[2].min)}+</em> brings a <em>${TIERS[2].label}</em> and a fountain with its name`,
  `Real Base builders live here as <em>legends</em>`,
  `${plural} build <em>24/7</em>, even when no one is watching`,
  `Land full? More ${plural} <em>expand the land</em>`,
  `The ${plural} are <em>simulated</em>. The buys are <em>real</em>.`,
];
let capIdx = 0;
function rotateCaption() {
  const el = $('caption');
  el.style.opacity = 0;
  setTimeout(() => { el.innerHTML = CAPTIONS[capIdx++ % CAPTIONS.length]; el.style.opacity = 1; }, 400);
}
rotateCaption();
setInterval(rotateCaption, 4500);

// ---------- three.js setup ----------

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera();
camera.position.set(40, 34, 40);
camera.zoom = innerWidth < innerHeight ? 1.5 : 1.05;
const controls = new OrbitControls(camera, canvas);
Object.assign(controls, {
  enableDamping: true, enablePan: false, autoRotate: true, autoRotateSpeed: 0.3,
  minZoom: 0.6, maxZoom: 6, minPolarAngle: 0.5, maxPolarAngle: 1.2,
});
// Auto-rotate is a preference (button or R key) and always stops in photo mode, so screenshots
// and screen recordings hold still. ?still starts without rotation, ?photo starts in photo mode.
const qs = new URLSearchParams(location.search);
let rotatePref = !qs.has('still');
try { if (localStorage.getItem('basecity:rotate') === '0') rotatePref = false; } catch { /* ignore */ }
let photo = false;
let idleTimer;
const syncRotate = () => {
  controls.autoRotate = rotatePref && !photo;
  $('rotate-btn').textContent = rotatePref ? '⟳ Rotating' : '⟳ Rotate: off';
  $('rotate-btn').classList.toggle('on', rotatePref);
};
function setRotate(on) {
  rotatePref = on;
  try { localStorage.setItem('basecity:rotate', on ? '1' : '0'); } catch { /* ignore */ }
  syncRotate();
}
function setPhoto(on) {
  photo = on;
  document.body.classList.toggle('photo', on);
  syncRotate();
}
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
controls.addEventListener('end', () => { idleTimer = setTimeout(syncRotate, 8000); });
$('rotate-btn').onclick = () => setRotate(!rotatePref);
$('photo-btn').onclick = () => setPhoto(true);
$('photo-exit').onclick = () => setPhoto(false);
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === 'r' || e.key === 'R') setRotate(!rotatePref);
  if (e.key === 'p' || e.key === 'P') setPhoto(!photo);
  if (e.key === 'Escape' && photo) setPhoto(false);
});
syncRotate();
if (qs.has('photo')) setPhoto(true);

const city = createCity(scene);
const traffic = createTraffic(city);
const sky = createSky(city);
const weather = createWeather(city);
let market = null;
const airship = createAirship();
airship.visible = false;
city.root.add(airship);

function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  const H = Math.max(2, city.land) * PITCH + 4; // isometric square of half-width H: ~2.9H wide, ~1.9H tall
  const s = Math.max(H * 1.9, (H * 2.9) / aspect, 30) * 1.05;
  Object.assign(camera, { left: (-s * aspect) / 2, right: (s * aspect) / 2, top: s / 2, bottom: -s / 2, near: -400, far: 400 });
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener('resize', resize);

// ---------- colony state ----------

let sim = null;
let cityStart = 0;
const builders = []; // data, index = id - 1
const views = [];
let bought = 0; // USD bought (or fees earned in fee mode)
let pot = 0; // small buys waiting to add up to one Blocky
let crewInfo = []; // who brought each Blocky
const loggedBuys = new Set();
let population = 0;
let lastQueued = 0; // highest Blocky id already spawned or waiting for the airship
const arrivalQueue = [];
let selected = null;
let following = false;

function addBuilder(id, arrivedAt, arriving) {
  const taken = new Set(builders.filter(Boolean).map((x) => x.legendIdx).filter((i) => i >= 0));
  const b = makeBuilder(id, id === 1 ? cityStart : Math.max(cityStart, arrivedAt), crewInfo[id - 1], taken);
  builders[id - 1] = b;
  views[id - 1] = new BuilderView(b, city, { arriving });
  return views[id - 1];
}

// the community goal: the next landmark unlocked by the Blocky count
function nextUnlockText() {
  const next = CONFIG.landmarks.find((l) => l.at > population);
  $('goal-name').textContent = next ? next.label : 'Every landmark unlocked';
  $('goal-count').textContent = next ? `${population}/${next.at}` : '';
  $('bar-fill').style.width = `${next ? (population / next.at) * 100 : 100}%`;
  const bits = [`Land ${size(sim.land)}`];
  if (!sim.pro) bits.push(`🔒 Skyscrapers &amp; big rides need a <b>${TIERS[1].label}</b> (${money(TIERS[1].min)}+ buy)`);
  if (pot > 0.009) bits.push(`Pot ${usd(pot)}/${usd(PER)}`);
  $('next-unlock').innerHTML = bits.join(' · ');
}

function applyState(s, first) {
  if (!s) return;
  const buys = s.mode !== 'fees';
  const labels = { demo: 'Demo mode: simulated buys', override: 'Test mode: fixed number', prelaunch: 'No fees yet: the founder builds alone' };
  const check = $('check-live');
  check.textContent = labels[s.source] || (buys ? 'Buys tracked onchain, live' : 'Creator fees tracked onchain, live');
  check.classList.toggle('demo', s.source in labels);
  $('fees-label').textContent = buys ? 'Bought' : 'Fees earned';

  const total = s.boughtUsd ?? s.progressUsd;
  if (!first && total - bought > 0.0001) city.feePulse();
  bought = Math.max(bought, total);
  pot = s.potUsd ?? 0;
  if (s.crew) crewInfo = s.crew;
  if (s.market) { market = s.market; weather.setMarket(market); }
  for (const b of [...(s.recentBuys || [])].reverse()) {
    const key = `${b.at}|${b.from}|${b.usd}`;
    if (loggedBuys.has(key)) continue;
    loggedBuys.add(key);
    if (first) continue;
    const small = b.pot ?? b.usd < PER, tier = tierOf(b.usd);
    const what = small ? (b.blockies ? `, the pot is full: +1 ${CONFIG.citizen}` : ' → community pot') : ` → ${tier.id === 'blocky' ? `+1 ${CONFIG.citizen}` : `${BADGE[tier.id] || ''} ${tier.label}`}`;
    log(`🛒 ${short(b.from)} bought ${usd(b.usd)}${what}`, b.at);
    if (!small && tier.pro) {
      const whale = tier.wonder;
      weather.celebrate();
      if (whale) { setTimeout(() => weather.celebrate(), 900); setTimeout(() => weather.celebrate(), 1800); }
      news.unshift(whale
        ? `<b>WHALE ALERT:</b> ${short(b.from)} just bought ${usd(b.usd)}. A Whale is flying in and the city starts a fountain in its name!`
        : `<b>BIG BUY:</b> ${short(b.from)} just bought ${usd(b.usd)}. A ${tier.label} is on the way. Fireworks over the Statue of Blockerty!`);
    }
  }

  const target = Math.max(1, s.population);
  if (first) {
    cityStart = s.cityStart ?? (CONFIG.cityStart ? Date.parse(CONFIG.cityStart) : now());
    sim = new CitySim(cityStart);
    const ts = now();
    for (let id = 1; id <= target; id++) addBuilder(id, s.arrivals?.[id - 1] ?? ts - (target - id + 1) * 30 * 60 * 1000, false);
    population = lastQueued = target;
    sim.setBuilders(builders.filter(Boolean));
  } else {
    for (let id = lastQueued + 1; id <= target; id++) arrivalQueue.push({ id, at: s.arrivals?.[id - 1] ?? now() });
    lastQueued = Math.max(lastQueued, target);
  }
  nextUnlockText();
  renderHud();
}

// ---------- airship arrivals ----------

const PAD = new THREE.Vector3(city.helipad[0], 1.6, city.helipad[1]);
const FROM = new THREE.Vector3(70, 24, 46);
let flight = null;

function updateAirship(dt) {
  if (!flight && arrivalQueue.length) {
    flight = { ...arrivalQueue.shift(), t: 0, phase: 'in' };
    airship.visible = true;
  }
  if (!flight) return;
  const rush = arrivalQueue.length > 2 ? 3 : 1;
  flight.t += (dt / 3.5) * rush;
  airship.userData.prop.rotation.x += dt * 25;
  if (flight.phase === 'in') {
    const t = Math.min(1, flight.t), k = 1 - Math.pow(1 - t, 3);
    airship.position.copy(FROM).lerp(PAD, k);
    airship.rotation.y = Math.atan2(FROM.z - PAD.z, PAD.x - FROM.x);
    if (t >= 1) {
      flight.phase = 'dock'; flight.t = 0;
      const v = addBuilder(flight.id, flight.at, true);
      population = flight.id;
      sim.setBuilders(builders.filter(Boolean));
      const b = v.b, by = crewInfo[flight.id - 1];
      const head = b.legend ? '★ LEGEND ARRIVED' : b.tier.id === 'whale' ? '🐋 WHALE ARRIVED' : b.tier.pro ? `🔷 ${b.tier.label.toUpperCase()} ARRIVED` : `NEW ${CONFIG.citizen.toUpperCase()} JOINED`;
      toast(head, b.name, `${b.role.label} · ${b.skill.toFixed(1)}× skill${by ? ` · brought by ${short(by.from)}` : ''}`);
      if (b.tier.pro) weather.celebrate();
      log(`${b.legend ? '★' : b.tier.pro ? BADGE[b.tier.id] : '👷'} ${b.name} joined${b.tier.pro ? ` as ${b.tier.label}` : ''}${by ? `, brought by ${short(by.from)}` : ''}`, now(), b.id);
      stepCity(true);
      nextUnlockText();
      renderHud();
    }
  } else if (flight.phase === 'dock') {
    airship.position.copy(PAD);
    if (flight.t > 0.5) { flight.phase = 'out'; flight.t = 0; }
  } else {
    const t = Math.min(1, flight.t);
    airship.position.set(PAD.x - t * t * 60, PAD.y + t * t * 20, PAD.z + t * t * 36);
    airship.rotation.y = Math.atan2(-36, -60);
    if (t >= 1) { airship.visible = false; flight = null; }
  }
}

// ---------- HUD ----------

let toastTimer;
function toast(eyebrow, big, sub = '') {
  const el = $('toast');
  el.innerHTML = `<div class="eyebrow">${eyebrow}</div><div class="big">${big}</div>${sub ? `<div class="label">${sub}</div>` : ''}`;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

const news = []; // freshest first; read by the ticker
function log(html, when = now(), id) {
  news.unshift(`<b>BREAKING:</b> ${html.replace(/^\S+\s/, '')}`);
  news.length = Math.min(news.length, 6);
  const li = document.createElement('li');
  if (id) li.dataset.id = id;
  li.innerHTML = `<span>${html}</span><b class="muted" data-at="${when}">${ago(when)}</b>`;
  const ul = $('feed');
  ul.prepend(li);
  while (ul.children.length > 7) ul.lastChild.remove();
}

const logLine = (p) => (p.kind === 'expand' ? `🌍 Land expanded to ${size(p.level)}`
  : p.kind === 'landmark' ? `🏛️ ${p.name} built`
  : p.kind === 'wonder' ? `⛲ Whale Fountain built, gifted by ${short(p.whale.from) || 'a whale'}`
  : `🏗️ ${p.name} completed`);

function renderHud() {
  if (!sim) return;
  $('pop').textContent = population;
  $('fees').textContent = usd(bought);
  $('buildings').textContent = fmt(sim.buildingCount);
  $('blocks').textContent = fmt(sim.work ?? 0);
  const a = sim.next;
  const pct = Math.min(99, Math.floor((sim.placed / a.cost) * 100));
  const panel = document.querySelector('.progress');
  panel.classList.toggle('blocked', !!sim.blocked);
  if (sim.blocked) {
    $('site-name').textContent = `Land full: need ${sim.blocked.need} ${plural}`;
    $('site-pct').textContent = `${sim.blocked.have}/${sim.blocked.need}`;
    $('site-fill').style.width = `${(sim.blocked.have / sim.blocked.need) * 100}%`;
    $('site-eta').textContent = `${sim.blocked.need - sim.blocked.have} more ${plural} to reclaim new land`;
  } else {
    $('site-name').textContent = a.name;
    $('site-pct').textContent = `${pct}%`;
    $('site-fill').style.width = `${pct}%`;
    $('site-eta').textContent = sim.eta != null ? `~${dur(sim.eta)} left · crew speed ${Math.round(sim.rate)} blocks/h` : '';
  }
  const day = Math.floor((now() - cityStart) / 86400000) + 1;
  $('clock').textContent = `Day ${day} · ${city.env.daylight < 0.5 ? '🌙 Night shift' : '☀️ Day shift'}`;
  const w = WEATHER[weather.kind], wEl = $('weather');
  wEl.hidden = false;
  wEl.textContent = `${w.icon} ${w.label}${market ? ` · ${CONFIG.ticker} ${market.change24h >= 0 ? '+' : ''}${market.change24h.toFixed(1)}% 24h` : ''}`;
  for (const el of document.querySelectorAll('#feed [data-at]')) el.textContent = ago(+el.dataset.at);
}

function renderLeaders() {
  const ts = now();
  const top = views.filter(Boolean).sort((a, b) => sim.blocksBy(b.b, ts) - sim.blocksBy(a.b, ts)).slice(0, 5);
  $('leaders').innerHTML = top
    .map((v, i) => `<li data-id="${v.b.id}"><span><span class="rank">${i + 1}</span>${badge(v.b)}${v.b.name} <span class="muted">· ${v.b.role.label}</span></span><b>${fmt(sim.blocksBy(v.b, ts))} 🧱</b></li>`)
    .join('');
}

for (const id of ['leaders', 'feed']) {
  $(id).addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-id]');
    if (li) select(views[li.dataset.id - 1], true);
  });
}

function renderCard() {
  if (!selected) return;
  const b = selected.b, ts = now(), placed = sim.blocksBy(b, ts);
  $('card-eyebrow').textContent = `${CONFIG.citizen.toUpperCase()} #${b.id}${b.id === 1 ? ' · FOUNDER' : b.legend ? ' · ★ LEGEND' : b.tier.pro ? ` · ${b.tier.label.toUpperCase()}` : ''}`;
  $('card-name').textContent = b.name;
  $('card-role').textContent = [b.role.label, b.id !== 1 && b.tier.label !== b.role.label ? b.tier.label : null, `${b.skill.toFixed(1)}× skill`].filter(Boolean).join(' · ');
  $('card-status').textContent = selected.status;
  $('card-blocks').textContent = fmt(placed);
  $('card-hours').textContent = fmt((ts - b.arrivedAt) / HOUR);
  $('card-share').textContent = `${sim.work ? ((placed / sim.work) * 100).toFixed(1) : 0}%`;
  $('card-joined').textContent = ago(b.arrivedAt);
  const by = crewInfo[b.id - 1];
  $('card-by').textContent = b.id === 1 ? 'Founder' : by?.pot ? `the community pot (filled by ${short(by.from)})` : by ? `${short(by.from)} (${usd(by.usd)} buy)` : '—';
  $('card-follow').textContent = following ? 'Stop following' : 'Follow';
}

function select(v, follow = false) {
  if (selected) selected.setSelected(false);
  selected = v || null;
  following = !!(v && follow);
  $('card').hidden = !selected;
  if (selected) { selected.setSelected(true); renderCard(); }
}
$('card-close').onclick = () => select(null);
$('card-follow').onclick = () => { following = !following; renderCard(); };

$('share').onclick = () => {
  const url = CONFIG.siteUrl || location.origin;
  const crew = `${population} ${population === 1 ? CONFIG.citizen : plural}`;
  const text = `${CONFIG.cityName}: ${sim.buildingCount} buildings on ${size(sim.land)} land, built 24/7 by ${crew}, the builders of Base. Buy ${money(PER)}+ of ${CONFIG.ticker} to bring a ${CONFIG.citizen}, ${money(TIERS[1].min)}+ for a ${TIERS[1].label}.`
    + (CONFIG.tokenAddress ? `\n\nCA: ${CONFIG.tokenAddress}` : '');
  const via = CONFIG.xHandle ? `&via=${CONFIG.xHandle}` : '';
  open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}${via}`, '_blank', 'noopener');
};

// ---------- picking ----------

const ray = new THREE.Raycaster();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const p = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(p, camera);
  const hits = ray.intersectObjects(views.filter(Boolean).map((v) => v.hit), false);
  if (hits[0]) return select(hits[0].object.userData.builder);
  const board = ray.intersectObjects(city.billboards, false)[0]?.object.userData.sponsor;
  if (board?.url) { open(board.url, '_blank', 'noopener'); return; }
  select(null);
});

// ---------- the 24/7 build ----------

let shownLand = 0;
function stepCity(animate) {
  const finished = sim.advance(now());
  city.sync(sim, animate);
  city.waiting = !!sim.blocked;
  if (city.land !== shownLand) { shownLand = city.land; resize(); }
  if (!animate) return;
  for (const p of finished) {
    log(logLine(p));
    if (p.kind === 'expand') toast('LAND EXPANDED', size(p.level), `${plural} reclaimed a new ring of land`);
    if (p.kind === 'landmark') toast('LANDMARK BUILT', p.name);
    if (p.kind === 'wonder') { toast('⛲ WONDER BUILT', 'Whale Fountain', `gifted by ${short(p.whale.from) || 'a whale'}`); weather.celebrate(); }
  }
}

function welcomeBack() {
  const KEY = 'basecity:lastVisit';
  try {
    const prev = JSON.parse(localStorage.getItem(KEY) || 'null');
    const built = prev && prev.start === cityStart ? sim.buildingCount - prev.done : 0;
    if (built > 0) toast('WHILE YOU WERE AWAY', `+${built} building${built > 1 ? 's' : ''}`, `built in the last ${ago(prev.at).replace(' ago', '')}`);
    const save = () => localStorage.setItem(KEY, JSON.stringify({ done: sim.buildingCount, at: now(), start: cityStart }));
    save();
    setInterval(save, 30000);
  } catch { /* storage unavailable: skip */ }
}

// ---------- districts: names floating over the neighbourhoods ----------

let districts = [];
let districtsFor = -1;
const districtEls = new Map();
const proj = new THREE.Vector3();
function updateDistricts() {
  if (sim.done.length !== districtsFor) {
    districtsFor = sim.done.length;
    districts = computeDistricts(sim.done);
    for (const d of districts) {
      let el = districtEls.get(d.key);
      if (!el) { el = document.createElement('div'); el.className = 'district'; $('districts').appendChild(el); districtEls.set(d.key, el); }
      el.innerHTML = `${d.name}<small>${d.buildings} buildings</small>`;
    }
  }
  for (const d of districts) {
    const el = districtEls.get(d.key);
    proj.set(d.x, 9, d.z);
    city.root.localToWorld(proj).project(camera);
    el.style.left = `${((proj.x + 1) / 2) * innerWidth}px`;
    el.style.top = `${((1 - proj.y) / 2) * innerHeight}px`;
    el.style.opacity = Math.abs(proj.x) > 0.95 || Math.abs(proj.y) > 0.95 ? 0 : 1;
  }
}

// ---------- SimCity-style news ticker ----------

const FILLER = [
  'gm Café reports record coffee sales as the night shift clocks in',
  'Blockies petition City Hall for more parks',
  'Local dev ships on a Friday. The city survives',
  'Gas stays low, Blockies celebrate with ice cream',
  'Traffic builds up on the river bridges at rush hour',
  'Gulls spotted near the Statue of Blockerty again',
  'Onchain summer never ends in BaseCity',
  'Roller coaster queue hits a new record',
  'Builders remind everyone: wear your hard hat',
];
function headlines() {
  const out = [...news.slice(0, 4)];
  const w = WEATHER[weather.kind];
  if (market) out.push(`<b>WEATHER:</b> ${w.label} over ${CONFIG.cityName} as ${CONFIG.ticker} ${market.change24h >= 0 ? 'climbs' : 'slips'} ${Math.abs(market.change24h).toFixed(1)}% in 24h`);
  if (sim.blocked) out.push(`<b>CITY HALL:</b> the land is full. ${sim.blocked.need - sim.blocked.have} more ${plural} needed to expand`);
  const next = CONFIG.landmarks.find((l) => l.at > population);
  if (next) out.push(`<b>COMING SOON:</b> ${next.label} breaks ground at ${next.at} ${plural}`);
  if (!sim.pro) out.push(`<b>HELP WANTED:</b> ${CONFIG.cityName} needs a ${TIERS[1].label} for its first skyscraper. ${money(TIERS[1].min)}+ buys bring one`);
  const legends = builders.filter((b) => b?.legendIdx >= 0).length;
  if (CONFIG.legends?.length) out.push(`<b>LEGENDS:</b> ${legends} of ${CONFIG.legends.length} real Base builders live in ${CONFIG.cityName}${legends < CONFIG.legends.length ? `. The next ${TIERS[1].label} arrives as ${CONFIG.legends.find((l, i) => !l.wallet && !builders.some((b) => b?.legendIdx === i))?.name ?? 'a legend'}` : ''}`);
  const top = views.filter(Boolean).sort((a, b) => sim.blocksBy(b.b, now()) - sim.blocksBy(a.b, now()))[0];
  const topBlocks = top ? sim.blocksBy(top.b, now()) : 0;
  if (topBlocks >= 2) out.push(`<b>BUILDER OF THE DAY:</b> ${top.b.name}, ${fmt(topBlocks)} blocks placed`);
  const big = [...districts].sort((a, b) => b.buildings - a.buildings)[0];
  if (big && districts.length > 1) out.push(`<b>DISTRICTS:</b> ${big.name} leads with ${big.buildings} buildings`);
  for (let i = 0; i < 2; i++) out.push(FILLER[Math.floor(Math.random() * FILLER.length)]);
  const sponsors = CONFIG.sponsors || [];
  if (sponsors.length) { const sp = sponsors[Math.floor(Math.random() * sponsors.length)]; out.push(`<b>${sp.sponsored ? 'SPONSORED' : 'BUILT ON BASE'}:</b> ${sp.name}${sp.tagline ? `, ${sp.tagline}` : ''}`); }
  if (Math.random() < 0.5 || !sponsors.length) out.push(`<b>ADVERTISE:</b> put your Base project on ${CONFIG.cityName} billboards${CONFIG.adContact || CONFIG.xHandle ? `. ${CONFIG.adContact || `DM @${CONFIG.xHandle}`}` : ''}`);
  out.push(`<b>${CONFIG.ticker}:</b> buy ${money(PER)}+ for a ${CONFIG.citizen}, ${money(TIERS[1].min)}+ for a ${TIERS[1].label}, ${money(TIERS[2].min)}+ for a ${TIERS[2].label} and a fountain`);
  return out;
}
function refreshTicker() {
  const el = $('ticker');
  el.innerHTML = headlines().join('<span class="sep">◆</span>');
  el.style.animationDuration = `${Math.max(30, el.textContent.length * 0.16)}s`;
}
$('ticker').addEventListener('animationiteration', refreshTicker);

// ---------- loop ----------

const clock = new THREE.Timer();
let simAcc = 0, slowAcc = 0;
const tmp = new THREE.Vector3();
const home = new THREE.Vector3();

function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.getElapsed();

  city.update(t, dt);
  traffic.update(t, dt);
  sky.update(t, dt);
  weather.update(t, dt);
  for (const v of views) v?.update(t, dt);
  updateAirship(dt);

  simAcc += dt;
  if (simAcc > 0.5) { simAcc = 0; stepCity(true); }
  slowAcc += dt;
  if (slowAcc > 1) { slowAcc = 0; renderLeaders(); renderCard(); renderHud(); nextUnlockText(); }

  if (selected && following) {
    selected.group.getWorldPosition(tmp);
    controls.target.lerp(tmp, Math.min(1, dt * 3));
  } else {
    controls.target.lerp(home, Math.min(1, dt * 2));
  }
  controls.update();
  renderer.render(scene, camera);
  updateDistricts();
  requestAnimationFrame(frame);
}

(async () => {
  const s = await fetchColony();
  applyState(s, true);
  stepCity(false);
  resize();
  for (const p of sim.done.slice(-5)) log(logLine(p), p.at);
  renderLeaders();
  updateDistricts();
  renderHud();
  refreshTicker();
  welcomeBack();
  requestAnimationFrame(frame);
  setInterval(async () => applyState(await fetchColony(), false), s.source === 'demo' ? 2000 : CONFIG.pollMs);
})();

window.blocky = { city, builders, views, get sim() { return sim; } };
