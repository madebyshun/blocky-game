import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { createWorld, createAirship, SITES } from './world.js';
import { CitizenView, Floaters } from './citizens.js';
import { makeCitizen, advance, stats } from './sim.js';
import { fetchColony } from './data.js';

const $ = (id) => document.getElementById(id);
const usd = (v, sign = false) => `${sign ? (v >= 0 ? '+' : '-') : v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
const plural = CONFIG.citizen.endsWith('y') ? CONFIG.citizen.slice(0, -1) + 'ies' : CONFIG.citizen + 's';

// ---------- static copy ----------

document.title = `${CONFIG.name} · a floating island that grows with every trade`;
$('title').textContent = CONFIG.name;
$('next-label').textContent = `NEXT ${CONFIG.citizen.toUpperCase()}`;
$('fee-target').textContent = usd(CONFIG.feePerCitizen);
if (CONFIG.buyUrl) { $('buy').hidden = false; $('buy').href = CONFIG.buyUrl; $('buy').textContent = `Buy ${CONFIG.ticker}`; }

const CAPTIONS = [
  `An island that <em>grows with every trade</em>`,
  `Every trade of <em>${CONFIG.ticker}</em> pays a creator fee`,
  `Every <em>${usd(CONFIG.feePerCitizen)}</em> in fees lands a <em>new ${CONFIG.citizen}</em>`,
  `Each ${CONFIG.citizen} has a job and <em>its own trading style</em>`,
  `Their trades are <em>simulated</em>. The fees are <em>real</em>.`,
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
scene.add(new THREE.HemisphereLight(0xdff1ff, 0x7a6a55, 1.9));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
sun.position.set(14, 26, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 70 });
sun.shadow.bias = -0.0008;
scene.add(sun);

const camera = new THREE.OrthographicCamera();
camera.position.set(30, 25, 30);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, -1.5, 0);
Object.assign(controls, {
  enableDamping: true, enablePan: false, autoRotate: true, autoRotateSpeed: 0.35,
  minZoom: 0.7, maxZoom: 4, minPolarAngle: 0.55, maxPolarAngle: 1.25,
});
let idleTimer;
controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(idleTimer); });
controls.addEventListener('end', () => { idleTimer = setTimeout(() => (controls.autoRotate = true), 8000); });

function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  const size = aspect >= 1 ? 30 : 38 / aspect;
  Object.assign(camera, { left: (-size * aspect) / 2, right: (size * aspect) / 2, top: size / 2, bottom: -size / 2, near: -200, far: 200 });
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener('resize', resize);
resize();

const world = createWorld(scene);
const floaters = new Floaters(world.root);
const airship = createAirship();
airship.visible = false;
world.root.add(airship);

// ---------- colony state ----------

const views = []; // CitizenView[], index = id - 1
let fees = 0;
let population = 0;
let source = 'demo';
let arrivalQueue = [];
let lastQueued = 0; // highest citizen id already spawned or waiting for the airship
let selected = null;
let following = false;

function unlocksFor(n, animate) {
  for (const u of CONFIG.unlocks) {
    if (u.at <= n && !world.buildings[u.id].visible) {
      world.unlock(u.id, animate);
      if (animate) toast('UNLOCKED', u.label);
    }
  }
  const next = CONFIG.unlocks.find((u) => u.at > n);
  $('next-unlock').innerHTML = next
    ? `Next unlock: <b>${next.label}</b> at ${next.at} ${plural}`
    : `Every building unlocked. The island is thriving.`;
}

function addCitizen(id, arrivedAt, arriving) {
  const c = makeCitizen(id, arrivedAt);
  advance(c, Date.now(), false);
  const v = new CitizenView(c, world, { arriving });
  views[id - 1] = v;
  return v;
}

function applyState(s, first) {
  if (!s) return;
  source = s.source;
  const check = $('check-live');
  check.textContent = source === 'demo' ? 'Demo mode: simulated fees' : 'Creator fees tracked onchain, live';
  check.classList.toggle('demo', source === 'demo');

  const delta = s.feesUsd - fees;
  if (!first && delta > 0.0001) {
    world.feePulse();
    floaters.spawn(`+${usd(delta)} fees`, '#7fb2ff', Math.random() * 2 - 1, 4.2 + Math.random() * 0.6, Math.random() * 2 - 1);
  }
  fees = Math.max(fees, s.feesUsd);

  const target = Math.max(1, s.population);
  if (first) {
    const now = Date.now();
    for (let id = 1; id <= target; id++) {
      const at = s.arrivals?.[id - 1] ?? now - (target - id + 1) * 20 * 60 * 1000;
      addCitizen(id, at, false);
    }
    population = lastQueued = target;
    unlocksFor(population, false);
  } else {
    for (let id = lastQueued + 1; id <= target; id++) arrivalQueue.push({ id, at: s.arrivals?.[id - 1] ?? Date.now() });
    lastQueued = Math.max(lastQueued, target);
  }
  renderHud();
}

// ---------- airship arrivals ----------

const DOCK = new THREE.Vector3(12.6, 0.35, 2.5);
let flight = null; // { id, at, t, phase }

function flightPath(t) {
  // approach from far away, ease in to the dock
  const from = new THREE.Vector3(42, 14, 26);
  const k = 1 - Math.pow(1 - t, 3);
  return from.lerp(DOCK, k);
}

function updateAirship(dt) {
  if (!flight && arrivalQueue.length) {
    flight = { ...arrivalQueue.shift(), t: 0, phase: 'in' };
    airship.visible = true;
  }
  if (!flight) return;
  const rush = arrivalQueue.length > 2 ? 3 : 1;
  flight.t += (dt / 3.2) * rush;
  airship.userData.prop.rotation.x += dt * 25;
  if (flight.phase === 'in') {
    const t = Math.min(1, flight.t);
    airship.position.copy(flightPath(t));
    airship.rotation.y = Math.atan2(26, -42) + Math.PI;
    if (t >= 1) {
      flight.phase = 'dock';
      flight.t = 0;
      const v = addCitizen(flight.id, flight.at, true);
      population = flight.id;
      unlocksFor(population, true);
      toast(`NEW ${CONFIG.citizen.toUpperCase()} LANDED`, `${v.c.name}`, `${v.c.job.label} · ${v.c.style.label}`);
      renderHud();
    }
  } else if (flight.phase === 'dock') {
    airship.position.y = DOCK.y + Math.sin(flight.t * 8) * 0.05;
    if (flight.t > 0.6) { flight.phase = 'out'; flight.t = 0; }
  } else {
    const t = Math.min(1, flight.t);
    airship.position.set(DOCK.x + t * t * 30, DOCK.y + t * t * 10, DOCK.z - t * t * 18);
    airship.rotation.y = Math.atan2(18, 30);
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

function totalTrades() {
  return views.reduce((n, v) => n + (v ? v.c.k : 0), 0);
}

function renderHud() {
  const per = CONFIG.feePerCitizen;
  const into = fees - (lastQueued - 1) * per;
  const progress = Math.max(0, Math.min(per, into));
  $('fee-progress').textContent = usd(progress);
  $('bar-fill').style.width = `${(progress / per) * 100}%`;
  $('pop').textContent = population;
  $('fees').textContent = usd(fees);
  $('trades').textContent = totalTrades().toLocaleString();
}

function renderLeaders() {
  const top = views.filter(Boolean).sort((a, b) => b.c.portfolio - a.c.portfolio).slice(0, 5);
  $('leaders').innerHTML = top
    .map((v, i) => {
      const p = stats(v.c).profit;
      return `<li data-id="${v.c.id}"><span><span class="rank">${i + 1}</span>${v.c.name}</span><b class="${p >= 0 ? 'up' : 'down'}">${usd(p, true)}</b></li>`;
    })
    .join('');
}

function pushFeed(e) {
  const li = document.createElement('li');
  li.dataset.id = e.citizen.id;
  li.innerHTML = `<span>${e.citizen.name} · ${e.citizen.style.label}</span><b class="${e.pnl >= 0 ? 'up' : 'down'}">${usd(e.pnl, true)}</b>`;
  const ul = $('feed');
  ul.prepend(li);
  while (ul.children.length > 7) ul.lastChild.remove();
}

for (const id of ['leaders', 'feed']) {
  $(id).addEventListener('click', (ev) => {
    const li = ev.target.closest('li');
    if (li) select(views[li.dataset.id - 1], true);
  });
}

function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function renderCard() {
  if (!selected) return;
  const c = selected.c, st = stats(c);
  $('card-eyebrow').textContent = `${CONFIG.citizen.toUpperCase()} #${c.id}${c.id === 1 ? ' · FOUNDER' : ''}`;
  $('card-name').textContent = c.name;
  $('card-role').textContent = `${c.job.label} · ${c.style.label}${st.rekt ? ' · REKT' : ''}`;
  $('card-portfolio').textContent = usd(st.portfolio);
  const pr = $('card-profit');
  pr.textContent = usd(st.profit, true);
  pr.className = st.profit >= 0 ? 'up' : 'down';
  $('card-trades').textContent = st.trades.toLocaleString();
  $('card-win').textContent = `${Math.round(st.winRate * 100)}%`;
  $('card-arrived').textContent = ago(c.arrivedAt);
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
  const who = selected ? `My favourite is ${selected.c.name}, a ${selected.c.style.label.toLowerCase()} ${selected.c.job.label.toLowerCase()}.` : '';
  const text = `${population} ${population === 1 ? CONFIG.citizen : plural} live on the ${CONFIG.name} island. Every ${usd(CONFIG.feePerCitizen)} in ${CONFIG.ticker} fees lands a new one. ${who}`.trim();
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
  select(hits[0]?.object.userData.citizen ?? null);
});

