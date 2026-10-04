import { CONFIG } from './config.js';

// Deterministic city simulation. Everything is a pure function of
// (builder ids, arrival times, current time), so the city keeps "building"
// 24/7 with no game server and every visitor sees the same skyline.

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
const pick = (arr, ...seed) => arr[Math.floor(hash(...seed) * arr.length)];
const range = ([a, b], ...seed) => a + Math.floor(hash(...seed) * (b - a + 1));

// ---------- builders ----------

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

export function makeBuilder(id, arrivedAt) {
  const role = id === 1 ? ROLES[0] : ROLES[1 + Math.floor(hash(id, 11) * (ROLES.length - 1))];
  return {
    id,
    name: `${pick(NAMES, id, 14)} #${id}`,
    role,
    arrivedAt,
    skin: pick(SKIN, id, 15),
    shirt: pick(SHIRT, id, 16),
    rate: CONFIG.blocksPerHour * role.rate * (0.85 + 0.3 * hash(id, 13)), // blocks per hour
  };
}

export const blocksBy = (b, t) => (Math.max(0, t - b.arrivedAt) / HOUR) * b.rate;
export const totalWork = (builders, t) => builders.reduce((s, b) => s + blocksBy(b, t), 0);

// When did the crew's combined work first reach `w` blocks? (binary search, W(t) is monotonic)
export function timeAtWork(builders, w, lo, hi) {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (totalWork(builders, mid) < w) lo = mid; else hi = mid;
  }
  return hi;
}

// ---------- city plan ----------

export const PITCH = 8; // lot (6) + road (2)

const TYPES = {
  loft: { label: 'Builder Loft', w: [4, 5], d: [4, 5], h: [3, 5] },
  cafe: { label: 'gm Café', w: [4, 5], d: [4, 5], h: [2, 3] },
  office: { label: 'Office', w: [5, 6], d: [4, 6], h: [6, 10] },
  devhub: { label: 'Dev Hub', w: [5, 6], d: [5, 6], h: [4, 7] },
  tower: { label: 'Tower', w: [4, 5], d: [4, 5], h: [11, 18] },
  park: { label: 'Park', w: [6, 6], d: [6, 6], h: [1, 1] },
  nodes: { label: 'Node Farm', w: [5, 6], d: [5, 6], h: [2, 3] },
};

const COLORS = {
  loft: [0xf3e6d0, 0xe8d5c4, 0xd9e4ec, 0xf0d9da, 0xdfe8d5],
  cafe: [0xfff1e0, 0xf7e2c7],
  office: [0xc9d1da, 0xb8c2cc, 0xd6d0c4, 0xa9b6c4],
  devhub: [0x23395b, 0x1f2f4a, 0x2a3d66],
  tower: [0xdfe6ee, 0xc4ccd6, 0x9fb1c7, 0xe9e3d6],
  park: [0x6cc24a],
  nodes: [0x5b6470, 0x4a525c],
};

function typeFor(k, ring) {
  const r = hash(k, 31);
  if (ring <= 2) return r < 0.22 ? 'tower' : r < 0.5 ? 'office' : r < 0.68 ? 'devhub' : r < 0.8 ? 'cafe' : r < 0.9 ? 'park' : 'loft';
  if (ring <= 4) return r < 0.08 ? 'tower' : r < 0.3 ? 'office' : r < 0.45 ? 'devhub' : r < 0.58 ? 'cafe' : r < 0.7 ? 'park' : r < 0.8 ? 'nodes' : 'loft';
  return r < 0.15 ? 'office' : r < 0.25 ? 'cafe' : r < 0.4 ? 'park' : r < 0.5 ? 'nodes' : 'loft';
}

const reserved = () => new Set(['0,0', ...CONFIG.landmarks.map((l) => l.lot.join(','))]);
let RESERVED;
const lots = [];
let ringDone = 0;
function ensureLots(n) {
  RESERVED ??= reserved();
  while (lots.length < n) {
    const r = ++ringDone;
    const ring = [];
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) === r && !RESERVED.has(`${i},${j}`)) ring.push([i, j]);
      }
    }
    ring.sort((a, b) => Math.hypot(...a) + hash(...a, 7) * 0.9 - (Math.hypot(...b) + hash(...b, 7) * 0.9));
    lots.push(...ring);
  }
}

const projects = [];
const prefix = [0]; // prefix[k] = total cost of projects 0..k-1

export function project(k) {
  while (projects.length <= k) {
    const n = projects.length;
    ensureLots(n + 1);
    const lot = lots[n];
    const ring = Math.max(Math.abs(lot[0]), Math.abs(lot[1]));
    const type = typeFor(n, ring);
    const t = TYPES[type];
    const p = {
      k: n,
      lot,
      ring,
      type,
      w: range(t.w, n, 1),
      d: range(t.d, n, 2),
      h: range(t.h, n, 3),
      color: pick(COLORS[type], n, 4),
      name: `${t.label} #${n + 1}`,
    };
    p.cost = type === 'park' ? 80 : p.w * p.d * p.h;
    projects.push(p);
    prefix.push(prefix[n] + p.cost);
  }
  return projects[k];
}

export const costBefore = (k) => (project(k), prefix[k]);

// City state for a given amount of total work.
export function cityAt(work) {
  let n = 0;
  while (true) {
    const p = project(n);
    if (prefix[n] + p.cost > work) break;
    n++;
  }
  const active = project(n);
  return { done: n, active, placed: work - prefix[n] };
}
