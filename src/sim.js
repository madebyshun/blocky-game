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
const FOUNDER_TIER = { id: 'founder', label: 'Founder' };
const BUILDER_TIER = { id: 'base', label: 'Base Builder', pro: true };
const BLOCKY_TIER = { id: 'blocky', label: 'Blocky' };

export const TRAIT_LABEL = {
  shades: 'Shades', basecap: 'Base Cap', goldhat: 'Gold Hard Hat', lasereyes: 'Laser Eyes',
  astronaut: 'Astronaut', diamond: 'Diamond Skin', crown: 'Crown',
};
// Rarity from the Blocky's number and the seed the ledger gave it (the block that brought it): the
// same roll for every visitor, checkable by anyone, unknowable before the buy.
export function rarityOf(n, seed = null) {
  const roll = (salt) => (seed == null ? hash(n, salt) : hash(seed, n, salt));
  const r0 = roll(222);
  let acc = 0;
  for (const r of [...CONFIG.rarity].reverse()) { // rarest first
    acc += r.chance;
    if (r0 < acc) return { rarity: r, trait: r.traits.length ? r.traits[Math.floor(roll(223) * r.traits.length)] : null };
  }
  return { rarity: CONFIG.rarity[0], trait: null };
}

const base = (id) => ({ id, skin: pick(SKIN, id, 15), shirt: pick(SHIRT, id, 16), rarity: null, trait: null, legendIdx: -1 });

// The founder: you, building from the city's first day.
export function makeFounder(start) {
  return {
    ...base(0), kind: 'founder', name: CONFIG.founder?.name ?? 'Founder', legend: CONFIG.founder ?? null,
    role: { ...ROLES[0], label: CONFIG.founder?.title ?? 'Founder' }, tier: FOUNDER_TIER, arrivedAt: start, skill: CONFIG.founderSkill,
  };
}

// A Base Builder: a real builder from CONFIG.legends, added by hand.
export function makeLegend(i, start) {
  const legend = CONFIG.legends[i], id = 100000 + i;
  const joined = legend.joined ? Date.parse(legend.joined) : NaN;
  return {
    ...base(id), kind: 'legend', name: legend.name, legend, legendIdx: i,
    role: { ...ROLES[1 + Math.floor(hash(id, 11) * (ROLES.length - 1))], label: legend.title || 'Base Builder' },
    tier: BUILDER_TIER, arrivedAt: Number.isFinite(joined) ? Math.max(start, joined) : start, skill: CONFIG.builderSkill,
  };
}

// Blocky #n: earned by `from`'s buys. Its look follows from n, its rarity from n and its seed.
// seed: the roll the ledger gave Blocky #n (src/ledger.js rollSeed); without one, the number alone.
export function makeBlocky(n, arrivedAt, from = null, seed = null) {
  const { rarity, trait } = rarityOf(n, seed);
  return {
    ...base(n), kind: 'blocky', name: `${pick(NAMES, n, 14)} #${n}`, legend: null,
    role: ROLES[1 + Math.floor(hash(n, 11) * (ROLES.length - 1))], tier: BLOCKY_TIER,
    arrivedAt, from, seed, skill: CONFIG.blockySkill, rarity, trait,
  };
}

// The founder and every Base Builder, building from the start (or their `joined` date).
export const cityCrew = (start) => [makeFounder(start), ...(CONFIG.legends || []).map((_, i) => makeLegend(i, start))];

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