// ---------- loop ----------

const clock = new THREE.Timer();
let simAcc = 0, slowAcc = 0;
const tmp = new THREE.Vector3();

function frame() {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.getElapsed();

  world.update(t, dt);
  for (const v of views) v?.update(t, dt);
  updateAirship(dt);
  floaters.update(dt);

  simAcc += dt;
  if (simAcc > 0.25) {
    simAcc = 0;
    const now = Date.now();
    for (const v of views) {
      if (!v) continue;
      for (const e of advance(v.c, now)) {
        const p = v.group.position;
        floaters.spawn(usd(e.pnl, true), e.pnl >= 0 ? '#2ee87a' : '#ff6b6b', p.x, p.y + 1.9, p.z);
        pushFeed(e);
      }
    }
  }
  slowAcc += dt;
  if (slowAcc > 1) { slowAcc = 0; renderLeaders(); renderCard(); renderHud(); }

  if (selected && following) {
    selected.group.getWorldPosition(tmp);
    controls.target.lerp(tmp, Math.min(1, dt * 3));
  } else {
    controls.target.lerp(tmp.set(0, -1.5, 0), Math.min(1, dt * 2));
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

(async () => {
  applyState(await fetchColony(), true);
  renderLeaders();
  requestAnimationFrame(frame);
  setInterval(async () => applyState(await fetchColony(), false), source === 'demo' ? 2000 : CONFIG.pollMs);
})();

// expose for quick debugging in the console
window.colony = { views, world, SITES, get fees() { return fees; } };
