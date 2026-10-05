import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from './config.js';
import { createCity, updateBoards } from './city.js';
import { createAgents } from './agents.js';
import { renderPfp, downloadPfp } from './pfp.js';
import { BuilderView } from './citizens.js';
import { createTraffic } from './vehicles.js';
import { createSky } from './sky.js';
import { createWeather, WEATHER } from './weather.js';
import { computeDistricts } from './districts.js';
import { makeBlocky, cityCrew, CitySim, PITCH, TRAIT_LABEL, hash, needFor, LANDMARKS, whaleTier } from './sim.js';
import { fetchColony } from './data.js';
import { createAirship } from './airship.js';
import { createMetro } from './metro.js';
import { now } from './time.js';
import { addNames, who, whoHtml, esc } from './names.js';
import { createCinematic } from './cinematic.js';
import { watchLive } from './live.js';

const $ = (id) => document.getElementById(id);
const usd = (v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const plural = CONFIG.citizenPlural || `${CONFIG.citizen}s`;
const HOUR = 3600000;
const size = (L) => `${2 * L + 1}×${2 * L + 1}`;
const money = (v) => (v >= 1000 ? `$${v / 1000}k` : `$${v}`);
// "$1k+ fountain, $2.5k+ tower or $5k+ skyscraper" (CONFIG.whaleTiers)
const whaleTiersText = () => (CONFIG.whaleTiers || []).map((t) => `<em>${money(t.usd)}+</em> ${t.build}`).join(', ').replace(/, ([^,]*)$/, ' or $1');
let price = CONFIG.usdPerBlocky; // USD of $BLOCKY per Blocky (the API's)
const badge = (b) => (b.kind === 'legend' ? '★ ' : b.rarity && b.rarity.id !== 'common' && b.rarity.id !== 'uncommon' ? '✨ ' : '');
const rareText = (b) => (b.trait ? `${b.rarity.label} · ${TRAIT_LABEL[b.trait]}` : '');
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
// phones: the stats panel sits right under the progress panel, however tall that gets
{
  const progress = document.querySelector('.progress'), stats = document.querySelector('.stats');
  const place = () => { stats.style.top = innerWidth <= 900 ? `${Math.round(progress.getBoundingClientRect().bottom + 8)}px` : ''; };
  if (typeof ResizeObserver === 'function') new ResizeObserver(place).observe(progress);
  addEventListener('resize', place);
}
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
  () => `Every <em>${money(price)}</em> of ${CONFIG.ticker} you buy brings <em>1 ${CONFIG.citizen}</em>`,
  `At most <em>${fmt(CONFIG.supply)}</em> ${plural} live in the city`,
  `<em>1%</em> of ${plural} are Legendary: Diamond Skin or a Crown`,
  `Real Base builders build here as <em>Base Builders</em>`,
  () => `A ${whaleTiersText()} with your name on it`,
  `Every buy shows up in the <em>city log</em>`,
  `${plural} build <em>24/7</em>, even when no one is watching`,
  `Land full? More ${plural} <em>expand the land</em>`,
  () => (openedAt ? `Trading is open: a ${CONFIG.citizen} held <em>${dayText()}</em> is an <em>NFT</em> you claim` : `Trading opens at <em>${money(unlockUsd)}</em> bought: every ${CONFIG.citizen} becomes an <em>NFT</em>`),
];
let capIdx = 0;
function rotateCaption() {
  const el = $('caption');
  el.style.opacity = 0;
  setTimeout(() => { const c = CAPTIONS[capIdx++ % CAPTIONS.length]; el.innerHTML = typeof c === 'function' ? c() : c; el.style.opacity = 1; }, 400);
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
  enableDamping: true, enablePan: true, screenSpacePanning: false, autoRotate: false, autoRotateSpeed: 0.3,
  minZoom: 0.6, maxZoom: 6, minPolarAngle: 0.5, maxPolarAngle: 1.2,
});
// drag: rotate · shift+drag, right-drag or two fingers: move around the city
let goHome = true;
// Auto-rotate is a preference (button or R key) and always stops in photo mode, so screenshots
// and screen recordings hold still. ?still starts without rotation, ?photo starts in photo mode.
const qs = new URLSearchParams(location.search);
// The camera holds still by default; ⟳ Rotate (or R, or ?spin) turns a slow orbit on and is remembered.
let rotatePref = qs.has('spin') && !qs.has('still');
try { const saved = localStorage.getItem('basecity:spin'); if (saved !== null && !qs.has('still') && !qs.has('spin')) rotatePref = saved === '1'; } catch { /* ignore */ }
let photo = false;
let idleTimer;
const syncRotate = () => {
  controls.autoRotate = rotatePref && !photo;
  $('rotate-btn').textContent = rotatePref ? '⟳ Rotating' : '⟳ Rotate: off';
  $('rotate-btn').classList.toggle('on', rotatePref);
};
function setRotate(on) {
  rotatePref = on;
  try { localStorage.setItem('basecity:spin', on ? '1' : '0'); } catch { /* ignore */ }
  syncRotate();
}
function setPhoto(on) {
  photo = on;
  document.body.classList.toggle('photo', on);
  syncRotate();
}
controls.addEventListener('start', () => { controls.autoRotate = false; goHome = false; clearTimeout(idleTimer); });
controls.addEventListener('end', () => { idleTimer = setTimeout(syncRotate, 8000); }); // the view stays where you leave it
$('rotate-btn').onclick = () => setRotate(!rotatePref);
$('photo-btn').onclick = () => setPhoto(true);
$('photo-exit').onclick = () => setPhoto(false);
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // Cmd/Ctrl+C, R, P: copy, reload, print, not our shortcuts
  if (cine.active) { if (e.key === 'Escape' || e.key === 'f' || e.key === 'F') cine.exit(); return; }
  if (e.key === 'r' || e.key === 'R') setRotate(!rotatePref);
  if (e.key === 'p' || e.key === 'P') setPhoto(!photo);
  if (e.key === 'f' || e.key === 'F') cine.enter(selected?.b.id ?? null); // F: film
  if (e.key === 'Escape' && photo) setPhoto(false);
});
syncRotate();
if (qs.has('photo')) setPhoto(true);