// w: how often each type is picked in each zone [downtown, midtown, suburbs, outskirts] (see zoneOf)
export const CATALOG = {
  cottage: { label: 'Cottage', min: 0, w: [2, 2.5, 2.2, 1], cost: 24, size: [[3, 4], [3, 4], [2, 2]] },
  garden: { label: 'Community Garden', min: 0, w: [0.6, 1.2, 1.2, 1.4], cost: 18, size: [[6, 6], [6, 6], [1, 1]] },
  house: { label: 'Family House', min: 1, w: [1.5, 2.5, 3, 0.8], cost: 40, size: [[4, 5], [3, 4], [2, 3]] },
  shop: { label: 'Corner Shop', min: 2, w: [2, 1.2, 0.5, 0.1], cost: 48, size: [[4, 5], [4, 4], [2, 2]] },
  park: { label: 'Park', min: 2, w: [1, 1.6, 1.2, 0.4], cost: 36, size: [[6, 6], [6, 6], [1, 1]] },
  farm: { label: 'Farm', min: 3, w: [0, 0.3, 0.4, 3], cost: 28, size: [[6, 6], [6, 6], [1, 1]] },
  cafe: { label: 'gm Café', min: 3, w: [1.4, 0.8, 0.3, 0.1], cost: 55, size: [[4, 5], [4, 5], [2, 3]] },
  playground: { label: 'Playground', min: 4, w: [0.6, 1.2, 1, 0.2], cost: 30, size: [[6, 6], [6, 6], [1, 1]] },
  suburb: { label: 'Suburban Homes', min: 4, w: [0, 0.4, 4, 0.8], cost: 64, size: [[6, 6], [6, 6], [2, 2]] },
  court: { label: 'Basketball Court', min: 5, w: [0.5, 0.9, 0.7, 0.1], cost: 32, size: [[6, 6], [6, 6], [1, 1]] },
  townhouses: { label: 'Townhouses', min: 5, w: [1.4, 2, 1, 0.1], cost: 80, size: [[6, 6], [4, 4], [3, 4]] },
  windmill: { label: 'Wind Turbine', min: 6, w: [0, 0.2, 0.2, 2], cost: 40, size: [[2, 2], [2, 2], [9, 9]] },
  villa: { label: 'Villa', min: 7, w: [0.2, 0.8, 1.6, 0.8], cost: 90, size: [[4, 5], [3, 4], [2, 2]] },
  apartment: { label: 'Apartments', min: 8, w: [2, 1.6, 0.3, 0], cost: 140, size: [[5, 6], [4, 5], [5, 8]] },
  watertower: { label: 'Water Tower', min: 9, w: [0.2, 0.4, 0.4, 0.6], cost: 50, size: [[3, 3], [3, 3], [7, 7]] },
  office: { label: 'Office', min: 10, w: [2.4, 1, 0.1, 0], cost: 200, size: [[5, 6], [4, 6], [6, 11]] },
  devhub: { label: 'Dev Hub', min: 10, w: [1.6, 1, 0.2, 0.1], cost: 160, size: [[5, 6], [5, 6], [4, 7]] },
  school: { label: 'Builder School', min: 12, w: [0.4, 0.9, 0.7, 0.1], cost: 150, size: [[6, 6], [5, 5], [3, 3]] },
  gpufarm: { label: 'GPU Farm', min: 14, w: [0.4, 0.9, 0.3, 1.2], cost: 180, size: [[6, 6], [5, 6], [2, 3]] },
  tower: { label: 'Tower', min: 18, w: [2, 0.5, 0, 0], cost: 480, size: [[4, 5], [4, 5], [12, 18]], pro: true },
  skyscraper: { label: 'Skyscraper', min: 30, w: [1.4, 0.2, 0, 0], cost: 900, size: [[5, 5], [5, 5], [20, 30]], pro: true },
  // leisure: parks and rides
  flowergarden: { label: 'Flower Garden', min: 2, w: [0.5, 1, 0.9, 0.6], cost: 35, size: [[6, 6], [6, 6], [1, 1]] },
  icecream: { label: 'Ice Cream Stand', min: 3, w: [0.8, 0.8, 0.4, 0.1], cost: 30, size: [[3, 3], [3, 3], [3, 3]] },
  lakepark: { label: 'Lake Park', min: 4, w: [0.4, 1, 1, 0.8], cost: 50, size: [[6, 6], [6, 6], [1, 1]] },
  soccer: { label: 'Soccer Field', min: 5, w: [0.2, 0.8, 1, 0.5], cost: 40, size: [[6, 6], [6, 6], [1, 1]] },
  skatepark: { label: 'Skate Park', min: 6, w: [0.4, 0.7, 0.4, 0.1], cost: 45, size: [[6, 6], [6, 6], [1, 1]] },
  pool: { label: 'Public Pool', min: 7, w: [0.4, 0.8, 0.6, 0.1], cost: 70, size: [[6, 6], [6, 6], [1, 1]] },
  carousel: { label: 'Carousel', min: 8, w: [0.4, 0.6, 0.3, 0.1], cost: 90, size: [[5, 5], [5, 5], [3, 3]] },
  stage: { label: 'Concert Stage', min: 9, w: [0.6, 0.6, 0.3, 0.1], cost: 80, size: [[6, 6], [5, 5], [3, 3]] },
  ferris: { label: 'Ferris Wheel', min: 12, w: [0.1, 0.25, 0.15, 0.05], cost: 320, size: [[6, 6], [6, 6], [8, 8]], pro: true },
  coaster: { label: 'Roller Coaster', min: 16, w: [0.1, 0.25, 0.2, 0.1], cost: 380, size: [[6, 6], [6, 6], [5, 5]], pro: true },
  // city services: each arrives once early (FEATURED), then more as the city grows; most send out vehicles
  firestation: { label: 'Fire Station', min: 6, w: [0.15, 0.25, 0.15, 0.05], cost: 120, size: [[6, 6], [5, 5], [3, 3]] },
  police: { label: 'Police Station', min: 9, w: [0.15, 0.25, 0.1, 0.05], cost: 120, size: [[6, 6], [5, 5], [3, 3]] },
  hospital: { label: 'Hospital', min: 14, w: [0.1, 0.2, 0.1, 0], cost: 220, size: [[6, 6], [6, 6], [5, 5]] },
  recycling: { label: 'Recycling Center', min: 18, w: [0, 0.1, 0.1, 0.6], cost: 100, size: [[6, 6], [6, 6], [3, 3]] },
  solarfarm: { label: 'Solar Farm', min: 10, w: [0, 0.2, 0.2, 1.4], cost: 90, size: [[6, 6], [6, 6], [1, 1]] },
  // what Base is building: AI agents and onchain stocks
  aistartup: { label: 'AI Startup', min: 8, w: [1, 0.8, 0.2, 0], cost: 110, size: [[4, 4], [4, 4], [3, 4]] },
  brokerage: { label: 'Brokerage', min: 6, w: [0.8, 0.6, 0.2, 0], cost: 70, size: [[4, 4], [3, 3], [2, 2]] },
};
// Every city gets these early, then they keep appearing at random.
const FEATURED = { 6: 'firestation', 8: 'carousel', 9: 'brokerage', 10: 'police', 11: 'lakepark', 12: 'aistartup', 13: 'ferris', 15: 'hospital', 17: 'coaster', 20: 'recycling', 23: 'solarfarm' };
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
  aistartup: [0xdfe8f5], brokerage: [0x1b2a4a],
};

