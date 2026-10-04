import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { createCity } from './city.js';
import { BuilderView } from './citizens.js';
import { createTraffic } from './vehicles.js';
import { createSky } from './sky.js';
import { makeBuilder, blocksBy, CitySim, PITCH } from './sim.js';
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
$('next-label').textContent = `Next ${CONFIG.citizen}`;
$('pop-label').textContent = plural;
$('leaders-title').textContent = `Top ${plural}`;
$('fee-target').textContent = usd(PER);
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
  `Buy <em>${usd(PER)}</em> of ${CONFIG.ticker}, bring a <em>new ${CONFIG.citizen}</em>`,
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
let idleTimer;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
controls.addEventListener('end', () => { idleTimer = setTimeout(() => (controls.autoRotate = true), 8000); });

const city = createCity(scene);
const traffic = createTraffic(city);
const sky = createSky(city);
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
let fees = 0; // USD counted toward new Blockies (buys, or fees in fee mode)
let bought = 0;
let crewInfo = []; // who brought each Blocky
const loggedBuys = new Set();
let population = 0;
let lastQueued = 0; // highest Blocky id already spawned or waiting for the airship
const arrivalQueue = [];
let selected = null;
let following = false;

function addBuilder(id, arrivedAt, arriving) {
  const b = makeBuilder(id, id === 1 ? cityStart : Math.max(cityStart, arrivedAt));
  builders[id - 1] = b;
  views[id - 1] = new BuilderView(b, city, { arriving });
  return views[id - 1];
}

function nextUnlockText() {
  const next = CONFIG.landmarks.find((l) => l.at > population);
  const landTxt = `Land ${size(sim.land)}`;
  $('next-unlock').innerHTML = next
    ? `${landTxt} · Next landmark: <b>${next.label}</b> at ${next.at} ${plural}`
    : `${landTxt} · Every landmark unlocked`;
}

function applyState(s, first) {
  if (!s) return;
  const buys = s.mode !== 'fees';
  const labels = { demo: 'Demo mode: simulated buys', override: 'Test mode: fixed number', prelaunch: 'No fees yet: the founder builds alone' };
  const check = $('check-live');
  check.textContent = labels[s.source] || (buys ? 'Buys tracked onchain, live' : 'Creator fees tracked onchain, live');
  check.classList.toggle('demo', s.source in labels);
  $('fees-label').textContent = buys ? 'Bought' : 'Fees earned';

  if (!first && s.progressUsd - fees > 0.0001) city.feePulse();
  fees = Math.max(fees, s.progressUsd);
  bought = Math.max(bought, s.boughtUsd ?? fees);
  if (s.crew) crewInfo = s.crew;
  for (const b of [...(s.recentBuys || [])].reverse()) {
    const key = `${b.at}|${b.from}|${b.usd}`;
    if (loggedBuys.has(key)) continue;
    loggedBuys.add(key);
    if (!first) log(`🛒 ${short(b.from)} bought ${usd(b.usd)}${b.blockies ? ` → +${b.blockies} ${b.blockies > 1 ? plural : CONFIG.citizen}` : ''}`, b.at);
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
      const by = crewInfo[flight.id - 1];
      toast(`NEW ${CONFIG.citizen.toUpperCase()} JOINED`, v.b.name, by ? `${v.b.role.label} · brought by ${short(by.from)}` : v.b.role.label);
      log(`👷 ${v.b.name} joined${by ? `, brought by ${short(by.from)}` : ` as ${v.b.role.label}`}`, now(), v.b.id);
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

function log(html, when = now(), id) {
  const li = document.createElement('li');
  if (id) li.dataset.id = id;
  li.innerHTML = `<span>${html}</span><b class="muted" data-at="${when}">${ago(when)}</b>`;
  const ul = $('feed');
  ul.prepend(li);
  while (ul.children.length > 7) ul.lastChild.remove();
}

const logLine = (p) => (p.kind === 'expand' ? `🌍 Land expanded to ${size(p.level)}` : p.kind === 'landmark' ? `🏛️ ${p.name} built` : `🏗️ ${p.name} completed`);

function renderHud() {
  if (!sim) return;
  const per = PER;
  const progress = Math.max(0, Math.min(per, fees - (lastQueued - 1) * per));
  $('fee-progress').textContent = usd(progress);
  $('bar-fill').style.width = `${(progress / per) * 100}%`;
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
  } else {
    $('site-name').textContent = a.name;
    $('site-pct').textContent = `${pct}%`;
    $('site-fill').style.width = `${pct}%`;
  }
  const day = Math.floor((now() - cityStart) / 86400000) + 1;
  $('clock').textContent = `Day ${day} · ${city.env.daylight < 0.5 ? '🌙 Night shift' : '☀️ Day shift'}`;
  for (const el of document.querySelectorAll('#feed [data-at]')) el.textContent = ago(+el.dataset.at);
}

function renderLeaders() {
  const ts = now();
  const top = views.filter(Boolean).sort((a, b) => blocksBy(b.b, ts) - blocksBy(a.b, ts)).slice(0, 5);
  $('leaders').innerHTML = top
    .map((v, i) => `<li data-id="${v.b.id}"><span><span class="rank">${i + 1}</span>${v.b.name} <span class="muted">· ${v.b.role.label}</span></span><b>${fmt(blocksBy(v.b, ts))} 🧱</b></li>`)
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
  const b = selected.b, ts = now(), placed = blocksBy(b, ts);
  $('card-eyebrow').textContent = `${CONFIG.citizen.toUpperCase()} #${b.id}${b.id === 1 ? ' · FOUNDER' : ''}`;
  $('card-name').textContent = b.name;
  $('card-role').textContent = `${b.legend ? `★ ${b.legend.label} · ` : ''}${b.role.label} · ${b.rate.toFixed(0)} blocks/h`;
  $('card-status').textContent = selected.status;
  $('card-blocks').textContent = fmt(placed);
  $('card-hours').textContent = fmt((ts - b.arrivedAt) / HOUR);
  $('card-share').textContent = `${sim.work ? ((placed / sim.work) * 100).toFixed(1) : 0}%`;
  $('card-joined').textContent = ago(b.arrivedAt);
  const by = crewInfo[b.id - 1];
  $('card-by').textContent = b.id === 1 ? 'Founder' : by ? `${short(by.from)} (${usd(by.usd)} buy)` : '—';
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
  const text = `${CONFIG.cityName}: ${sim.buildingCount} buildings on ${size(sim.land)} land, built 24/7 by ${crew}, the builders of Base. Buy ${usd(PER)} of ${CONFIG.ticker} to bring a new ${CONFIG.citizen}.`
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
  select(hits[0]?.object.userData.builder ?? null);
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
  requestAnimationFrame(frame);
}

(async () => {
  const s = await fetchColony();
  applyState(s, true);
  stepCity(false);
  resize();
  for (const p of sim.done.slice(-5)) log(logLine(p), p.at);
  renderLeaders();
  renderHud();
  welcomeBack();
  requestAnimationFrame(frame);
  setInterval(async () => applyState(await fetchColony(), false), s.source === 'demo' ? 2000 : CONFIG.pollMs);
})();

window.blocky = { city, builders, views, get sim() { return sim; } };