const city = createCity(scene);
const traffic = createTraffic(city);
const metro = createMetro(city);
const agents = createAgents(city);
const sky = createSky(city, camera);
const weather = createWeather(city);
let market = null;
const airship = createAirship();
airship.visible = false;
city.root.add(airship);

function resize() {
  if (cine.active) return cine.resize();
  const w = innerWidth, h = innerHeight, aspect = w / h;
  const H = Math.max(2, city.land) * PITCH + 4; // isometric square of half-width H: ~2.9H wide, ~1.9H tall
  const s = Math.max(H * 1.9, (H * 2.9) / aspect, 30) * 1.05;
  const lift = aspect < 0.8 ? s * 0.12 : 0; // phones: the HUD covers the top, so show the city a little lower
  Object.assign(camera, { left: (-s * aspect) / 2, right: (s * aspect) / 2, top: s / 2 + lift, bottom: -s / 2 + lift, near: -400, far: 400 });
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener('resize', resize);

// ---------- colony state ----------

let sim = null;
let cityStart = 0;
const crew = []; // every builder in arrival order: the founder, the Base Builders, then Blocky #1, #2, ...
const byId = new Map();
const views = new Map(); // id -> BuilderView; only some builders are drawn, every one of them builds
const OG = 10; // the first Blockies stay in view for good
let minted = 0; // Blockies in the city now
let known = 0; // Blockies the API has told us about (some may still be on the airship)
let knownGone = 0; // departures the API has told us about
let supply = CONFIG.supply;
let citizenDays = CONFIG.citizenDays; // after opening, a Blocky's newcomer days (the API's): then a citizen, an NFT
let unlockUsd = CONFIG.unlockUsd; // total bought that opens trading
let openedAt = null; // when it did (ms)
const dayText = () => (citizenDays === 1 ? 'a day' : `${citizenDays} days`);
let whales = [];
let bought = 0; // USD bought (or fees earned in fee mode)
const loggedBuys = new Set();
const arrivalQueue = [];
let selected = null;
let following = false;

function join(b) { crew.push(b); byId.set(b.id, b); }
function draw(b, arriving = false) {
  if (!views.has(b.id)) views.set(b.id, new BuilderView(b, city, { arriving }));
  return views.get(b.id);
}
const inCity = (b) => !Number.isFinite(b.leftAt);
const countMinted = () => crew.reduce((n, b) => n + (b.kind === 'blocky' && inCity(b) ? 1 : 0), 0);
function undraw(id) {
  const v = views.get(id);
  if (!v) return;
  if (selected === v) select(null);
  city.root.remove(v.group);
  views.delete(id);
}
// How many builders walk the streets grows with the city, so a small town never gets packed; the
// rest build off screen (the HUD, the leaderboard and every card still count them).
const viewCap = () => Math.round(Math.min(110, Math.max(36, 24 + city.built.length * 0.6)));
// In a small town the Base Builders work in shifts: who is in town changes every 15 minutes, the same
// for every visitor. Once the town is big enough, all of them are.
const SHIFT_MS = 15 * 60000;
let shift = { key: '', ids: new Set() };
function onShift(cap) {
  const t = now(), slot = Math.floor(t / SHIFT_MS), quota = Math.max(6, Math.round(cap * 0.25));
  const team = crew.filter((b) => b.kind === 'legend' && b.arrivedAt <= t);
  const key = `${slot}|${quota}|${team.length}`;
  if (shift.key !== key) {
    const pick = team.length <= quota ? team : team.slice().sort((a, b) => hash(a.id, slot, 9) - hash(b.id, slot, 9)).slice(0, quota);
    shift = { key, ids: new Set(pick.map((b) => b.id)) };
  }
  return shift.ids;
}
// Draw: the founder, the Base Builders on shift, the first OG Blockies, every Legendary, the one you
// follow, then the newest arrivals up to the cap.
function syncViews() {
  if (!sim) return;
  const t = now(), cap = viewCap(), legends = onShift(cap), want = new Set();
  for (const b of crew) {
    if (b.arrivedAt > t || !inCity(b)) continue;
    if (b.kind === 'founder' || legends.has(b.id) || (b.kind === 'blocky' && (b.id <= OG || b.rarity?.id === 'legendary'))) want.add(b.id);
  }
  for (let i = crew.length - 1; i >= 0 && want.size < cap; i--) {
    const b = crew[i];
    if (b.kind === 'blocky' && inCity(b) && b.arrivedAt <= t) want.add(b.id);
  }
  if (selected) want.add(selected.b.id);
  city.drawn = want.size; // before drawing: new builders decide whether it's their turn on the site
  for (const id of [...views.keys()]) if (!want.has(id)) undraw(id);
  for (const id of want) if (!views.has(id)) draw(byId.get(id));
}

// community goals: landmarks (Base projects' HQs included) and the metro, unlocked by the Blocky count
const GOALS = [...LANDMARKS, ...(CONFIG.metro ? [CONFIG.metro] : [])].filter((l) => l.at > 0).sort((a, b) => a.at - b.at);
// (one that is built already stays built when Blockies leave and the count drops below it again)
const nextGoal = () => GOALS.find((l) => l.at > minted && !(l.id ? sim?.builtLandmarks.has(l.id) : sim?.metroBuilt));
function nextUnlockText() {
  const next = nextGoal();
  $('goal-name').textContent = next ? next.label : 'Every landmark unlocked';
  $('goal-count').textContent = next ? `${fmt(minted)}/${fmt(next.at)}` : '';
  $('bar-fill').style.width = `${next ? (minted / next.at) * 100 : 100}%`;
  const left = Math.max(0, supply - minted);
  const grow = needFor(sim.land + 1);
  $('next-unlock').innerHTML = `Land ${size(sim.land)}${grow <= supply ? ` (${size(sim.land + 1)} at ${fmt(grow)})` : ''} · ${left ? `<b>${fmt(left)}</b> of ${fmt(supply)} ${plural} left` : `all ${fmt(supply)} ${plural} are here`} · <b>${money(price)}</b> per ${CONFIG.citizen}`;
}

function applyState(s, first) {
  if (!s) return;
  const buys = s.mode !== 'fees';
  const labels = { demo: 'Demo mode: simulated buys', override: 'Test mode: fixed number', prelaunch: 'No fees yet: the founder builds alone' };
  const check = $('check-live');
  check.textContent = labels[s.source] || (buys ? 'Buys tracked onchain, live' : 'Creator fees tracked onchain, live');
  check.classList.toggle('demo', s.source in labels);
  $('fees-label').textContent = buys ? 'Bought' : 'Fees earned';

  const named = addNames(s.names); // Basenames of the wallets in this answer
  if (!first && s.boughtUsd - bought > 0.0001) city.feePulse();
  bought = Math.max(bought, s.boughtUsd);
  if (typeof s.price === 'number') price = s.price;
  supply = s.supply || supply;
  if (typeof s.citizenDays === 'number') citizenDays = s.citizenDays;
  if (typeof s.unlockUsd === 'number') unlockUsd = s.unlockUsd;
  openedAt = s.openedAt ?? null;
  if (s.market) { market = s.market; weather.setMarket(market); }
  updateBoards({ market, population: Math.max(minted, s.minted || 0) });
  for (const b of [...(s.recentBuys || [])].reverse()) {
    const key = `${b.at}|${b.from}|${b.usd}|${b.kind}`;
    if (loggedBuys.has(key)) continue;
    loggedBuys.add(key);
    if (first) continue;
    if (b.kind === 'sell') {
      log(`💸 ${whoHtml(b.from)} sold ${usd(b.usd)}${b.left ? ` → ${b.left} ${b.left > 1 ? plural : CONFIG.citizen} left the city` : ''}`, b.at);
      continue;
    }
    const what = b.blockies ? ` → +${b.blockies} ${b.blockies > 1 ? plural : CONFIG.citizen}` : minted >= supply ? ' → waiting for a place in the city' : ' → adds up to the next one';
    log(`🛒 ${whoHtml(b.from)} bought ${usd(b.usd)}${what}`, b.at);
    if (b.usd >= CONFIG.whaleUsd) {
      weather.celebrate(); setTimeout(() => weather.celebrate(), 900); setTimeout(() => weather.celebrate(), 1800);
      news.unshift(`<b>WHALE ALERT:</b> ${whoHtml(b.from)} just bought ${usd(b.usd)}: ${b.blockies} ${plural} are flying in and the city starts a ${whaleTier(b.usd).label} in their name!`);
    } else if (b.blockies >= 10) {
      weather.celebrate();
      news.unshift(`<b>BIG BUY:</b> ${whoHtml(b.from)} just bought ${usd(b.usd)}, bringing ${b.blockies} ${plural}. Fireworks over the Statue of Blockerty!`);
    }
  }

  // the API sends only what came after `known` and `knownGone` (a stale answer may resend everything)
  const fresh = (s.since ?? 0) === known ? s.blockies : s.blockies.slice(Math.max(0, known - (s.since ?? 0)));
  const gone = (s.dsince ?? 0) === knownGone ? s.departures : s.departures.slice(Math.max(0, knownGone - (s.dsince ?? 0)));
  const whalesChanged = (s.whales?.length || 0) !== whales.length || (named && whales.some((w) => w.name !== who(w.from, 28))); // a late Basename re-signs a fountain
  if (whalesChanged) whales = (s.whales || []).map((w) => ({ ...w, name: who(w.from, 28) }));
  const blocky = (n, [from, at, left, seed]) => {
    const b = makeBlocky(n, Math.max(cityStart, at ?? now()), from, seed);
    if (left != null) b.leftAt = Math.max(b.arrivedAt, left);
    return b;
  };
  if (first) {
    cityStart = s.cityStart ?? (CONFIG.cityStart ? Date.parse(CONFIG.cityStart) : now());
    sim = new CitySim(cityStart);
    for (const b of cityCrew(cityStart)) join(b);
    fresh.forEach((e, i) => join(blocky(i + 1, e)));
    known = fresh.length;
    knownGone = s.departed ?? 0; // already folded into each Blocky's leftAt
    minted = countMinted();
    sim.setCrew(crew, whales); // drawn once the city is laid out (syncViews after the first stepCity)
  } else {
    let changed = whalesChanged;
    fresh.forEach((e, i) => {
      const n = known + i + 1;
      if (e[2] != null) { join(blocky(n, e)); changed = true; } // came and went between two polls
      else arrivalQueue.push({ n, from: e[0], at: e[1] ?? now(), seed: e[3] });
    });
    known += fresh.length;
    // Blockies whose wallets sold leave the city; their places go to the next wallets in line
    const leaving = [];
    for (const [n, at] of gone) {
      const b = byId.get(n);
      if (b) { if (inCity(b)) { b.leftAt = Math.max(b.arrivedAt, at); undraw(n); leaving.push(b); } continue; }
      const q = arrivalQueue.findIndex((x) => x.n === n);
      if (q >= 0) { const [x] = arrivalQueue.splice(q, 1); join(blocky(n, [x.from, x.at, at, x.seed])); }
    }
    knownGone += gone.length;
    if (leaving.length) {
      changed = true;
      const nums = leaving.length > 1 ? `${leaving.length} ${plural}` : leaving[0].name;
      log(`👋 ${nums} left the city: ${leaving.length > 1 ? 'their wallets' : 'its wallet'} sold ${CONFIG.ticker}`, now(), leaving[0].id);
      news.unshift(`<b>MOVING OUT:</b> ${nums} left ${CONFIG.cityName} after ${leaving.length > 1 ? 'their wallets' : 'its wallet'} sold ${CONFIG.ticker}. Their places go to the next buyers`);
    }
    if (changed) { minted = countMinted(); sim.setCrew(crew, whales); syncViews(); }
  }
  nextUnlockText();
  renderHud();
}

// ---------- airship arrivals: big buys come in batches ----------

const PAD = new THREE.Vector3(city.helipad[0], 1.6, city.helipad[1]);
const FROM = new THREE.Vector3(70, 24, 46);
let flight = null;

function land(batch) {
  const arrived = batch.map(({ n, from, at, seed }) => { const b = makeBlocky(n, Math.max(cityStart, at), from, seed); join(b); draw(b, true); return b; });
  minted = countMinted();
  sim.setCrew(crew, whales);
  syncViews();
  const rares = arrived.filter((b) => b.rarity && b.rarity.id !== 'common');
  const best = rares.sort((a, b) => a.rarity.chance - b.rarity.chance)[0];
  const first = arrived[0], last = arrived[arrived.length - 1];
  const nums = arrived.length > 1 ? `#${first.id}–#${last.id}` : `#${first.id}`;
  if (arrived.length === 1) {
    toast(best ? `✨ ${best.rarity.label.toUpperCase()} ${CONFIG.citizen.toUpperCase()}!` : `NEW ${CONFIG.citizen.toUpperCase()} JOINED`, first.name, `${best ? `${TRAIT_LABEL[best.trait]} · ` : ''}${first.role.label}${first.from ? ` · brought by ${whoHtml(first.from)}` : ''}`);
  } else {
    toast(`+${arrived.length} ${plural.toUpperCase()} ARRIVED`, `${CONFIG.citizen} ${nums}`, best ? `incl. ✨ ${best.rarity.label} ${TRAIT_LABEL[best.trait]} (${best.name})` : first.from ? `brought by ${whoHtml(first.from)}` : '');
  }
  if (best && best.rarity.id !== 'uncommon') {
    weather.celebrate();
    news.unshift(`<b>RARE ${CONFIG.citizen.toUpperCase()}:</b> ${best.name} arrived with ${TRAIT_LABEL[best.trait]} (${best.rarity.label}, ${+(best.rarity.chance * 100).toFixed(1)}% chance)`);
  }
  const owners = [...new Set(arrived.map((b) => b.from))];
  log(`👷 ${arrived.length > 1 ? `${plural} ${nums} joined` : `${first.name} joined`}${owners.length === 1 && owners[0] ? `, brought by ${whoHtml(owners[0])}` : ''}`, now(), first.id);
  stepCity(true);
  nextUnlockText();
  renderHud();
}

function updateAirship(dt) {
  if (!flight && arrivalQueue.length) {
    const take = Math.max(1, Math.min(12, Math.ceil(arrivalQueue.length / 6)));
    flight = { batch: arrivalQueue.splice(0, take), t: 0, phase: 'in' };
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
    if (t >= 1) { flight.phase = 'dock'; flight.t = 0; land(flight.batch); }
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
  : p.kind === 'wonder' ? `${p.build === 'fountain' ? '⛲' : '🏙️'} ${p.whale.tier || 'Whale Fountain'} built for ${whoHtml(p.whale.from) || 'a whale'}${p.takesOver ? `, taking over ${p.takesOver}` : ''}`
  : p.kind === 'metro' ? `🚇 ${p.name} opened`
  : p.restores ? `🏗️ ${p.name} rebuilt on the ruins of ${p.rebuilds}`
  : p.rebuilds ? `🏗️ ${p.name} completed, replacing ${p.rebuilds}`
  : `🏗️ ${p.name} completed`);
// what departures did to the city (CitySim.depart)
const eventLine = (e) => (e.kind === 'unnamed'
  ? `🌑 ${e.p.name} went dark: ${whoHtml(e.p.whale.from)} sold. FOR SALE to the next whale`
  : e.kind === 'ruin'
  ? `🏚️ ${e.p.name} abandoned: ${fmt(e.n)} ${plural} left at once`
  : `🧱 ${e.n ? `${fmt(e.n)} ${e.n > 1 ? plural : CONFIG.citizen} walked off` : 'Builders walked off'} ${e.p.name}: −${fmt(e.blocks)} blocks`);

function renderHud() {
  if (!sim) return;
  $('pop').textContent = `${fmt(minted)} / ${fmt(supply)}`;
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
    // a site that just lost blocks says so for a while
    const hit = sim.events.findLast((e) => e.kind === 'setback' && e.p === a);
    const lost = hit && now() - hit.at < HOUR ? `−${fmt(hit.blocks)} blocks: ${hit.n > 1 ? `${fmt(hit.n)} ${plural}` : 'a builder'} walked off · ` : '';
    $('site-eta').textContent = `${lost}${a.restores ? `Rebuilding the ruins of ${a.rebuilds} · ` : a.rebuilds ? `Rebuilding ${a.rebuilds} · ` : ''}${sim.eta != null ? `~${dur(sim.eta)} left · ${sim.sites?.length > 1 ? `${sim.sites.length} sites at once · ` : ''}crew speed ${Math.round(sim.rate)} blocks/h` : ''}`;
  }
  const day = Math.floor((now() - cityStart) / 86400000) + 1;
  $('clock').textContent = `Day ${day} · ${city.env.daylight < 0.5 ? '🌙 Night shift' : '☀️ Day shift'}`;
  const w = WEATHER[weather.kind], wEl = $('weather');
  wEl.hidden = false;
  wEl.textContent = `${w.icon} ${w.label}${market ? ` · ${CONFIG.ticker} ${market.change24h >= 0 ? '+' : ''}${market.change24h.toFixed(1)}% 24h` : ''}`;
  for (const el of document.querySelectorAll('#feed [data-at]')) el.textContent = ago(+el.dataset.at);
}

// the buyers' Blockies that placed the most blocks, one per wallet (its best): not the founder, the
// Base Builders (they have their own page) or the team reserve, who were all there from the first day;
// everyone until a buyer arrives
const reserved = (b) => b.id <= (CONFIG.nft.reserve?.count || 0) && b.from === CONFIG.nft.reserve?.wallet?.toLowerCase();
const owner = (a) => { const w = whoHtml(a, 15); return w.startsWith('0x') ? w.slice(0, 7) : w; }; // a Basename, or 0x1234…
function topBuilders(n) {
  const ts = now(), here = crew.filter(inCity);
  const bought = here.filter((b) => b.kind === 'blocky' && !reserved(b));
  const ranked = (bought.length ? bought : here).map((b) => [b, sim.blocksBy(b, ts)]).sort((a, b) => b[1] - a[1]);
  const wallets = new Set();
  return ranked.filter(([b]) => !b.from || (!wallets.has(b.from) && wallets.add(b.from))).slice(0, n);
}
function renderLeaders() {
  $('leaders').innerHTML = topBuilders(5)
    .map(([b, blocks], i) => `<li data-id="${b.id}"${b.from ? ` title="${esc(b.name)} · brought by ${whoHtml(b.from, 42)}"` : ''}><span><span class="rank">${i + 1}</span>${badge(b)}${b.name} <span class="muted">· ${b.kind === 'blocky' ? (b.from ? owner(b.from) : `#${b.id}`) : b.office ? b.office.label : b.role.label}</span></span><b>${fmt(blocks)} 🧱</b></li>`)
    .join('');
}

for (const id of ['leaders', 'feed']) {
  $(id).addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-id]');
    const b = li && byId.get(Number(li.dataset.id));
    if (b) select(draw(b), true);
  });
}