// SimCity-style zones by ring around Town Square: towers downtown, apartments and shops in midtown,
// homes with yards in the suburbs, then the outskirts: farms, wind and solar.
export const ZONES = ['Downtown', 'Midtown', 'Suburbs', 'Outskirts'];
export const zoneOf = (r) => (r <= 1 ? 0 : r <= 3 ? 1 : r <= 6 ? 2 : 3);

// Industry gathers in a park on the east bank, north of Town Square (out in the suburbs and beyond).
const INDUSTRY = new Set(['windmill', 'watertower', 'gpufarm', 'recycling', 'solarfarm']);
export const isIndustrial = ([i, j]) => ring(i, j) >= 4 && j < 0 && i > riverCol(j) + 1;

// Woods the city keeps: some lots from ring 3 out stay forest for good, in clumps (more in the
// outskirts), so the city grows around green space. Never on a landmark's lot.
const LANDMARK_LOTS = new Set(CONFIG.landmarks.map((l) => l.lot.join(',')));
export function isReserve(i, j) {
  const r = ring(i, j);
  if (r < 3 || isWater(i, j) || LANDMARK_LOTS.has(`${i},${j}`)) return false;
  const n = Math.sin(i * 0.9 + 2.1) * Math.sin(j * 0.8 - 1.3) + 0.5 * Math.sin((i - j) * 0.45 + 0.7);
  return n > (r >= 7 ? 0.5 : 0.62);
}

