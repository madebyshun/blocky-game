import { CONFIG } from './config.js';

// Deterministic city simulation. The whole city is a pure function of
// (Blocky arrival times, city start, now): it keeps building 24/7 with no game
// server, and every visitor sees the same skyline.

export function hash(...xs) {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h ^= Math.imul((x | 0) ^ 0x85ebca6b, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
export const pick = (arr, ...seed) => arr[Math.floor(hash(...seed) * arr.length)];
const range = ([a, b], ...seed) => a + Math.floor(hash(...seed) * (b - a + 1));

// ---------- Blockies ----------

export const ROLES = [
  { id: 'founder', label: 'Founder', hat: 0x0052ff, rate: 1.0 },
  { id: 'contracts', label: 'Smart Contract Dev', hat: 0xf5c518, rate: 1.2 },
  { id: 'frontend', label: 'Frontend Dev', hat: 0x2ecc71, rate: 1.1 },
  { id: 'designer', label: 'Designer', hat: 0xe84393, rate: 0.9 },
  { id: 'community', label: 'Community', hat: 0xe67e22, rate: 0.85 },
  { id: 'research', label: 'Researcher', hat: 0x9b59b6, rate: 1.0 },
];

const NAMES = [
  'Pixel', 'Cubert', 'Nova', 'Brick', 'Mossy', 'Flint', 'Echo', 'Dot', 'Ziggy', 'Pebble',
  'Rusty', 'Juno', 'Bolt', 'Sprout', 'Cobble', 'Luna', 'Gizmo', 'Tofu', 'Rook', 'Sunny',
  'Basalt', 'Clay', 'Opal', 'Waffle', 'Nugget', 'Quartz', 'Bean', 'Fizz', 'Onyx', 'Maple',
];
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xf5d0a9];
const SHIRT = [0x3fa34d, 0x2e86de, 0xe67e22, 0x9b59b6, 0xe74c3c, 0x1abc9c, 0xf1c40f, 0x34495e];
const HOUR = 3600000;
const FOUNDER_TIER = { id: 'founder', label: 'Founder', skill: [CONFIG.founderSkill, CONFIG.founderSkill] };

// One buy = one Blocky; the buy's size picks the tier and the skill inside it.
export function tierOf(usd) {
  let tier = CONFIG.tiers[0];
  for (const t of CONFIG.tiers) if (usd >= t.min) tier = t;
  return tier;
}
export function skillFor(usd) {
  const t = tierOf(usd), next = CONFIG.tiers[CONFIG.tiers.indexOf(t) + 1];
  const f = next ? Math.min(1, Math.max(0, (usd - t.min) / (next.min - t.min))) : 0;
  return t.skill[0] + (t.skill[1] - t.skill[0]) * f;
}

// Which legend (index into CONFIG.legends) a new Blocky becomes, if any: a legend's own wallet
// buying brings that legend; otherwise the next wallet-less legend goes to the next Base Builder.
function legendFor(info, tier, taken) {
  const list = CONFIG.legends || [];
  const from = info?.from?.toLowerCase();
  let i = from ? list.findIndex((l, k) => !taken.has(k) && l.wallet?.toLowerCase() === from) : -1;
  if (i < 0 && tier.pro && !tier.wonder) i = list.findIndex((l, k) => !taken.has(k) && !l.wallet);
  return i;
}

// info: who brought it ({ from, usd, tx, pot }) from the API; taken: legend indexes already in the city.
export function makeBuilder(id, arrivedAt, info = null, taken = new Set()) {
  const founder = id === 1;
  const usd = founder ? 0 : info?.usd ?? CONFIG.usdPerBlocky;
  const tier = founder ? FOUNDER_TIER : tierOf(usd);
  const legendIdx = founder ? -1 : legendFor(info, tier, taken);
  const legend = founder ? CONFIG.founder ?? null : CONFIG.legends?.[legendIdx] ?? null;
  let role = founder ? ROLES[0] : ROLES[1 + Math.floor(hash(id, 11) * (ROLES.length - 1))];
  if (legend?.title) role = { ...role, label: legend.title };
  return {
    id,
    name: `${legend ? legend.name : pick(NAMES, id, 14)} #${id}`,
    role,
    tier,
    legend,
    legendIdx,
    arrivedAt,
    from: founder ? null : info?.from ?? null,
    usd,
    pot: !!info?.pot,
    skin: pick(SKIN, id, 15),
    shirt: pick(SHIRT, id, 16),
    skill: founder ? CONFIG.founderSkill : skillFor(usd),
  };
}

// The crew shares one site, so speed grows with the square root of total skill (no instant cities),
// and each Blocky is credited its share of it.
export const crewRate = (skill) => CONFIG.blocksPerHour * Math.sqrt(skill); // blocks per hour

// ---------- land: a square grid of lots with a river ----------

export const PITCH = 8; // 6 lot + 2 road
export const ring = (i, j) => Math.max(Math.abs(i), Math.abs(j));

export const riverCol = (j) => Math.round(1.6 + Math.sin(j * 0.5 + 0.8) * 1.2);
// The river flows along z; each row j also joins its column to the next row's column.
export function isWater(i, j) {
  const a = riverCol(j), b = riverCol(j + 1);
  return i >= Math.min(a, b) && i <= Math.max(a, b);
}

export const needFor = (L) => {
  const n = CONFIG.expandNeeds;
  return L < n.length ? n[L] : Math.ceil(n[n.length - 1] * 1.5 ** (L - n.length + 1));
};

// ---------- building catalog ----------
// w: weight per zone [downtown (ring<=1), midtown (ring<=3), outskirts], min: projects built before it appears.
// pro: only a crew with a Base Builder (a $100+ buy) can build it.

export const CATALOG = {
  cottage: { label: 'Cottage', min: 0, w: [2, 2.5, 2.5], cost: 24, size: [[3, 4], [3, 4], [2, 2]] },
  garden: { label: 'Community Garden', min: 0, w: [0.6, 1.2, 1.6], cost: 18, size: [[6, 6], [6, 6], [1, 1]] },
  house: { label: 'Family House', min: 1, w: [1.5, 2.5, 2.5], cost: 40, size: [[4, 5], [3, 4], [2, 3]] },
  shop: { label: 'Corner Shop', min: 2, w: [2, 1.2, 0.4], cost: 48, size: [[4, 5], [4, 4], [2, 2]] },
  park: { label: 'Park', min: 2, w: [1, 1.6, 1.2], cost: 36, size: [[6, 6], [6, 6], [1, 1]] },
  farm: { label: 'Farm', min: 3, w: [0, 0.4, 2], cost: 28, size: [[6, 6], [6, 6], [1, 1]] },
  cafe: { label: 'gm Café', min: 3, w: [1.4, 0.8, 0.3], cost: 55, size: [[4, 5], [4, 5], [2, 3]] },
  playground: { label: 'Playground', min: 4, w: [0.6, 1.2, 0.8], cost: 30, size: [[6, 6], [6, 6], [1, 1]] },
  court: { label: 'Basketball Court', min: 5, w: [0.5, 0.9, 0.6], cost: 32, size: [[6, 6], [6, 6], [1, 1]] },
  townhouses: { label: 'Townhouses', min: 5, w: [1.4, 2, 0.8], cost: 80, size: [[6, 6], [4, 4], [3, 4]] },
  windmill: { label: 'Wind Turbine', min: 6, w: [0, 0.3, 1.4], cost: 40, size: [[2, 2], [2, 2], [9, 9]] },
  villa: { label: 'Villa', min: 7, w: [0.2, 0.8, 1.4], cost: 90, size: [[4, 5], [3, 4], [2, 2]] },
  apartment: { label: 'Apartments', min: 8, w: [2, 1.6, 0.4], cost: 140, size: [[5, 6], [4, 5], [5, 8]] },
  watertower: { label: 'Water Tower', min: 9, w: [0.2, 0.4, 0.6], cost: 50, size: [[3, 3], [3, 3], [7, 7]] },
  office: { label: 'Office', min: 10, w: [2.4, 1, 0.1], cost: 200, size: [[5, 6], [4, 6], [6, 11]] },
  devhub: { label: 'Dev Hub', min: 10, w: [1.6, 1, 0.2], cost: 160, size: [[5, 6], [5, 6], [4, 7]] },
  school: { label: 'Builder School', min: 12, w: [0.4, 0.9, 0.4], cost: 150, size: [[6, 6], [5, 5], [3, 3]] },
  gpufarm: { label: 'GPU Farm', min: 14, w: [0.4, 0.9, 1], cost: 180, size: [[6, 6], [5, 6], [2, 3]] },
  tower: { label: 'Tower', min: 18, w: [2, 0.5, 0], cost: 480, size: [[4, 5], [4, 5], [12, 18]], pro: true },
  skyscraper: { label: 'Skyscraper', min: 30, w: [1.4, 0.2, 0], cost: 900, size: [[5, 5], [5, 5], [20, 30]], pro: true },
  // leisure: parks and rides
  flowergarden: { label: 'Flower Garden', min: 2, w: [0.5, 1, 1], cost: 35, size: [[6, 6], [6, 6], [1, 1]] },
  icecream: { label: 'Ice Cream Stand', min: 3, w: [0.8, 0.8, 0.4], cost: 30, size: [[3, 3], [3, 3], [3, 3]] },
  lakepark: { label: 'Lake Park', min: 4, w: [0.4, 1, 1], cost: 50, size: [[6, 6], [6, 6], [1, 1]] },
  soccer: { label: 'Soccer Field', min: 5, w: [0.2, 0.8, 1], cost: 40, size: [[6, 6], [6, 6], [1, 1]] },
  skatepark: { label: 'Skate Park', min: 6, w: [0.4, 0.7, 0.4], cost: 45, size: [[6, 6], [6, 6], [1, 1]] },
  pool: { label: 'Public Pool', min: 7, w: [0.4, 0.8, 0.6], cost: 70, size: [[6, 6], [6, 6], [1, 1]] },
  carousel: { label: 'Carousel', min: 8, w: [0.4, 0.6, 0.4], cost: 90, size: [[5, 5], [5, 5], [3, 3]] },
  stage: { label: 'Concert Stage', min: 9, w: [0.6, 0.6, 0.3], cost: 80, size: [[6, 6], [5, 5], [3, 3]] },
  ferris: { label: 'Ferris Wheel', min: 12, w: [0.1, 0.25, 0.2], cost: 320, size: [[6, 6], [6, 6], [8, 8]], pro: true },
  coaster: { label: 'Roller Coaster', min: 16, w: [0.1, 0.25, 0.25], cost: 380, size: [[6, 6], [6, 6], [5, 5]], pro: true },
  // city services: each arrives once early (FEATURED), then more as the city grows; most send out vehicles
  firestation: { label: 'Fire Station', min: 6, w: [0.15, 0.25, 0.15], cost: 120, size: [[6, 6], [5, 5], [3, 3]] },
  police: { label: 'Police Station', min: 9, w: [0.15, 0.25, 0.1], cost: 120, size: [[6, 6], [5, 5], [3, 3]] },
  hospital: { label: 'Hospital', min: 14, w: [0.1, 0.2, 0.1], cost: 220, size: [[6, 6], [6, 6], [5, 5]] },
  recycling: { label: 'Recycling Center', min: 18, w: [0, 0.1, 0.3], cost: 100, size: [[6, 6], [6, 6], [3, 3]] },
  solarfarm: { label: 'Solar Farm', min: 10, w: [0, 0.2, 0.6], cost: 90, size: [[6, 6], [6, 6], [1, 1]] },
};
// Every city gets these early, then they keep appearing at random.
const FEATURED = { 6: 'firestation', 8: 'carousel', 10: 'police', 11: 'lakepark', 13: 'ferris', 15: 'hospital', 17: 'coaster', 20: 'recycling', 23: 'solarfarm' };
const COLORS = {
  cottage: [0xf3e6d0, 0xe8d5c4, 0xd9e4ec, 0xf0d9da, 0xdfe8d5, 0xfff3c4],
  house: [0xf3e6d0, 0xd9e4ec, 0xf0d9da, 0xe3f1e1, 0xfde2c8],
  shop: [0xfff1e0, 0xe7f0fb, 0xfde8e8],
  cafe: [0xfff1e0, 0xf7e2c7],
  townhouses: [0xe8b4a0, 0xd9c1a6, 0xc7d3dd, 0xe9d8a6],
  villa: [0xf8f8f2, 0xf2ece0],
  apartment: [0xe2c9a5, 0xc9d1da, 0xd8b4a0, 0xe6e1d3],
  office: [0xc9d1da, 0xb8c2cc, 0xd6d0c4, 0xa9b6c4],
  devhub: [0x23395b, 0x1f2f4a, 0x2a3d66],
  school: [0xd35400, 0xc0392b],
  gpufarm: [0x2b2f36, 0x353b44],
  tower: [0xdfe6ee, 0xc4ccd6, 0x9fb1c7, 0xe9e3d6],
  skyscraper: [0x9fb1c7, 0x7f93ad, 0xb7c6d9],
  watertower: [0xd5d8dc],
  coaster: [0xe74c3c], ferris: [0xf4f4f0], carousel: [0xf5c518], stage: [0x2b2f36], icecream: [0xffd1dc],
  firestation: [0xc0392b], police: [0x2c3e66], hospital: [0xf4f6f8], recycling: [0x2e7d32], solarfarm: [0x1d3a6e],
};

const zoneOf = (r) => (r <= 1 ? 0 : r <= 3 ? 1 : 2);

function chooseType(k, r, pro) {
  if (FEATURED[k] && (pro || !CATALOG[FEATURED[k]].pro)) return FEATURED[k];
  const z = zoneOf(r);
  const options = Object.entries(CATALOG).filter(([, t]) => t.min <= k && t.w[z] > 0 && (pro || !t.pro));
  const total = options.reduce((s, [, t]) => s + t.w[z], 0);
  let x = hash(k, 31) * total;
  for (const [id, t] of options) { x -= t.w[z]; if (x <= 0) return id; }
  return options[options.length - 1][0];
}

function buildingProject(k, lot, pro) {
  const r = ring(...lot);
  const type = chooseType(k, r, pro);
  const t = CATALOG[type];
  const [W, D, H] = t.size;
  const p = { k, kind: 'building', type, lot, w: range(W, k, 1), d: range(D, k, 2), h: range(H, k, 3) };
  p.color = COLORS[type] ? pick(COLORS[type], k, 4) : 0xffffff;
  p.cost = Math.round(t.cost * (0.8 + (p.h / Math.max(1, H[1])) * 0.4));
  p.name = `${t.label} #${k + 1}`;
  return p;
}

const LANDMARK_SIZE = {
  garage: [5, 4, 3, 60], square: [6, 6, 1, 40], cafe: [5, 4, 3, 90], hq: [6, 6, 12, 400],
  hackathon: [6, 5, 4, 260], studio: [4, 4, 6, 220], datalab: [6, 6, 5, 300],
  launchpad: [6, 6, 14, 900], stadium: [6, 6, 3, 1000], beacon: [3, 3, 20, 1400], liberty: [4, 4, 13, 320], airport: [6, 6, 4, 420],
};
export const WONDER_COST = 300;

// ---------- the build plan, replayed over time ----------

export class CitySim {
  constructor(start) { this.start = start; this.setBuilders([]); }

  setBuilders(builders) {
    this.builders = builders.slice().sort((a, b) => a.arrivedAt - b.arrivedAt);
    // Crew segments between arrivals: total skill S, crew speed, and the running totals at the
    // segment start (W: blocks placed, P: blocks per unit of skill, to credit each Blocky its share).
    this.segs = [];
    let S = 0, W = 0, P = 0;
    this.builders.forEach((b, i) => {
      S += b.skill;
      const rate = crewRate(S), seg = { t0: b.arrivedAt, S, rate, W, P };
      this.segs.push(seg);
      const t1 = this.builders[i + 1]?.arrivedAt;
      if (t1 !== undefined) { const h = (t1 - b.arrivedAt) / HOUR; W += rate * h; P += (rate / S) * h; }
    });
    this.reset();
  }

  seg(t) { // last segment that started at or before t
    let lo = 0, hi = this.segs.length - 1, at = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (this.segs[m].t0 <= t) { at = m; lo = m + 1; } else hi = m - 1; }
    return this.segs[at];
  }
  workAt(t) { const g = this.seg(t); return g ? g.W + (g.rate * (t - g.t0)) / HOUR : 0; }
  rateAt(t) { return this.seg(t)?.rate ?? 0; }
  blocksBy(b, t) {
    const per = (x) => { const g = this.seg(x); return g ? g.P + ((g.rate / g.S) * (x - g.t0)) / HOUR : 0; };
    return t <= b.arrivedAt ? 0 : b.skill * (per(t) - per(b.arrivedAt));
  }
  // first moment the crew's total reaches w blocks (W(t) is piecewise linear and increasing)
  timeAtWork(w) {
    const s = this.segs;
    let lo = 0, hi = s.length - 1, at = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m].W <= w) { at = m; lo = m + 1; } else hi = m - 1; }
    if (at < 0) return Infinity;
    const g = s[at];
    return g.t0 + ((w - g.W) / g.rate) * HOUR;
  }

  reset() {
    this.land = CONFIG.startLand;
    this.done = []; // completed projects, each with .at
    this.lastT = this.start;
    this.builtLandmarks = new Set();
    this.wonders = new Set(); // whale Blocky ids whose wonder is planned
    this.metroPlanned = false;
    this.metroBuilt = false;
    this.reserved = new Set(CONFIG.landmarks.map((l) => l.lot.join(',')));
    this.queue = [];
    for (let r = 0; r <= this.land; r++) this.queue.push(...this.ringLots(r));
    this.k = 0;
    this.next = this.plan(this.start);
  }

  ringLots(r) {
    const lots = [];
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        if (ring(i, j) !== r || isWater(i, j) || this.reserved.has(`${i},${j}`)) continue;
        lots.push([i, j]);
      }
    }
    return lots.sort((a, b) => Math.hypot(...a) + hash(...a, 7) * 0.9 - (Math.hypot(...b) + hash(...b, 7) * 0.9));
  }

  popAt(t) {
    let n = 0;
    for (const b of this.builders) if (b.arrivedAt <= t) n++;
    return n;
  }
  proAt(t) { return this.builders.some((b) => b.tier.pro && b.arrivedAt <= t); }

  plan(t) {
    const k = this.k++;
    const pop = this.popAt(t), pro = this.proAt(t);
    // a whale's wonder jumps the queue, on the nearest free lot
    const whale = this.builders.find((b) => b.tier.wonder && b.arrivedAt <= t && !this.wonders.has(b.id));
    if (whale && this.queue.length) {
      this.wonders.add(whale.id);
      return { k, kind: 'wonder', type: 'wonder', lot: this.queue.shift(), w: 6, d: 6, h: 7, cost: WONDER_COST, color: 0xf4c542, whale: { id: whale.id, from: whale.from, usd: whale.usd }, name: `Whale Fountain #${whale.id}` };
    }
    const lm = CONFIG.landmarks.find((l) => l.at <= pop && (pro || !l.pro) && !this.builtLandmarks.has(l.id) && ring(...l.lot) <= this.land);
    if (lm) {
      const [w, d, h, cost] = LANDMARK_SIZE[lm.id];
      return { k, kind: 'landmark', type: lm.id, lot: lm.lot, w, d, h, cost, color: 0xd5d8dc, name: lm.label };
    }
    const metro = CONFIG.metro;
    if (metro && !this.metroPlanned && pop >= metro.at) { // an elevated loop over the ring road, no lot of its own
      this.metroPlanned = true;
      return { k, kind: 'metro', cost: metro.cost, name: metro.label };
    }
    if (this.queue.length) return buildingProject(k, this.queue.shift(), pro);
    const L = this.land + 1;
    return { k, kind: 'expand', level: L, cost: CONFIG.expandCost * this.land, need: needFor(L), name: `Land expansion to ${2 * L + 1}×${2 * L + 1}` };
  }

  // A project starts when the previous one is done (an expansion also waits for enough Blockies)
  // and is finished once the crew has placed its cost in blocks since then.
  startOf(p) {
    return p.need ? Math.max(this.lastT, this.builders[p.need - 1]?.arrivedAt ?? Infinity) : this.lastT;
  }

  // Replay every project finished by `now`. Returns the newly finished ones.
  advance(now) {
    const finished = [];
    for (let guard = 0; guard < 5000; guard++) {
      const p = this.next;
      const start = this.startOf(p);
      if (start > now) break;
      const t = this.timeAtWork(this.workAt(start) + p.cost);
      if (t > now) break;
      p.startedAt = start;
      p.at = t;
      this.done.push(p);
      this.lastT = t;
      if (p.kind === 'expand') { this.land = p.level; this.queue.push(...this.ringLots(p.level)); }
      if (p.kind === 'landmark') this.builtLandmarks.add(p.type);
      if (p.kind === 'metro') this.metroBuilt = true;
      finished.push(p);
      this.next = this.plan(t);
    }
    this.work = this.workAt(now);
    const start = this.startOf(this.next);
    this.placed = start > now ? 0 : Math.max(0, Math.min(this.next.cost, this.work - this.workAt(start)));
    const pop = this.popAt(now), rate = this.rateAt(now);
    this.blocked = this.next.need && pop < this.next.need ? { need: this.next.need, have: pop } : null;
    this.eta = this.blocked || !rate ? null : ((this.next.cost - this.placed) / rate) * HOUR; // ms left at today's crew speed
    this.rate = rate;
    this.pro = this.proAt(now);
    return finished;
  }

  // lots that hold a finished building/landmark
  get buildingCount() { return this.done.filter((p) => p.lot).length; }
}