function renderCard() {
  if (!selected) return;
  const b = selected.b, ts = now(), placed = sim.blocksBy(b, ts);
  const rare = b.trait ? ` · ${rareText(b).toUpperCase()}` : '';
  $('card-eyebrow').textContent = `${b.kind === 'founder' ? 'FOUNDER' : b.kind === 'legend' ? `★ ${b.office ? `${b.office.label.toUpperCase()} · CITY COUNCIL` : 'BASE BUILDER'}` : `${CONFIG.citizen.toUpperCase()} #${b.id} OF ${fmt(supply)}`}${rare}`;
  $('card-name').textContent = b.name;
  $('card-role').textContent = [b.role.label, `${b.skill.toFixed(1)}× skill`].join(' · ');
  $('card-status').textContent = selected.status;
  $('card-blocks').textContent = fmt(placed);
  $('card-hours').textContent = fmt((ts - b.arrivedAt) / HOUR);
  $('card-share').textContent = `${sim.work ? ((placed / sim.work) * 100).toFixed(1) : 0}%`;
  const citizen = Math.max(b.arrivedAt + citizenDays * 86400e3, openedAt ?? Infinity);
  const left = citizen - ts;
  $('card-joined').textContent = `${ago(b.arrivedAt)}${b.kind !== 'blocky' ? '' : left <= 0 ? ' · citizen' : !openedAt ? ' · NFT on opening day' : ` · citizen in ${left > 3600e3 ? `${Math.ceil(left / 3600e3)}h` : `${Math.ceil(left / 60e3)}m`}`}`;
  const team = b.kind === 'blocky' && b.id <= (CONFIG.nft.reserve?.count || 0) && b.from === CONFIG.nft.reserve.wallet.toLowerCase();
  $('card-by').textContent = b.kind === 'founder' ? 'Founder' : b.kind === 'legend' ? 'Base Builder' : team ? `Team reserve (${who(b.from)})` : b.from ? who(b.from, 28) : '—';
  $('card-follow').textContent = following ? 'Unfollow' : 'Follow';
  $('card-nft').hidden = b.kind !== 'blocky';
  $('card-nft').href = `/collection.html#${b.id}`;
  const img = $('card-pfp');
  if (img.dataset.id !== String(b.id)) { img.dataset.id = b.id; img.src = renderPfp(b, { size: 256, mark: false }); img.alt = `Voxel PFP of ${b.name}`; }
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
$('card-pfp-dl').onclick = () => selected && downloadPfp(selected.b);
$('card-film').onclick = () => selected && cine.enter(selected.b.id);

// ---------- cinematic mode: a film camera, photos and clips (src/cinematic.js) ----------

const cine = createCinematic({
  renderer, scene, city, controls,
  views: () => views,
  selected: () => selected?.b.id ?? null,
  sim: () => sim,
  stats: () => ({ day: Math.floor((now() - cityStart) / 86400000) + 1, minted }),
  onExit: () => { renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); resize(); },
  solids: [metro.group],
});
$('cine-btn').onclick = () => cine.enter(selected?.b.id ?? null);