// Homes, shops and offices get rebuilt denser as the city ages (CitySim.redevelop); parks, rides,
// services, farms, energy, landmarks and fountains stay as they are.
const RENEW = new Set(['cottage', 'house', 'townhouses', 'apartment', 'villa', 'suburb', 'shop', 'cafe', 'office', 'devhub', 'aistartup', 'brokerage', 'tower', 'skyscraper']);
// can something bigger go up here one day? (a skyscraper downtown is as big as it gets)
const canGrow = (p) => {
  const z = zoneOf(ring(...p.lot)), cost = CATALOG[p.type].cost;
  return [...RENEW].some((id) => CATALOG[id].cost > cost && CATALOG[id].w[z] > 0);
};

// only: limit to these types; minCost: nothing smaller than this (a rebuild never shrinks a lot)
function chooseType(k, lot, pro, { only = null, minCost = 0 } = {}) {
  if (!only && FEATURED[k] && (pro || !CATALOG[FEATURED[k]].pro)) return FEATURED[k];
  const z = zoneOf(ring(...lot)), east = isIndustrial(lot);
  const weight = ([id, t]) => t.w[z] * (z >= 2 && INDUSTRY.has(id) ? (east ? 3 : 0.4) : 1);
  const options = Object.entries(CATALOG).filter(([id, t]) => t.min <= k && t.w[z] > 0 && (pro || !t.pro) && (!only || only.has(id)) && t.cost >= minCost);
  if (!options.length) return null;
  const total = options.reduce((s, o) => s + weight(o), 0);
  let x = hash(k, 31) * total;
  for (const o of options) { x -= weight(o); if (x <= 0) return o[0]; }
  return options[options.length - 1][0];
}

// How much longer a building takes by its tier (CONFIG.buildTime): small ones go up fast, big ones slowly.
export const tierOf = (cost) => CONFIG.buildTime.tiers.findIndex((t) => t.upTo == null || cost <= t.upTo);
const slow = (cost) => CONFIG.buildTime.tiers[tierOf(cost)].x;

function buildingProject(k, lot, pro, opts) {
  const type = chooseType(k, lot, pro, opts);
  if (!type) return null;
  const t = CATALOG[type];
  const [W, D, H] = t.size;
  const p = { k, kind: 'building', type, lot, w: range(W, k, 1), d: range(D, k, 2), h: range(H, k, 3) };
  p.color = COLORS[type] ? pick(COLORS[type], k, 4) : 0xffffff;
  p.cost = Math.round(t.cost * (0.8 + (p.h / Math.max(1, H[1])) * 0.4) * slow(t.cost));
  p.name = `${t.label} #${k + 1}`;
  return p;
}

const LANDMARK_SIZE = {
  garage: [5, 4, 3, 60], square: [6, 6, 1, 40], cafe: [5, 4, 3, 90], hq: [6, 6, 12, 400],
  hackathon: [6, 5, 4, 260], studio: [4, 4, 6, 220], datalab: [6, 6, 5, 300],
  launchpad: [6, 6, 14, 900], stadium: [6, 6, 3, 1000], beacon: [3, 3, 20, 1400], liberty: [4, 4, 13, 320], airport: [6, 6, 4, 420],
  exchange: [6, 5, 5, 360], agenthub: [6, 6, 8, 380],
};
export const WONDER_COST = 300;

// ---------- the build plan, replayed over time ----------

export class CitySim {
  constructor(start) { this.start = start; this.whaleList = []; this.setBuilders([]); }

  // whales: buys of CONFIG.whaleUsd+ ({ from, usd, at }), each gets a Whale Fountain
  setCrew(builders, whales = this.whaleList) { this.whaleList = whales.slice().sort((a, b) => a.at - b.at); this.setBuilders(builders); }