$('share').onclick = () => {
  const url = CONFIG.siteUrl || location.origin;
  const text = `${CONFIG.cityName}: ${sim.buildingCount} buildings on ${size(sim.land)} land, built 24/7 by ${fmt(minted)} of ${fmt(supply)} ${plural} and ${CONFIG.legends?.length || 0} Base builders. Every ${money(price)} of ${CONFIG.ticker} you buy brings a ${CONFIG.citizen}, an NFT you claim.`
    + (CONFIG.tokenAddress ? `\n\nCA: ${CONFIG.tokenAddress}` : '');
  const via = CONFIG.xHandle ? `&via=${CONFIG.xHandle}` : '';
  open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}${via}`, '_blank', 'noopener');
};

// ---------- picking ----------

const ray = new THREE.Raycaster();
let downAt = null;
canvas.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
canvas.addEventListener('pointerup', (e) => {
  if (cine.active) return cine.poke(); // taps bring the cinematic controls back
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const p = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(p, camera);
  const hits = ray.intersectObjects([...views.values()].map((v) => v.hit), false);
  if (hits[0]) return select(hits[0].object.userData.builder);
  const board = ray.intersectObjects(city.billboards, false)[0]?.object.userData.sponsor;
  if (board?.url) { open(board.url, '_blank', 'noopener'); return; }
  select(null);
});

// ---------- the 24/7 build ----------

let shownLand = 0;
let announced = -Infinity; // completion time of the last project we announced
let heard = -Infinity; // time of the last departure effect we announced
function stepCity(animate) {
  // a new crew replays the whole city: only announce what finished after the last announcement
  const finished = sim.advance(now()).filter((p) => p.at > announced);
  for (const p of finished) announced = Math.max(announced, p.at);
  const effects = [];
  for (let i = sim.events.length - 1; i >= 0 && sim.events[i].at > heard; i--) effects.unshift(sim.events[i]);
  if (effects.length) heard = effects[effects.length - 1].at;
  city.sync(sim, animate);
  metro.sync(sim);
  city.waiting = !!sim.blocked;
  if (city.land !== shownLand) { shownLand = city.land; resize(); }
  if (!animate) return;
  for (const e of effects) {
    log(eventLine(e), e.at);
    if (e.kind === 'unnamed') {
      toast('🌑 WENT DARK', e.p.name, `its whale sold. FOR SALE to the next ${e.p.whale.tier || 'whale'} buyer`);
      news.unshift(`<b>FOR SALE:</b> ${e.p.name} went dark after ${whoHtml(e.p.whale.from)} sold. The next whale of its size takes it over`);
    }
    if (e.kind !== 'ruin') continue;
    toast('🏚️ ABANDONED', e.p.name, `${fmt(e.n)} ${plural} left at once. The crew rebuilds it next`);
    news.unshift(`<b>GHOST TOWN?</b> ${e.p.name} stands abandoned after ${fmt(e.n)} ${plural} left ${CONFIG.cityName} at once. Crews will rebuild it first`);
  }
  for (const p of finished) {
    log(logLine(p));
    if (p.kind === 'expand') toast('LAND EXPANDED', size(p.level), `${plural} reclaimed a new ring of land`);
    if (p.kind === 'landmark') toast('LANDMARK BUILT', p.name);
    if (p.kind === 'metro') toast('🚇 METRO OPENED', p.name, 'Trains now loop the ring road');
    if (p.kind === 'wonder') { toast(p.build === 'fountain' ? '⛲ WONDER BUILT' : '🏙️ WHALE TOWER BUILT', p.whale.tier || 'Whale Fountain', `named after ${whoHtml(p.whale.from) || 'a whale'}`); weather.celebrate(); }
  }
}

function welcomeBack() {
  const KEY = 'basecity:lastVisit';
  try {
    const prev = JSON.parse(localStorage.getItem(KEY) || 'null');
    const built = prev && prev.start === cityStart ? sim.done.filter((p) => p.lot).length - prev.done : 0;
    if (built > 0) toast('WHILE YOU WERE AWAY', `+${built} building${built > 1 ? 's' : ''}`, `built in the last ${ago(prev.at).replace(' ago', '')}`);
    const save = () => localStorage.setItem(KEY, JSON.stringify({ done: sim.done.filter((p) => p.lot).length, at: now(), start: cityStart }));
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
    districts = computeDistricts([...sim.standing.values()], sim.land);
    for (const d of districts) {
      let el = districtEls.get(d.key);
      if (!el) { el = document.createElement('div'); el.className = 'district'; $('districts').appendChild(el); districtEls.set(d.key, el); }
      el.innerHTML = `${d.name}<small>${d.buildings ? `${d.buildings} building${d.buildings > 1 ? 's' : ''}` : 'woods'}</small>`;
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
  const ruins = sim.ruinCount;
  if (ruins) out.push(`<b>CITY HALL:</b> ${ruins} abandoned building${ruins > 1 ? 's' : ''} after big exits. Crews rebuild ${ruins > 1 ? 'them' : 'it'} before anything else`);
  const next = nextGoal();
  if (next) out.push(`<b>COMING SOON:</b> ${next.label} breaks ground at ${next.at} ${plural}`);
  if (market) {
    const quotes = [[CONFIG.ticker, market.priceUsd, market.change24h], ...(market.stocks || []).map((st) => [st.symbol, st.priceUsd, st.change24h])];
    const fmtP = (v) => (v >= 1 ? v.toFixed(2) : v.toPrecision(4));
    out.push(`<b>MARKETS:</b> ${quotes.map(([sym, p, c]) => `${sym} $${fmtP(p)}${typeof c === 'number' ? ` <span class="${c >= 0 ? 'up' : 'down'}">${c >= 0 ? '▲' : '▼'}${Math.abs(c).toFixed(1)}%</span>` : ''}`).join(' · ')}`);
  }
  if (agents.count) out.push(`<b>AGENTS:</b> ${agents.count} AI agent drones are flying deliveries over ${CONFIG.cityName}${agents.deliveries ? `, ${fmt(agents.deliveries)} parcels delivered since you arrived` : ''}`);
  if (sim.metroBuilt) out.push(`<b>TRANSIT:</b> ${CONFIG.metro.label} trains run every few minutes around the ring road`);
  const services = Object.entries({ firestation: 'fire trucks', police: 'police cars', hospital: 'ambulances', recycling: 'garbage trucks' }).filter(([t]) => city.counts[t]);
  if (services.length) out.push(`<b>CITY SERVICES:</b> ${services.map(([, v]) => v).join(', ')} on patrol in ${CONFIG.cityName}`);
  out.push(`<b>MINT:</b> ${fmt(minted)} of ${fmt(supply)} ${plural} are in ${CONFIG.cityName}. ${minted < supply ? `Only ${fmt(supply - minted)} left` : 'Sold out'}`);
  if (openedAt) out.push(`<b>MARKET OPEN:</b> every ${CONFIG.citizen} held ${dayText()} is a citizen for good: an NFT its wallet claims on the claim page, free to trade at once`);
  else if (unlockUsd) out.push(`<b>OPENING DAY:</b> ${CONFIG.citizen} NFTs start trading at ${money(unlockUsd)} bought. ${usd(bought)} so far, ${Math.min(99, Math.floor((bought / unlockUsd) * 100))}% of the way. Hold: sellers' ${plural} leave`);
  const builders = crew.filter((b) => b.kind === 'legend' && b.arrivedAt <= now()).length;
  if (builders) out.push(`<b>BASE BUILDERS:</b> ${builders} real Base builders are building ${CONFIG.cityName} with the ${plural}`);
  // the City Council at work: someone holding office (CONFIG.offices) and what they're up to
  const council = crew.filter((b) => b.office?.duty && b.kind === 'legend' && b.arrivedAt <= now());
  if (council.length) {
    const m = council[Math.floor(Math.random() * council.length)];
    out.push(`<b>CITY COUNCIL:</b> ${m.office.label} ${m.name} ${m.office.duty}`);
  }
  const [top] = topBuilders(1);
  if (top && top[1] >= 2) out.push(`<b>BUILDER OF THE DAY:</b> ${top[0].name}, ${fmt(top[1])} blocks placed`);
  const big = [...districts].sort((a, b) => b.buildings - a.buildings)[0];
  if (big && districts.length > 1) out.push(`<b>DISTRICTS:</b> ${big.name} leads with ${big.buildings} buildings`);
  for (let i = 0; i < 2; i++) out.push(FILLER[Math.floor(Math.random() * FILLER.length)]);
  const hqs = GOALS.filter((l) => l.brand && sim.builtLandmarks.has(l.id)).map((l) => l.brand.name);
  if (hqs.length) out.push(`<b>BASE AVENUE:</b> ${hqs.length > 1 ? `${hqs.slice(0, -1).join(', ')} and ${hqs.at(-1)} have` : `${hqs[0]} has`} a headquarters in ${CONFIG.cityName}`);
  const sponsors = CONFIG.sponsors || [];
  if (sponsors.length) { const sp = sponsors[Math.floor(Math.random() * sponsors.length)]; out.push(`<b>${sp.sponsored ? 'SPONSORED' : 'BUILT ON BASE'}:</b> ${sp.name}${sp.tagline ? `, ${sp.tagline}` : ''}`); }
  if (Math.random() < 0.5 || !sponsors.length) out.push(`<b>ADVERTISE:</b> put your Base project on ${CONFIG.cityName} billboards${CONFIG.adContact || CONFIG.xHandle ? `. ${CONFIG.adContact || `DM @${CONFIG.xHandle}`}` : ''}`);
  out.push(`<b>${CONFIG.ticker}:</b> every ${money(price)} you buy brings a ${CONFIG.citizen}, an NFT once trading opens; at most ${fmt(supply)} in the city. One big buy builds a ${whaleTiersText()} with your name`);
  const dark = [...sim.standing.values()].filter((p) => p.whale && p.build !== 'fountain' && p.whale.lostAt <= now()).length;
  if (dark) out.push(`<b>FOR SALE:</b> ${dark} whale tower${dark > 1 ? 's' : ''} went dark when ${dark > 1 ? 'their whales' : 'its whale'} sold. The next big buy takes ${dark > 1 ? 'one' : 'it'} over`);
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
  metro.update(t, dt);
  agents.update(t, dt);
  sky.update(t, dt);
  weather.update(t, dt);
  for (const v of views.values()) v.update(t, dt);
  updateAirship(dt);

  simAcc += dt;
  if (simAcc > 0.5) { simAcc = 0; stepCity(true); }
  slowAcc += dt;
  if (slowAcc > 1) { slowAcc = 0; renderLeaders(); renderCard(); renderHud(); nextUnlockText(); }

  if (cine.active) { // the film camera takes over
    cine.frame(t, dt);
    requestAnimationFrame(frame);
    return;
  }
  if (selected && following) {
    selected.group.getWorldPosition(tmp);
    controls.target.lerp(tmp, Math.min(1, dt * 3));
  } else if (goHome) {
    controls.target.lerp(home, Math.min(1, dt * 2));
  }
  const lim = city.land * PITCH + 4; // panning stays over the city
  const tg = controls.target, before = tg.clone();
  tg.set(THREE.MathUtils.clamp(tg.x, -lim, lim), THREE.MathUtils.clamp(tg.y, 0, 12), THREE.MathUtils.clamp(tg.z, -lim, lim));
  camera.position.add(tg.clone().sub(before));
  controls.update();
  renderer.render(scene, camera);
  updateDistricts();
  requestAnimationFrame(frame);
}