  setBuilders(builders) {
    this.builders = builders.slice().sort((a, b) => a.arrivedAt - b.arrivedAt);
    // Crew segments between arrivals and departures: total skill S, crew speed, and the running
    // totals at the segment start (W: blocks placed, P: blocks per unit of skill, to credit each
    // builder its share). A Blocky that left stops working from that moment.
    const events = [];
    for (const b of this.builders) {
      events.push([b.arrivedAt, b.skill]);
      if (Number.isFinite(b.leftAt)) events.push([Math.max(b.arrivedAt, b.leftAt), -b.skill]);
    }
    events.sort((x, y) => x[0] - y[0]);
    this.segs = [];
    let S = 0, W = 0, P = 0;
    events.forEach(([t, ds], i) => {
      S += ds;
      const next = events[i + 1]?.[0];
      if (next === t) return; // several changes at the same moment: one segment
      const rate = S > 1e-9 ? crewRate(S) : 0;
      this.segs.push({ t0: t, S, rate, W, P });
      if (next !== undefined) { const h = (next - t) / HOUR; W += rate * h; P += S > 1e-9 ? (rate / S) * h : 0; }
    });
    // Goals count the Blockies in the city: arrivals minus departures, and the first moment each
    // count was reached (land expansions wait for it).
    const blockies = this.builders.filter((b) => b.kind === 'blocky');
    this.arrivals = blockies.map((b) => b.arrivedAt).sort((x, y) => x - y);
    this.leaves = blockies.filter((b) => Number.isFinite(b.leftAt)).map((b) => b.leftAt).sort((x, y) => x - y);
    this.firstReach = [];
    let i = 0, j = 0, n = 0;
    while (i < this.arrivals.length) {
      if (j < this.leaves.length && this.leaves[j] < this.arrivals[i]) { n--; j++; continue; }
      n++;
      if (this.firstReach[n] === undefined) this.firstReach[n] = this.arrivals[i];
      i++;
    }
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
    const per = (x) => { const g = this.seg(x); return g && g.S > 1e-9 ? g.P + ((g.rate / g.S) * (x - g.t0)) / HOUR : g ? g.P : 0; };
    const end = Math.min(t, Number.isFinite(b.leftAt) ? b.leftAt : Infinity);
    return end <= b.arrivedAt ? 0 : b.skill * (per(end) - per(b.arrivedAt));
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
    this.wonders = new Set(); // whale buys (index in whaleList) whose wonder is planned
    this.metroPlanned = false;
    this.metroBuilt = false;
    this.reserved = new Set(CONFIG.landmarks.map((l) => l.lot.join(',')));
    this.queue = [];
    for (let r = 0; r <= this.land; r++) this.queue.push(...this.ringLots(r));
    this.standing = new Map(); // lot key -> the project standing there now
    // homes, shops and offices in the order they were finished, as [lot key, project k] (see redevelop):
    // the ones that can still grow, and the ones already as big as their zone allows
    this.renew = { grow: [], top: [], at: { grow: 0, top: 0 } };
    this.k = 0;
    this.next = this.plan(this.start);
  }