// the side panels start right under the stats panel, however tall it grows (the live row, wrapping)
const stats = document.querySelector('.stats');
new ResizeObserver(() => document.documentElement.style.setProperty('--side-top', `${Math.ceil(stats.getBoundingClientRect().bottom) + 10}px`)).observe(stats);

(async () => {
  const s = await fetchColony();
  applyState(s, true);
  stepCity(false);
  syncViews();
  setInterval(syncViews, 60000); // shifts change, the town grows
  resize();
  const past = [...sim.done.slice(-5).map((p) => [p.at, logLine(p)]), ...sim.events.slice(-3).map((e) => [e.at, eventLine(e)])];
  for (const [at, line] of past.sort((x, y) => x[0] - y[0]).slice(-6)) log(line, at);
  renderLeaders();
  updateDistricts();
  renderHud();
  refreshTicker();
  welcomeBack();
  requestAnimationFrame(frame);
  setInterval(async () => applyState(await fetchColony(known, knownGone), false), s.source === 'demo' ? 2000 : CONFIG.pollMs);
  if (s.source !== 'demo') watchLive(({ now: watching, total }) => {
    $('live').textContent = fmt(watching);
    $('visits').textContent = ` watching${total > watching ? ` · ${fmt(total)} visited` : ''}`;
    $('live-row').title = `${fmt(watching)} watching in the last few minutes · ${fmt(total)} people have visited BaseCity`;
    $('live-row').hidden = false;
  });
})();

window.blocky = { city, crew, views, agents, camera, controls, renderer, get sim() { return sim; }, get minted() { return minted; } };