  ringLots(r) {
    const lots = [];
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        if (ring(i, j) !== r || isWater(i, j) || this.reserved.has(`${i},${j}`) || isReserve(i, j)) continue;
        lots.push([i, j]);
      }
    }
    return lots.sort((a, b) => Math.hypot(...a) + hash(...a, 7) * 0.9 - (Math.hypot(...b) + hash(...b, 7) * 0.9));
  }

  popAt(t) { // Blockies in the city at t (Base Builders and the founder don't count toward goals)
    const upTo = (list) => { let lo = 0, hi = list.length; while (lo < hi) { const m = (lo + hi) >> 1; if (list[m] <= t) lo = m + 1; else hi = m; } return lo; };
    return upTo(this.arrivals) - upTo(this.leaves);
  }
  proAt(t) { return this.builders.some((b) => b.tier.pro && b.arrivedAt <= t); }

  plan(t) {
    const k = this.k++;
    const pop = this.popAt(t), pro = this.proAt(t);
    // a whale's wonder jumps the queue, on the nearest free lot (or in place of the oldest building)
    const wi = this.whaleList.findIndex((w, i) => w.at <= t && !this.wonders.has(i));
    const wlot = wi >= 0 ? (this.queue.length ? this.queue.shift() : this.oldestRenewable()?.lot) : null;
    if (wlot) {
      this.wonders.add(wi);
      const w = this.whaleList[wi];
      return { k, kind: 'wonder', type: 'wonder', lot: wlot, w: 6, d: 6, h: 7, cost: WONDER_COST * CONFIG.buildTime.wonder, color: 0xf4c542, whale: { id: wi + 1, from: w.from, usd: w.usd }, name: `Whale Fountain #${wi + 1}` };
    }
    const lm = CONFIG.landmarks.find((l) => l.at <= pop && (pro || !l.pro) && !this.builtLandmarks.has(l.id) && ring(...l.lot) <= this.land);
    if (lm) {
      const [w, d, h, cost] = LANDMARK_SIZE[lm.id];
      return { k, kind: 'landmark', type: lm.id, lot: lm.lot, w, d, h, cost: cost * CONFIG.buildTime.landmark, color: 0xd5d8dc, name: lm.label };
    }
    const metro = CONFIG.metro;
    if (metro && !this.metroPlanned && pop >= metro.at) { // an elevated loop over the ring road, no lot of its own
      this.metroPlanned = true;
      return { k, kind: 'metro', cost: metro.cost * CONFIG.buildTime.metro, name: metro.label };
    }
    if (this.queue.length) return buildingProject(k, this.queue.shift(), pro);
    // the land is full: reclaim more once enough Blockies are here, rebuild the old city until then
    const L = this.land + 1, need = needFor(L);
    if (pop < need) { const r = this.redevelop(k, pro); if (r) return r; }
    return { k, kind: 'expand', level: L, cost: CONFIG.expandCost * this.land * CONFIG.buildTime.expand, need, name: `Land expansion to ${2 * L + 1}×${2 * L + 1}` };
  }

  // The oldest home, shop or office still standing that can grow (else the oldest of all; taken: it's
  // about to be rebuilt).
  oldestRenewable() {
    for (const list of ['grow', 'top']) {
      const q = this.renew[list];
      while (this.renew.at[list] < q.length) {
        const [key, k] = q[this.renew.at[list]++];
        const p = this.standing.get(key);
        if (p && p.k === k) return p;
      }
    }
    return null;
  }

  // SimCity-style redevelopment, so the city is never finished: the oldest home, shop or office comes
  // down and something at least as big for its zone goes up (early cottages downtown become apartments,
  // then towers).
  redevelop(k, pro) {
    const old = this.oldestRenewable();
    if (!old) return null;
    const p = buildingProject(k, old.lot, pro, { only: RENEW, minCost: CATALOG[old.type].cost })
      || buildingProject(k, old.lot, pro, { only: new Set([old.type]) });
    if (!p) return null;
    p.rebuilds = old.name;
    return p;
  }

  // A project starts when the previous one is done (an expansion also waits for enough Blockies)
  // and is finished once the crew has placed its cost in blocks since then.
  startOf(p) {
    return p.need ? Math.max(this.lastT, this.firstReach[p.need] ?? Infinity) : this.lastT;
  }

  // Replay every project finished by `now`. Returns the newly finished ones.
  advance(now) {
    const finished = [];
    for (let guard = 0; guard < 1e6; guard++) { // the city never stops, so a long history means many projects (~8µs each)
      const p = this.next;
      const start = this.startOf(p);
      if (start > now) break;
      const t = this.timeAtWork(this.workAt(start) + p.cost);
      if (t > now) break;
      p.startedAt = start;
      p.at = t;
      this.done.push(p);
      this.lastT = t;
      if (p.lot) {
        const key = p.lot.join(',');
        this.standing.set(key, p);
        if (p.kind === 'building' && RENEW.has(p.type)) {
          const list = canGrow(p) ? 'grow' : 'top', q = this.renew[list];
          q.push([key, p.k]);
          if (this.renew.at[list] > 4096) { this.renew[list] = q.slice(this.renew.at[list]); this.renew.at[list] = 0; }
        }
      }
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
  get buildingCount() { return this.standing.size; }
}
