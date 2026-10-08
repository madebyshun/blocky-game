import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { hash, PITCH, isWater, isReserve, LANDMARKS, AVENUE, CATALOG } from './sim.js';
import { now } from './time.js';
import { makeService, makeDrone } from './fleet.js';
import { catStatue } from './cats.js';

// ---------- materials & merged-box kits ----------

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const BODY_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
export const GLOW_MAT = new THREE.MeshLambertMaterial({ color: 0xa8d8ff, emissive: 0xffd27a, emissiveIntensity: 0.2 });
const BLUE_GLOW = new THREE.MeshLambertMaterial({ color: 0x3d8bff, emissive: 0x0052ff, emissiveIntensity: 0.8 });
const GREEN_GLOW = new THREE.MeshLambertMaterial({ color: 0x8be04e, emissive: 0x4caf00, emissiveIntensity: 0.6 });
const WATER_MAT = new THREE.MeshLambertMaterial({ color: 0x3fa9e8, transparent: true, opacity: 0.88 });
const FLAME_MAT = new THREE.MeshLambertMaterial({ color: 0xffb300, emissive: 0xff8c00, emissiveIntensity: 0.9 });

export const C = {
  walk: 0xd5d8dc, grass: 0x6cc24a, grass2: 0x63b843, lawn: 0x7bd05a, road: 0x3b4048, trunk: 0x7a5230,
  leaf: [0x3f9b3a, 0x4caf50, 0x2e8b3a, 0x5cb85c], dark: 0x2b2f36, white: 0xf4f4f0, base: 0x0052ff,
  roof: [0xc0392b, 0x2e86de, 0x16a085, 0x8e44ad, 0xd35400, 0x7f8c8d], stone: 0xb9bec5, gold: 0xf4c542,
  sand: 0xe6d3a3, wood: 0xa67c52, dirt: 0x7a5230, flower: [0xff6b9d, 0xffd23f, 0xffffff, 0xb388ff, 0xff8a3d],
};

function colored(geo, color) {
  const c = new THREE.Color(color);
  const arr = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Collects boxes (bottom at y) and merges them: one body mesh + glow meshes + animated extras.
class Kit {
  constructor() { this.lists = { body: [], glow: [], blue: [], green: [], water: [], flame: [] }; this.extras = []; }
  add(list, w, h, d, x, y, z, color) {
    const g = UNIT.clone(); g.scale(w, h, d); g.translate(x, y + h / 2, z);
    this.lists[list].push(color === undefined ? g : colored(g, color));
  }
  box(w, h, d, color, x = 0, y = 0, z = 0) { this.add('body', w, h, d, x, y, z, color); }
  // box turned around the vertical axis
  boxR(w, h, d, color, x, y, z, ry, list = 'body') {
    const g = UNIT.clone(); g.scale(w, h, d); g.rotateY(ry); g.translate(x, y + h / 2, z);
    this.lists[list].push(color === undefined ? g : colored(g, color));
  }
  // a beam from point a to point b (rails, spokes, struts)
  beam(a, b, tw, th, color, list = 'body') {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const g = UNIT.clone(); g.scale(tw, th, dir.length());
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize()));
    g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    this.lists[list].push(color === undefined ? g : colored(g, color));
  }
  win(w, h, d, x, y, z) { this.add('glow', w, h, d, x, y, z); }
  blue(w, h, d, x, y, z) { this.add('blue', w, h, d, x, y, z); }
  green(w, h, d, x, y, z) { this.add('green', w, h, d, x, y, z); }
  water(w, h, d, x, y, z) { this.add('water', w, h, d, x, y, z); }
  flame(w, h, d, x, y, z) { this.add('flame', w, h, d, x, y, z); }
  build() {
    const g = new THREE.Group();
    const mats = { body: BODY_MAT, glow: GLOW_MAT, blue: BLUE_GLOW, green: GREEN_GLOW, water: WATER_MAT, flame: FLAME_MAT };
    for (const [name, list] of Object.entries(this.lists)) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeometries(list), mats[name]);
      m.castShadow = name !== 'water';
      m.receiveShadow = true;
      g.add(m);
      list.forEach((x) => x.dispose());
    }
    for (const e of this.extras) g.add(e);
    return g;
  }
}
export const kitFor = (fn) => { const k = new Kit(); fn(k); return k.build(); };

const Y = 0.15; // sidewalk height

function sidewalk(k, color = C.walk) { k.box(6.4, Y, 6.4, color); }
function lawn(k) { k.box(6.4, Y, 6.4, C.lawn); }

function windows(k, w, d, y0, floors, front = true, ox = 0, oz = 0) {
  const row = (len, place) => {
    const n = Math.max(1, Math.floor((len * 0.85) / 0.9));
    const step = (len * 0.85) / n;
    for (let i = 0; i < n; i++) place(-len * 0.425 + step * (i + 0.5));
  };
  for (let f = 0; f < floors; f++) {
    const y = y0 + f + 0.3;
    row(w, (x) => { if (front) k.win(0.55, 0.45, 0.06, ox + x, y, oz + d / 2 + 0.03); k.win(0.55, 0.45, 0.06, ox + x, y, oz - d / 2 - 0.03); });
    row(d, (z) => { k.win(0.06, 0.45, 0.55, ox + w / 2 + 0.03, y, oz + z); k.win(0.06, 0.45, 0.55, ox - w / 2 - 0.03, y, oz + z); });
  }
}

function tree(k, x, z, seed, y = Y) {
  const tall = hash(seed, 9) < 0.3;
  const h = (tall ? 1.6 : 0.9) + hash(seed, 1) * 0.8;
  k.box(0.3, h, 0.3, C.trunk, x, y, z);
  const leaf = C.leaf[Math.floor(hash(seed, 2) * C.leaf.length)];
  if (tall) { // pine
    k.box(1.3, 0.7, 1.3, leaf, x, y + h - 0.3, z);
    k.box(0.9, 0.7, 0.9, leaf, x, y + h + 0.4, z);
    k.box(0.5, 0.6, 0.5, leaf, x, y + h + 1.1, z);
  } else {
    k.box(1.3, 0.9, 1.3, leaf, x, y + h - 0.1, z);
    k.box(0.8, 0.5, 0.8, leaf, x, y + h + 0.8, z);
  }
}
function bush(k, x, z, seed, y = Y) { k.box(0.6, 0.45, 0.6, C.leaf[Math.floor(hash(seed, 3) * 4)], x, y, z); }
function fence(k, w, d, color = C.white, gap = 1.2) {
  for (let s = -w / 2; s <= w / 2 + 0.01; s += 0.8) {
    k.box(0.1, 0.45, 0.1, color, s, Y, -d / 2);
    if (Math.abs(s) > gap / 2) k.box(0.1, 0.45, 0.1, color, s, Y, d / 2);
  }
  for (let s = -d / 2; s <= d / 2 + 0.01; s += 0.8) { k.box(0.1, 0.45, 0.1, color, -w / 2, Y, s); k.box(0.1, 0.45, 0.1, color, w / 2, Y, s); }
  k.box(w, 0.06, 0.06, color, 0, Y + 0.32, -d / 2);
  k.box(0.06, 0.06, d, color, -w / 2, Y + 0.32, 0); k.box(0.06, 0.06, d, color, w / 2, Y + 0.32, 0);
}
function gableRoof(k, w, d, y, color, ox = 0, oz = 0) {
  const steps = Math.ceil(Math.min(w, d) / 1.2);
  for (let i = 0; i < steps; i++) k.box(w + 0.3 - i * 1.0, 0.35, d + 0.3, color, ox, y + i * 0.35, oz);
}

// ---------- billboards ----------

const BOARD_MATS = new Map();
const AD_SLOT = () => {
  const contact = CONFIG.adContact || (CONFIG.xHandle ? `DM @${CONFIG.xHandle}` : 'Advertise on BaseCity');
  return { name: 'YOUR PROJECT HERE', tagline: contact, color: '#1b2233', url: CONFIG.xHandle ? `https://x.com/${CONFIG.xHandle}` : '', placeholder: true };
};
// Billboards rotate through CONFIG.sponsors plus one "your project here" slot, so ad space stays for sale.
export function sponsorFor(slot) {
  const list = CONFIG.sponsors || [];
  if (!list.length) return AD_SLOT();
  const i = slot % (list.length + 1);
  return i < list.length ? list[i] : AD_SLOT();
}

// Logos drawn in code (no image files to host), each into a square of size s at (x, y).
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
export const LOGOS = {
  // a gradient ring with a slot cut on its right
  cbwallet(g, x, y, s) {
    g.fillStyle = '#121a2b'; rr(g, x, y, s, s, s * 0.12);
    const grad = g.createLinearGradient(x + s * 0.2, y + s * 0.15, x + s * 0.8, y + s * 0.85);
    grad.addColorStop(0, '#1238ff'); grad.addColorStop(0.55, '#00d9ff'); grad.addColorStop(1, '#a6ffb3');
    g.strokeStyle = grad; g.lineWidth = s * 0.19;
    g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.27, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#121a2b'; g.fillRect(x + s * 0.5, y + s * 0.44, s * 0.42, s * 0.12);
  },
  // two overlapping rounded squares and a "1"
  o1(g, x, y, s) {
    g.fillStyle = '#1b1b1b'; rr(g, x, y, s, s, s * 0.12);
    const grad = g.createLinearGradient(x + s * 0.2, 0, x + s * 0.78, 0);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#9fd0ff');
    g.fillStyle = grad;
    rr(g, x + s * 0.2, y + s * 0.4, s * 0.28, s * 0.28, s * 0.03);
    rr(g, x + s * 0.3, y + s * 0.5, s * 0.28, s * 0.28, s * 0.03);
    rr(g, x + s * 0.64, y + s * 0.2, s * 0.09, s * 0.48, s * 0.02);
    rr(g, x + s * 0.55, y + s * 0.29, s * 0.18, s * 0.09, s * 0.02);
    g.fillStyle = '#1b1b1b'; g.fillRect(x + s * 0.3, y + s * 0.5, s * 0.18, s * 0.18);
  },
  // a teal swoosh: a V with a loop and a dot
  virtuals(g, x, y, s) {
    const bg = g.createLinearGradient(x, y, x + s, y + s);
    bg.addColorStop(0, '#bdeff0'); bg.addColorStop(1, '#eafbd0');
    g.fillStyle = bg; rr(g, x, y, s, s, s * 0.12);
    g.strokeStyle = '#2b9a96'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = s * 0.075;
    g.beginPath();
    g.moveTo(x + s * 0.2, y + s * 0.42);
    g.quadraticCurveTo(x + s * 0.34, y + s * 0.44, x + s * 0.42, y + s * 0.68);
    g.lineTo(x + s * 0.52, y + s * 0.47);
    g.arc(x + s * 0.57, y + s * 0.4, s * 0.085, Math.PI * 0.7, Math.PI * 2.55);
    g.quadraticCurveTo(x + s * 0.7, y + s * 0.47, x + s * 0.78, y + s * 0.42);
    g.stroke();
    g.fillStyle = '#2b9a96'; g.beginPath(); g.arc(x + s * 0.84, y + s * 0.39, s * 0.03, 0, Math.PI * 2); g.fill();
  },
  // a retro computer with a pixel smiley
  bankr(g, x, y, s) {
    g.fillStyle = '#7b2ff2'; rr(g, x, y, s, s, s * 0.12);
    const ink = '#1b1b1b';
    g.fillStyle = ink; rr(g, x + s * 0.18, y + s * 0.24, s * 0.66, s * 0.54, s * 0.05);
    g.fillStyle = '#efe6d2'; rr(g, x + s * 0.2, y + s * 0.22, s * 0.62, s * 0.5, s * 0.04);
    g.fillStyle = ink; rr(g, x + s * 0.245, y + s * 0.275, s * 0.37, s * 0.33, s * 0.05);
    g.fillStyle = '#ff5a36'; rr(g, x + s * 0.26, y + s * 0.29, s * 0.34, s * 0.3, s * 0.045);
    g.fillStyle = '#ffd400';
    const px = s * 0.025;
    g.fillRect(x + s * 0.36, y + s * 0.38, px, px * 2); g.fillRect(x + s * 0.49, y + s * 0.38, px, px * 2);
    g.fillRect(x + s * 0.33, y + s * 0.48, px, px); g.fillRect(x + s * 0.54, y + s * 0.48, px, px);
    g.fillRect(x + s * 0.355, y + s * 0.505, s * 0.185, px);
    g.fillStyle = ink;
    for (const yy of [0.31, 0.35, 0.39]) g.fillRect(x + s * 0.65, y + s * yy, s * 0.12, s * 0.018);
    for (const xx of [0.68, 0.74]) { g.fillRect(x + s * xx, y + s * 0.46, s * 0.012, s * 0.12); g.fillRect(x + s * (xx - 0.015), y + s * (xx === 0.68 ? 0.52 : 0.49), s * 0.042, s * 0.02); }
    g.fillRect(x + s * 0.27, y + s * 0.65, s * 0.08, s * 0.018);
  },
  // a pink unicorn's head
  uniswap(g, x, y, s) {
    g.fillStyle = '#ff007a'; rr(g, x, y, s, s, s * 0.12);
    g.fillStyle = '#ffffff';
    const P = (pts) => { g.beginPath(); pts.forEach(([u, v], i) => (i ? g.lineTo : g.moveTo).call(g, x + u * s, y + v * s)); g.closePath(); g.fill(); };
    P([[0.36, 0.86], [0.3, 0.56], [0.36, 0.38], [0.46, 0.27], [0.5, 0.12], [0.55, 0.26], [0.66, 0.34], [0.78, 0.5], [0.76, 0.58], [0.66, 0.56], [0.58, 0.5], [0.56, 0.62], [0.64, 0.86]]);
    g.fillStyle = '#ff007a'; g.beginPath(); g.arc(x + s * 0.55, y + s * 0.4, s * 0.03, 0, Math.PI * 2); g.fill();
  },
  // a white butterfly on a blue disc: two wings each side
  morpho(g, x, y, s) {
    g.fillStyle = '#ffffff'; rr(g, x, y, s, s, s * 0.12);
    g.fillStyle = '#2470ff'; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.44, 0, Math.PI * 2); g.fill();
    for (const d of [-1, 1]) {
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(x + s * 0.5, y + s * 0.5); g.lineTo(x + s * (0.5 + d * 0.3), y + s * 0.24); g.lineTo(x + s * (0.5 + d * 0.27), y + s * 0.5); g.closePath(); g.fill();
      g.fillStyle = '#d0e0f8';
      g.beginPath(); g.moveTo(x + s * 0.5, y + s * 0.52); g.lineTo(x + s * (0.5 + d * 0.24), y + s * 0.55); g.lineTo(x + s * (0.5 + d * 0.14), y + s * 0.76); g.closePath(); g.fill();
    }
  },
  // a blue coin: a dollar sign between two arcs
  usdc(g, x, y, s) {
    g.fillStyle = '#ffffff'; rr(g, x, y, s, s, s * 0.12);
    g.fillStyle = '#2775ca'; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = s * 0.045;
    g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.29, Math.PI * 0.62, Math.PI * 1.38); g.stroke();
    g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.29, -Math.PI * 0.38, Math.PI * 0.38); g.stroke();
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${Math.round(s * 0.34)}px Inter, system-ui, sans-serif`; g.fillText('$', x + s / 2, y + s * 0.52);
  },
  // the Base mark: a white disc with a bar cut in from the left, on blue
  basenames(g, x, y, s) {
    g.fillStyle = '#0052ff'; rr(g, x, y, s, s, s * 0.16);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.32, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0052ff'; g.fillRect(x + s * 0.12, y + s * 0.455, s * 0.46, s * 0.09);
  },
  // four lime arrows meeting in the middle
  limitless(g, x, y, s) {
    g.fillStyle = '#0b0b0b'; rr(g, x, y, s, s, s * 0.12);
    g.fillStyle = '#c3ff00';
    const c = [x + s / 2, y + s / 2];
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2, R = (u, v) => [c[0] + Math.cos(a) * u - Math.sin(a) * v, c[1] + Math.sin(a) * u + Math.cos(a) * v];
      g.beginPath(); [R(s * 0.08, 0), R(s * 0.24, -s * 0.12), R(s * 0.24, -s * 0.04), R(s * 0.38, -s * 0.04), R(s * 0.38, s * 0.04), R(s * 0.24, s * 0.04), R(s * 0.24, s * 0.12)].forEach(([u, v], k) => (k ? g.lineTo(u, v) : g.moveTo(u, v)));
      g.closePath(); g.fill();
    }
  },
  // "402" on Coinbase blue: payments for the internet
  x402(g, x, y, s) {
    g.fillStyle = '#0052ff'; rr(g, x, y, s, s, s * 0.12);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${Math.round(s * 0.2)}px Inter, system-ui, sans-serif`; g.fillText('x', x + s / 2, y + s * 0.3);
    g.font = `800 ${Math.round(s * 0.34)}px Inter, system-ui, sans-serif`; g.fillText('402', x + s / 2, y + s * 0.6);
  },
  // a canvas of colourful pixels
  basepaint(g, x, y, s) {
    g.fillStyle = '#1b1b1b'; rr(g, x, y, s, s, s * 0.12);
    const P = ['#0052ff', '#ff5c5c', '#ffd23f', '#2ecc71', '#ffffff', '#b388ff'];
    const n = 5, c = (s * 0.7) / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = P[(i * 7 + j * 3 + i * j) % P.length]; g.fillRect(x + s * 0.15 + i * c, y + s * 0.15 + j * c, c - s * 0.01, c - s * 0.01); }
  },
  // a silicon wafer: a disc with a flat, a grid of dies, and a chip in the middle
  fab(g, x, y, s) {
    g.fillStyle = '#111827'; rr(g, x, y, s, s, s * 0.12);
    const cx = x + s / 2, cy = y + s / 2, r = s * 0.36;
    const grad = g.createLinearGradient(x, y, x + s, y + s); grad.addColorStop(0, '#c7d2fe'); grad.addColorStop(0.5, '#7dd3fc'); grad.addColorStop(1, '#c4b5fd');
    g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.62, Math.PI * 2.38); g.closePath(); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, r * 0.96, 0, Math.PI * 2); g.clip();
    g.strokeStyle = 'rgba(17,24,39,0.35)'; g.lineWidth = s * 0.012;
    for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(cx + i * s * 0.08, cy - r); g.lineTo(cx + i * s * 0.08, cy + r); g.stroke(); g.beginPath(); g.moveTo(cx - r, cy + i * s * 0.08); g.lineTo(cx + r, cy + i * s * 0.08); g.stroke(); }
    g.restore();
    g.fillStyle = '#111827'; rr(g, cx - s * 0.1, cy - s * 0.1, s * 0.2, s * 0.2, s * 0.02);
    g.fillStyle = '#76b900'; rr(g, cx - s * 0.06, cy - s * 0.06, s * 0.12, s * 0.12, s * 0.015);
  },
  // NVIDIA's eye: a white lens on green, a green spiral inside (BaseCity is a meme: fan art, not a partnership)
  nvidia(g, x, y, s) {
    g.fillStyle = '#76b900'; rr(g, x, y, s, s, s * 0.12);
    const cx = x + s * 0.56, cy = y + s * 0.5;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(cx, cy, s * 0.3, s * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(x + s * 0.12, cy - s * 0.2, s * 0.16, s * 0.4);
    g.strokeStyle = '#76b900'; g.lineCap = 'round'; g.lineWidth = s * 0.055;
    g.beginPath(); g.ellipse(cx, cy, s * 0.2, s * 0.12, 0, Math.PI * 0.15, Math.PI * 1.75); g.stroke();
    g.beginPath(); g.ellipse(cx + s * 0.02, cy, s * 0.1, s * 0.055, 0, Math.PI * 0.3, Math.PI * 1.9); g.stroke();
    g.fillStyle = '#76b900'; g.beginPath(); g.arc(cx + s * 0.03, cy, s * 0.025, 0, Math.PI * 2); g.fill();
  },
  // Onchain Summit SF: hand-drawn white letters on blue, each one tilted a little
  onchainsf(g, x, y, s) {
    g.fillStyle = '#1f5cf2'; rr(g, x, y, s, s, s * 0.12);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const word = (text, cy, size, step) => {
      g.font = `400 ${Math.round(size)}px "Lilita One", Inter, system-ui, sans-serif`;
      [...text].forEach((ch, i) => {
        g.save();
        g.translate(x + s / 2 + (i - (text.length - 1) / 2) * step, cy + (i % 2 ? s * 0.012 : -s * 0.012));
        g.rotate(((i * 37) % 7 - 3) * 0.035);
        g.lineWidth = s * 0.03; g.strokeStyle = '#10204a'; g.strokeText(ch, 0, 0);
        g.fillStyle = '#ffffff'; g.fillText(ch, 0, 0);
        g.restore();
      });
    };
    word('ONCHAIN', y + s * 0.4, s * 0.19, s * 0.115);
    word('Summit', y + s * 0.62, s * 0.2, s * 0.12);
  },
  // Venice: two crossed keys under a book, navy on cream
  venice(g, x, y, s) {
    const ink = '#14284b', paper = '#f4efe6';
    g.fillStyle = paper; rr(g, x, y, s, s, s * 0.12);
    const key = (dir) => { // a key from its bow (bottom) to its bit (top), leaning one way
      const bx = x + s * (0.5 - dir * 0.22), by = y + s * 0.72, tx = x + s * (0.5 + dir * 0.2), ty = y + s * 0.26;
      g.strokeStyle = ink; g.lineWidth = s * 0.055; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(bx, by); g.lineTo(tx, ty); g.stroke();
      const a = Math.atan2(ty - by, tx - bx), nx = -Math.sin(a) * dir, ny = Math.cos(a) * dir; // the bit sticks out sideways
      g.fillStyle = ink; g.beginPath();
      g.moveTo(tx, ty); g.lineTo(tx + nx * s * 0.12 + Math.cos(a) * s * 0.02, ty + ny * s * 0.12 + Math.sin(a) * s * 0.02);
      g.lineTo(tx + nx * s * 0.09 - Math.cos(a) * s * 0.05, ty + ny * s * 0.09 - Math.sin(a) * s * 0.05);
      g.lineTo(tx - Math.cos(a) * s * 0.1, ty - Math.sin(a) * s * 0.1); g.closePath(); g.fill();
      g.beginPath(); g.arc(bx, by, s * 0.12, 0, Math.PI * 2); g.fill(); // the bow, a quatrefoil cut out of it
      g.fillStyle = paper;
      for (let q = 0; q < 4; q++) { g.beginPath(); g.arc(bx + Math.cos(q * Math.PI / 2) * s * 0.035, by + Math.sin(q * Math.PI / 2) * s * 0.035, s * 0.035, 0, Math.PI * 2); g.fill(); }
    };
    key(1); key(-1);
    g.fillStyle = ink; g.beginPath(); // the book on top: two pages meeting in a V
    const cx = x + s / 2, top = y + s * 0.17;
    g.moveTo(cx - s * 0.08, top); g.lineTo(cx, top + s * 0.04); g.lineTo(cx + s * 0.08, top); g.lineTo(cx + s * 0.08, top + s * 0.11);
    g.lineTo(cx, top + s * 0.19); g.lineTo(cx - s * 0.08, top + s * 0.11); g.closePath(); g.fill();
    g.strokeStyle = paper; g.lineWidth = s * 0.012; g.beginPath(); g.moveTo(cx, top + s * 0.06); g.lineTo(cx, top + s * 0.16); g.stroke();
  },
  // three tilted rings: blue, light blue, red
  aero(g, x, y, s) {
    g.fillStyle = '#efefef'; rr(g, x, y, s, s, s * 0.12);
    g.lineWidth = s * 0.055;
    [['#1f4fe6', 0.4], ['#93a6f5', 0.5], ['#ff1a12', 0.6]].forEach(([c, cx]) => {
      g.strokeStyle = c;
      g.beginPath(); g.ellipse(x + s * cx, y + s * 0.5, s * 0.13, s * 0.3, 0.55, 0, Math.PI * 2); g.stroke();
    });
  },
};

function boardMaterial(slot) {
  const sp = sponsorFor(slot);
  const key = `${sp.name}|${sp.color}|${sp.logo || ''}`;
  if (BOARD_MATS.has(key)) return { mat: BOARD_MATS.get(key), sp };
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 200;
  const g = cv.getContext('2d');
  g.fillStyle = sp.color || '#0052ff'; g.fillRect(0, 0, 512, 200);
  const logo = LOGOS[sp.logo];
  if (logo) logo(g, 22, 22, 156);
  g.strokeStyle = sp.placeholder ? '#ffc83d' : 'rgba(255,255,255,0.85)'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 190);
  const cx = logo ? 345 : 256, maxW = logo ? 300 : 470;
  g.fillStyle = sp.textColor || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 84;
  do { g.font = `800 ${size}px "Lilita One", Inter, system-ui, sans-serif`; size -= 4; } while (g.measureText(sp.name).width > maxW && size > 24);
  g.fillText(sp.name, cx, sp.tagline ? 82 : 100);
  if (sp.tagline) {
    size = 30;
    do { g.font = `700 ${size}px Inter, system-ui, sans-serif`; size -= 2; } while (g.measureText(sp.tagline).width > maxW && size > 14);
    g.fillStyle = sp.placeholder ? '#ffc83d' : sp.textColor ? sp.textColor : 'rgba(255,255,255,0.9)'; g.fillText(sp.tagline, cx, 150);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
  BOARD_MATS.set(key, mat);
  return { mat, sp };
}
// a billboard on posts, facing +z; the panel is clickable (userData.sponsor)
function billboard(k, x, y, z, w, h, slot, posts = 0.6) {
  for (const px of [-w / 2 + 0.2, w / 2 - 0.2]) k.box(0.12, posts, 0.12, C.dark, x + px, y, z);
  k.box(w + 0.16, h + 0.16, 0.12, C.dark, x, y + posts - 0.08, z - 0.08);
  const { mat, sp } = boardMaterial(slot);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  panel.position.set(x, y + posts + h / 2, z + 0.0);
  panel.userData.sponsor = sp;
  k.extras.push(panel);
}

// ---------- live market boards: the Base Stock Exchange ticker and big board ----------
// Shared canvas textures, redrawn by updateBoards() whenever new market data arrives; every
// exchange and brokerage in the city (and the gallery) shows the same live numbers.

const MOOD = { up: true }; // bull or bear out front
const tickerCanvas = document.createElement('canvas');
tickerCanvas.width = 2048; tickerCanvas.height = 64;
const TICKER_TEX = new THREE.CanvasTexture(tickerCanvas);
TICKER_TEX.colorSpace = THREE.SRGBColorSpace;
TICKER_TEX.wrapS = THREE.RepeatWrapping;
TICKER_TEX.repeat.x = 0.45;
const TICKER_MAT = new THREE.MeshBasicMaterial({ map: TICKER_TEX });
const bigCanvas = document.createElement('canvas');
bigCanvas.width = 512; bigCanvas.height = 256;
const BIG_TEX = new THREE.CanvasTexture(bigCanvas);
BIG_TEX.colorSpace = THREE.SRGBColorSpace;
const BIG_MAT = new THREE.MeshBasicMaterial({ map: BIG_TEX });

// The grid: the GPU District runs on NVDAc, the token $BLOCKY trades against. Its 24h move sets the
// power (0.55 to 1.5): the green lights of every GPU farm and how fast the Power Plant's fans spin.
export const GRID = { power: 1, quote: null, tier: '', level: 0 };
const gpuCanvas = document.createElement('canvas');
gpuCanvas.width = 512; gpuCanvas.height = 256;
const GPU_TEX = new THREE.CanvasTexture(gpuCanvas);
GPU_TEX.colorSpace = THREE.SRGBColorSpace;
const GPU_MAT = new THREE.MeshLambertMaterial({ map: GPU_TEX, emissive: 0xffffff, emissiveMap: GPU_TEX, emissiveIntensity: 0.55 });

const price = (v) => (v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(4) : v.toPrecision(4));
const compact = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toFixed(0));
const pct = (c) => `${c >= 0 ? '▲' : '▼'} ${Math.abs(c).toFixed(1)}%`;

export function updateBoards({ market = null, population = 0 } = {}) {
  MOOD.up = !market || market.change24h >= 0;
  const items = [];
  if (market) items.push([`${CONFIG.ticker} $${price(market.priceUsd)}`, market.change24h]);
  for (const st of market?.stocks || []) items.push([`${st.symbol} $${price(st.priceUsd)}`, st.change24h]);
  if (market?.volume24h) items.push([`VOL 24H $${compact(market.volume24h)}`]);
  if (population) items.push([`${population} BLOCKIES BUILDING`]);
  items.push([`${CONFIG.cityName.toUpperCase()} STOCK EXCHANGE`]);
  const g = tickerCanvas.getContext('2d');
  g.fillStyle = '#05070b'; g.fillRect(0, 0, 2048, 64);
  g.font = '700 38px "Courier New", ui-monospace, monospace'; g.textBaseline = 'middle';
  let x = 20;
  while (x < 2048) {
    for (const [label, change] of items) {
      g.fillStyle = '#ffc83d'; g.fillText(label, x, 34); x += g.measureText(label).width + 16;
      if (typeof change === 'number') { g.fillStyle = change >= 0 ? '#2ee87a' : '#ff5c5c'; const t = pct(change); g.fillText(t, x, 34); x += g.measureText(t).width + 16; }
      g.fillStyle = '#4a5568'; g.fillText('◆', x, 34); x += 48;
    }
  }
  TICKER_TEX.needsUpdate = true;
  const b = bigCanvas.getContext('2d');
  b.fillStyle = '#05070b'; b.fillRect(0, 0, 512, 256);
  b.strokeStyle = '#1f2937'; b.lineWidth = 8; b.strokeRect(4, 4, 504, 248);
  b.textAlign = 'center'; b.textBaseline = 'middle';
  b.fillStyle = '#ffc83d'; b.font = '800 54px Inter, system-ui, sans-serif'; b.fillText(CONFIG.ticker, 256, 62);
  if (market) {
    b.fillStyle = MOOD.up ? '#2ee87a' : '#ff5c5c'; b.font = '800 84px Inter, system-ui, sans-serif'; b.fillText(pct(market.change24h), 256, 146);
    b.fillStyle = '#9aa6b8'; b.font = '700 30px "Courier New", monospace'; b.fillText(`$${price(market.priceUsd)} · 24H`, 256, 214);
  } else {
    b.fillStyle = '#9aa6b8'; b.font = '700 34px Inter, system-ui, sans-serif'; b.fillText('MARKET OPENING', 256, 150);
  }
  BIG_TEX.needsUpdate = true;

  const q = (market?.stocks || []).find((st) => /nvda/i.test(st.symbol)) || null;
  GRID.quote = q;
  GRID.power = q && typeof q.change24h === 'number' ? Math.max(0.55, Math.min(1.5, 1 + q.change24h / 8)) : 1;
  drawGpuScreen();
}
// the Power Plant's GPU, upgraded as the Chip Fab makes chips (src/chips.js): its name on the screen
export function setGpuTier(name, level) {
  if (GRID.tier === name) return;
  GRID.tier = name; GRID.level = level;
  drawGpuScreen();
}
function drawGpuScreen() {
  const q = GRID.quote;
  const v = gpuCanvas.getContext('2d');
  v.fillStyle = '#05070b'; v.fillRect(0, 0, 512, 256);
  v.strokeStyle = '#76b900'; v.lineWidth = 8; v.strokeRect(4, 4, 504, 248);
  v.textAlign = 'center'; v.textBaseline = 'middle';
  v.fillStyle = '#76b900'; v.font = '800 50px Inter, system-ui, sans-serif'; v.fillText(q?.symbol || 'NVDAc', 256, 52);
  v.fillStyle = '#ffffff'; v.font = '800 70px Inter, system-ui, sans-serif'; v.fillText(q ? `$${price(q.priceUsd)}` : 'THE GRID', 256, 122);
  if (q && typeof q.change24h === 'number') { v.fillStyle = q.change24h >= 0 ? '#2ee87a' : '#ff5c5c'; v.font = '800 36px Inter, system-ui, sans-serif'; v.fillText(`${pct(q.change24h)} 24H`, 256, 178); }
  v.fillStyle = '#1f2937'; v.fillRect(40, 208, 432, 24);
  v.fillStyle = '#76b900'; v.fillRect(40, 208, Math.min(432, 432 * (GRID.power / 1.5)), 24);
  v.fillStyle = '#ffffff'; v.font = '800 20px Inter, system-ui, sans-serif'; v.fillText(`GRID ${Math.round(GRID.power * 100)}%${GRID.tier ? ` · GPU: ${GRID.tier.toUpperCase()}` : ''}`, 256, 221);
  GPU_TEX.needsUpdate = true;
}
updateBoards();

// a scrolling LED strip on a facade (faces +z)
function tickerStrip(k, w, h, x, y, z) {
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, h), TICKER_MAT);
  strip.position.set(x, y, z);
  strip.userData.animate = (t) => { TICKER_TEX.offset.x = (t * 0.035) % 1; };
  k.extras.push(strip);
}

// ---------- building designs (local coords, lot centre = origin, door faces +z) ----------

const DESIGN = {
  cottage(k, p) {
    lawn(k);
    const roof = C.roof[p.k % C.roof.length];
    k.box(p.w, p.h, p.d, p.color, 0, Y, -0.6);
    k.win(0.6, 0.5, 0.06, p.w / 4, Y + 0.6, p.d / 2 - 0.57);
    k.box(0.7, 1.1, 0.08, 0x8b5a2b, -p.w / 5, Y, p.d / 2 - 0.55);
    gableRoof(k, p.w, p.d, Y + p.h, roof, 0, -0.6);
    k.box(0.35, 0.8, 0.35, C.stone, p.w / 3, Y + p.h + 0.3, -1);
    for (let i = 0; i < 3; i++) k.box(0.3, 0.25, 0.3, C.flower[(p.k + i) % 5], -2.4 + i * 0.5, Y, 2.4);
    tree(k, 2.4, 2.2, p.k);
  },
  house(k, p) {
    lawn(k);
    const roof = C.roof[(p.k + 2) % C.roof.length];
    k.box(p.w, p.h, p.d, p.color, 0, Y, -0.8);
    windows(k, p.w, p.d, Y, p.h, true, 0, -0.8);
    k.box(0.8, 1.2, 0.08, 0x6e4b2a, 0, Y, p.d / 2 - 0.75);
    gableRoof(k, p.w, p.d, Y + p.h, roof, 0, -0.8);
    k.box(1.6, 0.06, 2.2, C.walk, 0, Y, 2.0);
    fence(k, 6.2, 6.2, C.white, 1.8);
    bush(k, -2, 2.3, p.k); bush(k, 2, 2.3, p.k + 1);
    if (hash(p.k, 70) < 0.5) { k.box(1.4, 0.5, 0.8, C.roof[p.k % 6], 2.3, Y, 0.4); k.box(1, 0.35, 0.7, 0x9fd8ff, 2.3, Y + 0.5, 0.4); }
  },
  shop(k, p) {
    sidewalk(k);
    k.box(p.w, p.h, p.d, p.color, 0, Y, 0);
    k.win(p.w * 0.75, 1.1, 0.06, 0, Y + 0.3, p.d / 2 + 0.03);
    windows(k, p.w, p.d, Y + 1, p.h - 1, false);
    const c = C.roof[p.k % 6];
    for (let i = 0; i < Math.round(p.w / 0.5); i++) k.box(0.5, 0.12, 0.8, i % 2 ? C.white : c, -p.w / 2 + 0.25 + i * 0.5, Y + 1.55, p.d / 2 + 0.4);
    k.box(p.w + 0.2, 0.25, p.d + 0.2, 0x7f8c8d, 0, Y + p.h, 0);
    k.box(2, 0.5, 0.12, c, 0, Y + p.h + 0.25, p.d / 2 - 0.1);
    for (let i = 0; i < 3; i++) k.box(0.45, 0.45, 0.45, [0xe74c3c, C.gold, 0x2ecc71][i], -1.2 + i * 1.2, Y, p.d / 2 + 1.1);
  },
  cafe(k, p) {
    sidewalk(k);
    k.box(p.w, p.h, p.d, p.color, 0, Y, -0.5);
    k.win(p.w * 0.7, 1.1, 0.06, 0, Y + 0.3, p.d / 2 - 0.47);
    windows(k, p.w, p.d, Y + 1.3, p.h - 1.3, false, 0, -0.5);
    for (let i = 0; i < Math.round(p.w / 0.5); i++) k.box(0.5, 0.12, 0.9, i % 2 ? C.white : 0x8b4513, -p.w / 2 + 0.25 + i * 0.5, Y + 1.6, p.d / 2 - 0.05);
    k.box(2.2, 0.6, 0.15, C.base, 0, Y + p.h, p.d / 2 - 0.7);
    k.box(p.w + 0.2, 0.2, p.d + 0.2, 0x8b4513, 0, Y + p.h, -0.5);
    for (const x of [-1.6, 0, 1.6]) { k.box(0.6, 0.4, 0.6, C.white, x, Y, 2.5); k.box(0.08, 1.1, 0.08, C.dark, x, Y + 0.4, 2.5); k.box(0.9, 0.08, 0.9, 0xe74c3c, x, Y + 1.5, 2.5); }
  },
  garden(k, p) {
    k.box(6.4, Y, 6.4, 0x6b4423);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
      const ripe = hash(p.k, i, j) > 0.45;
      k.box(0.6, ripe ? 0.5 : 0.3, 0.6, ripe ? C.flower[(i + j) % 5] : 0x7cc94a, -2.4 + i * 1.2, Y, -2 + j * 1.3);
    }
    fence(k, 6.2, 6.2, C.wood, 1.4);
    k.box(0.8, 0.8, 0.8, C.wood, 2.4, Y, 2.4);
  },
  park(k, p) {
    k.box(6.4, Y, 6.4, C.lawn);
    k.box(6.4, 0.17, 1, C.sand, 0, 0, 0); k.box(1, 0.17, 6.4, C.sand, 0, 0, 0);
    k.box(1.8, 0.35, 1.8, C.stone, 0, Y, 0);
    k.water(1.3, 0.37, 1.3, 0, Y, 0);
    k.box(0.3, 0.9, 0.3, C.stone, 0, Y + 0.3, 0);
    for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2], [-2.6, -1], [1, 2.6]]) tree(k, x, z, p.k * 13 + x * 3 + z);
    k.box(1.2, 0.3, 0.4, C.wood, -1.6, Y, 0.9); k.box(0.4, 0.3, 1.2, C.wood, 0.9, Y, -1.6);
    for (let i = 0; i < 6; i++) k.box(0.25, 0.25, 0.25, C.flower[i % 5], -2.6 + hash(p.k, i) * 1.2, Y, 1.4 + hash(p.k, i, 2));
  },
  farm(k, p) {
    k.box(6.4, Y, 6.4, 0x6b4423);
    for (let r = 0; r < 6; r++) k.box(5.6, 0.28, 0.5, r % 2 ? 0xe8c547 : 0x7cc94a, 0, Y, -2.6 + r * 0.95);
    fence(k, 6.2, 6.2, C.wood, 0);
    k.box(1.6, 1.4, 1.2, 0xc0392b, -2.2, Y, 2.3); gableRoof(k, 1.6, 1.2, Y + 1.4, C.white, -2.2, 2.3);
    k.box(0.3, 1.6, 0.3, C.wood, 2.5, Y, 2.3); k.box(1, 0.15, 0.15, C.wood, 2.5, Y + 1.1, 2.3); k.box(0.45, 0.45, 0.45, 0xe8c547, 2.5, Y + 1.4, 2.3);
  },
  playground(k, p) {
    k.box(6.4, Y, 6.4, C.lawn);
    k.box(5, 0.17, 5, 0xe6a57e, 0, 0, 0);
    for (const [x, z] of [[-1.8, -1.8], [-0.8, -1.8], [-1.8, -0.8], [-0.8, -0.8]]) k.box(0.15, 1.5, 0.15, 0xe74c3c, x, Y, z);
    k.box(1.2, 0.15, 1.2, C.gold, -1.3, Y + 1.5, -1.3);
    k.box(0.8, 0.1, 2.2, 0x2e86de, -1.3, Y + 0.7, 0.2);
    k.box(2.6, 0.12, 0.12, C.dark, 1.3, Y + 1.6, -1.3);
    k.box(0.12, 1.6, 0.12, C.dark, 0.1, Y, -1.3); k.box(0.12, 1.6, 0.12, C.dark, 2.5, Y, -1.3);
    k.box(0.5, 0.08, 0.3, 0xe74c3c, 0.8, Y + 0.5, -1.3); k.box(0.5, 0.08, 0.3, 0x2ecc71, 1.8, Y + 0.5, -1.3);
    k.box(1.4, 0.3, 1.4, C.sand, 1.3, Y, 1.3);
    tree(k, 2.6, 2.6, p.k); tree(k, -2.6, 2.6, p.k + 3);
  },
  court(k) {
    k.box(6.4, Y, 6.4, C.walk);
    k.box(5.6, 0.17, 4.6, 0xd35400, 0, 0, 0);
    k.box(5.6, 0.18, 0.08, C.white, 0, 0, 0);
    k.box(1.6, 0.18, 1.6, 0xe67e22, 0, 0, 0);
    for (const x of [-2.6, 2.6]) { k.box(0.15, 2, 0.15, C.dark, x, Y, 0); k.box(0.08, 0.7, 1, C.white, x * 0.96, Y + 1.8, 0); k.box(0.4, 0.06, 0.4, 0xe74c3c, x * 0.88, Y + 1.8, 0); }
    k.box(0.3, 0.3, 0.3, 0xe67e22, 0.8, Y, 0.6);
  },
  townhouses(k, p) {
    sidewalk(k);
    const n = 3, uw = p.w / n;
    for (let i = 0; i < n; i++) {
      const x = -p.w / 2 + uw / 2 + i * uw, h = p.h + (i % 2 ? 0.5 : 0);
      const c = [0xe8b4a0, 0xd9c1a6, 0xc7d3dd, 0xe9d8a6][(p.k + i) % 4];
      k.box(uw - 0.08, h, p.d, c, x, Y, 0);
      for (let f = 0; f < Math.floor(h); f++) { k.win(0.5, 0.5, 0.06, x, Y + f + 0.35, p.d / 2 + 0.03); k.win(0.5, 0.5, 0.06, x, Y + f + 0.35, -p.d / 2 - 0.03); }
      k.box(0.6, 1, 0.08, 0x5a3a1a, x, Y, p.d / 2 + 0.05);
      k.box(uw + 0.05, 0.3, p.d + 0.3, C.roof[(p.k + i) % 6], x, Y + h, 0);
      k.box(0.3, 0.6, 0.3, C.stone, x, Y + h + 0.3, -p.d / 4);
    }
  },
  windmill(k, p) {
    k.box(6.4, Y, 6.4, C.grass2);
    k.box(1.4, 0.4, 1.4, C.stone, 0, Y, 0);
    k.box(0.5, 8, 0.5, C.white, 0, Y + 0.4, 0);
    k.box(0.6, 0.6, 1.1, C.white, 0, Y + 8.2, 0);
    const rotor = new THREE.Group();
    rotor.position.set(0, Y + 8.5, 0.6);
    const blades = new Kit();
    for (let i = 0; i < 3; i++) {
      const g = UNIT.clone(); g.scale(0.25, 3.4, 0.08); g.translate(0, 1.7, 0); g.rotateZ((i * Math.PI * 2) / 3);
      blades.lists.body.push(colored(g, C.white));
    }
    blades.box(0.35, 0.35, 0.3, C.base, 0, -0.17, 0);
    rotor.add(blades.build());
    const spin = 1.2 + hash(p.k, 5);
    rotor.userData.animate = (t, dt) => { rotor.rotation.z += dt * spin; };
    k.extras.push(rotor);
    tree(k, 2.4, 2.4, p.k); bush(k, -2.3, 2, p.k);
  },
  // the suburbs' staple: four small homes with front yards, two facing each street, a shared
  // driveway and a hedge between the back gardens
  suburb(k, p) {
    lawn(k);
    const WALLS = [0xf3e6d0, 0xd9e4ec, 0xf0d9da, 0xe3f1e1, 0xfde2c8, 0xfff3c4], HEDGE = 0x3f8a3a;
    k.box(5.8, 0.3, 0.16, HEDGE, 0, Y, 0);
    for (const face of [-1, 1]) {
      k.box(0.9, 0.04, 2.3, 0x9aa3ad, 0, Y, face * 1.95); // driveway
      if (hash(p.k, face, 85) < 0.6) {
        const car = C.roof[Math.floor(hash(p.k, face, 86) * C.roof.length)];
        k.box(0.62, 0.3, 1.0, car, 0, Y + 0.04, face * 2.25);
        k.box(0.52, 0.22, 0.5, 0x9fd8ff, 0, Y + 0.34, face * 2.2);
      }
      for (const side of [-1, 1]) {
        const roll = (salt) => hash(p.k, face, side, salt), seed = p.k * 7 + face * 3 + side, x = side * 1.55, hz = face * 1.0;
        const w = 1.8, d = 1.4, h = 1.05 + roll(82) * 0.35;
        k.box(w, h, d, WALLS[Math.floor(roll(80) * WALLS.length)], x, Y, hz);
        gableRoof(k, w, d, Y + h, C.roof[Math.floor(roll(81) * C.roof.length)], x, hz);
        const doorX = x - side * 0.4, front = hz + face * (d / 2 + 0.02);
        k.box(0.42, 0.72, 0.06, 0x6e4b2a, doorX, Y, front);
        k.win(0.42, 0.34, 0.06, x + side * 0.38, Y + 0.45, front);
        k.box(0.4, 0.04, 1.3, C.walk, doorX, Y, face * 2.35); // path to the street
        k.box(0.85, 0.28, 0.14, HEDGE, x + side * 0.45, Y, face * 2.95); // hedge by the sidewalk
        if (roll(83) < 0.7) tree(k, x + side * 0.8, face * 2.3, seed);
        else bush(k, x + side * 0.8, face * 2.35, seed);
        if (roll(84) < 0.25) k.water(0.8, 0.12, 0.5, x, Y + 0.02, face * 0.35); // a little pool out back
      }
    }
  },
  villa(k, p) {
    lawn(k);
    k.box(p.w, p.h, p.d, p.color, -0.6, Y, -1.2);
    k.win(p.w * 0.8, 1, 0.06, -0.6, Y + 0.3, p.d / 2 - 1.17);
    k.box(p.w + 0.6, 0.25, p.d + 0.6, 0x2b2f36, -0.6, Y + p.h, -1.2);
    k.box(2.4, 0.18, 1.6, C.white, 0.9, Y, 1.9);
    k.water(2, 0.2, 1.2, 0.9, Y + 0.02, 1.9);
    k.box(0.6, 0.2, 1.2, C.white, -1.4, Y, 1.8);
    tree(k, -2.6, 2.6, p.k); tree(k, 2.6, -2.6, p.k + 1);
    k.box(0.1, 1.6, 0.1, C.trunk, -2.6, Y, 0.6); k.box(1, 0.2, 1, 0x2e8b3a, -2.6, Y + 1.6, 0.6);
  },
  apartment(k, p) {
    sidewalk(k);
    k.box(p.w, p.h, p.d, p.color, 0, Y, 0);
    windows(k, p.w, p.d, Y, p.h);
    for (let f = 1; f < p.h; f++) k.box(p.w * 0.8, 0.08, 0.5, C.white, 0, Y + f, p.d / 2 + 0.25);
    k.box(1, 1.3, 0.08, C.dark, 0, Y, p.d / 2 + 0.05);
    k.box(p.w + 0.2, 0.3, p.d + 0.2, 0x8a7f72, 0, Y + p.h, 0);
    k.box(1.4, 0.9, 1.4, C.stone, p.w / 4, Y + p.h + 0.3, -p.d / 4);
    bush(k, -2.6, 2.6, p.k); bush(k, 2.6, 2.6, p.k + 2);
  },
  watertower(k, p) {
    k.box(6.4, Y, 6.4, C.grass2);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.2, 5, 0.2, 0x7f8c8d, x, Y, z);
    k.box(2.2, 0.15, 0.15, 0x7f8c8d, 0, Y + 2.5, -1); k.box(2.2, 0.15, 0.15, 0x7f8c8d, 0, Y + 2.5, 1);
    k.box(2.8, 1.8, 2.8, 0x5dade2, 0, Y + 5, 0);
    k.box(2.2, 0.6, 2.2, 0x5dade2, 0, Y + 6.8, 0);
    k.box(2.9, 0.3, 2.9, C.white, 0, Y + 5.8, 0);
    tree(k, 2.5, 2.5, p.k); tree(k, -2.5, 2.2, p.k + 4);
  },
  office(k, p) {
    sidewalk(k);
    k.box(p.w, 1, p.d, 0x6b7785, 0, Y, 0);
    k.win(p.w * 0.6, 0.8, 0.06, 0, Y, p.d / 2 + 0.03);
    k.box(p.w, p.h - 1, p.d, p.color, 0, Y + 1, 0);
    windows(k, p.w, p.d, Y + 1, p.h - 1);
    k.box(p.w + 0.2, 0.35, p.d + 0.2, 0x8a96a3, 0, Y + p.h, 0);
    k.box(1, 0.6, 0.8, C.stone, -p.w / 4, Y + p.h + 0.35, 0);
    k.box(0.8, 0.5, 0.8, C.stone, p.w / 4, Y + p.h + 0.35, p.d / 5);
    if (p.h >= 8) { k.box(0.12, 2, 0.12, C.dark, 0, Y + p.h + 0.35, -p.d / 4); k.win(0.25, 0.25, 0.25, 0, Y + p.h + 2.35, -p.d / 4); }
  },
  devhub(k, p) {
    sidewalk(k);
    k.box(p.w, p.h, p.d, p.color, 0, Y, 0);
    windows(k, p.w, p.d, Y, p.h);
    k.box(p.w + 0.2, 0.25, p.d + 0.2, 0x111827, 0, Y + p.h, 0);
    k.blue(1.6, 0.25, 1.6, 0, Y + p.h + 0.25, 0);
    for (let i = 0; i < 3; i++) k.box(0.9, 0.12, 1.4, 0x1f3b73, -p.w / 2 + 1 + i * 1.1, Y + p.h + 0.25, -p.d / 2 + 1.1);
    k.box(1.2, 1.4, 0.08, 0x0b1220, 0, Y, p.d / 2 + 0.05);
  },
  school(k, p) {
    sidewalk(k);
    k.box(p.w, p.h, p.d - 1.5, p.color, 0, Y, -1.4);
    windows(k, p.w, p.d - 1.5, Y, p.h, true, 0, -1.4);
    k.box(1.6, p.h + 1, 1.6, 0xe9e3d6, 0, Y, -0.2);
    k.box(1.2, 1.2, 0.08, C.white, 0, Y + p.h - 0.2, 0.62);
    k.box(0.08, 0.5, 0.06, C.dark, 0, Y + p.h + 0.15, 0.68);
    k.box(p.w + 0.2, 0.25, p.d - 1.3, 0x7f8c8d, 0, Y + p.h, -1.4);
    k.box(5.6, 0.17, 1.8, 0xe6a57e, 0, 0, 2.2);
    k.box(0.1, 2.4, 0.1, C.dark, 2.6, Y, 2.6); k.box(0.9, 0.5, 0.05, C.base, 3.05, Y + 1.9, 2.6);
  },
  gpufarm(k, p) {
    sidewalk(k, 0x9aa3ad);
    k.box(p.w, p.h, p.d, p.color, 0, Y, 0);
    for (let i = 0; i < Math.floor(p.w / 1.1); i++) k.green(0.6, 0.12, 0.06, -p.w / 2 + 0.7 + i * 1.1, Y + p.h - 0.6, p.d / 2 + 0.03);
    for (let i = 0; i < Math.floor(p.d / 1.2); i++) {
      const z = -p.d / 2 + 0.8 + i * 1.2;
      k.box(p.w - 1, 0.7, 0.5, 0x1d2127, 0, Y + p.h, z);
      for (let j = 0; j < 4; j++) k.green(0.14, 0.12, 0.06, -p.w / 2 + 1 + j * ((p.w - 2) / 3), Y + p.h + 0.35, z + 0.27);
    }
    k.box(1.2, 1.4, 0.08, C.dark, 0, Y, p.d / 2 + 0.05);
    for (const x of [-2.6, 2.6]) k.box(0.8, 1.2, 0.8, 0x7f8c8d, x, Y, 2.6);
  },
  tower(k, p) {
    sidewalk(k);
    const h1 = Math.ceil(p.h * 0.62);
    k.box(p.w, h1, p.d, p.color, 0, Y, 0);
    windows(k, p.w, p.d, Y, h1);
    k.box(p.w - 1, p.h - h1, p.d - 1, p.color, 0, Y + h1, 0);
    windows(k, p.w - 1, p.d - 1, Y + h1, p.h - h1);
    k.box(p.w - 1.6, 0.6, p.d - 1.6, C.base, 0, Y + p.h, 0);
    k.box(0.15, 2.4, 0.15, C.dark, 0, Y + p.h + 0.6, 0);
    k.win(0.3, 0.3, 0.3, 0, Y + p.h + 3, 0);
  },
  skyscraper(k, p) {
    sidewalk(k, 0xc9ced4);
    const a = Math.ceil(p.h * 0.5), b = Math.ceil(p.h * 0.3);
    let y = Y;
    for (const [s, h] of [[p.w, a], [p.w - 1, b], [p.w - 2, p.h - a - b]]) {
      if (h <= 0) continue;
      k.box(s, h, s, p.color, 0, y, 0);
      windows(k, s, s, y, h);
      k.box(s + 0.15, 0.2, s + 0.15, 0x5d6d7e, 0, y + h, 0);
      y += h + 0.2;
    }
    k.box(0.2, 4, 0.2, C.dark, 0, y, 0);
    k.win(0.35, 0.35, 0.35, 0, y + 4, 0);
  },

  // ----- leisure -----
  coaster(k, p) {
    k.box(6.4, Y, 6.4, C.lawn);
    const N = 72, pts = [];
    for (let i = 0; i < N; i++) pts.push(coasterPoint((i / N) * Math.PI * 2));
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[(i + 1) % N];
      const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, ox = (-dz / l) * 0.16, oz = (dx / l) * 0.16;
      k.beam([a[0] + ox, a[1], a[2] + oz], [b[0] + ox, b[1], b[2] + oz], 0.07, 0.07, 0xe74c3c);
      k.beam([a[0] - ox, a[1], a[2] - oz], [b[0] - ox, b[1], b[2] - oz], 0.07, 0.07, 0xe74c3c);
      if (i % 3 === 0) k.beam([a[0] + ox * 1.4, a[1] - 0.05, a[2] + oz * 1.4], [a[0] - ox * 1.4, a[1] - 0.05, a[2] - oz * 1.4], 0.06, 0.05, 0x7f8c8d);
      if (i % 6 === 0 && a[1] > Y + 0.3) k.box(0.12, a[1] - Y - 0.05, 0.12, C.white, a[0], Y, a[2]);
    }
    k.box(1.2, 1, 0.9, C.base, -2.6, Y, 2.6); k.box(1.4, 0.15, 1.1, C.white, -2.6, Y + 1, 2.6);
    for (let i = 0; i < 4; i++) k.box(0.08, 0.4, 0.08, C.dark, -1.6 + i * 0.5, Y, 2.9);
    const train = new THREE.Group();
    const cars = [0, 1, 2].map((c) => kitFor((ck) => {
      ck.box(0.42, 0.22, 0.55, [C.base, C.gold, 0x2ecc71][c], 0, 0, 0);
      ck.box(0.12, 0.14, 0.12, 0xf1c27d, -0.1, 0.22, -0.05); ck.box(0.12, 0.14, 0.12, 0xe0ac69, 0.1, 0.22, 0.12);
    }));
    cars.forEach((c) => train.add(c));
    let u = hash(p.k, 6) * Math.PI * 2;
    train.userData.animate = (t, dt) => {
      const h = coasterPoint(u)[1] - Y;
      u += dt * (0.35 + 0.45 * Math.max(0, 3.2 - h) / 3.2); // faster at the bottom
      cars.forEach((car, c) => {
        const P = coasterPoint(u - c * 0.17), Q = coasterPoint(u - c * 0.17 + 0.02);
        car.position.set(P[0], P[1] + 0.05, P[2]);
        const dx = Q[0] - P[0], dy = Q[1] - P[1], dz = Q[2] - P[2];
        car.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0, 'YXZ');
      });
    };
    k.extras.push(train);
  },
  ferris(k, p) {
    k.box(6.4, Y, 6.4, C.walk);
    const R = 2.6, hy = Y + 3.6;
    for (const z of [-0.6, 0.6]) {
      k.beam([-1.7, Y, z], [0, hy, z], 0.18, 0.18, 0x95a5a6);
      k.beam([1.7, Y, z], [0, hy, z], 0.18, 0.18, 0x95a5a6);
    }
    k.box(1.1, 1, 0.9, C.base, 2.4, Y, 2.5); k.box(1.3, 0.15, 1.1, C.white, 2.4, Y + 1, 2.5);
    const wheel = new THREE.Group();
    wheel.position.set(0, hy, 0);
    wheel.add(kitFor((wk) => {
      const n = 20;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        for (const z of [-0.3, 0.3]) {
          wk.beam([Math.cos(a0) * R, Math.sin(a0) * R, z], [Math.cos(a1) * R, Math.sin(a1) * R, z], 0.1, 0.1, C.white);
          if (i % 2 === 0) wk.beam([0, 0, z], [Math.cos(a0) * R, Math.sin(a0) * R, z], 0.06, 0.06, 0xd5d8dc);
        }
        if (i % 2 === 0) wk.win(0.14, 0.14, 0.14, Math.cos(a0) * R, Math.sin(a0) * R - 0.07, 0.38);
      }
      wk.beam([0, 0, -0.75], [0, 0, 0.75], 0.32, 0.32, C.base);
    }));
    const cols = [0xe74c3c, C.gold, 0x2ecc71, C.base, 0xe84393];
    const gondolas = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      g.add(kitFor((gk) => { gk.box(0.06, 0.3, 0.06, C.dark, 0, -0.3, 0); gk.box(0.5, 0.42, 0.45, cols[i % 5], 0, -0.72, 0); gk.box(0.56, 0.06, 0.5, C.white, 0, -0.32, 0); }));
      wheel.add(g);
      gondolas.push(g);
    }
    wheel.userData.animate = (t, dt) => {
      wheel.rotation.z += dt * 0.22;
      for (const g of gondolas) g.rotation.z = -wheel.rotation.z; // cabins stay level
    };
    k.extras.push(wheel);
  },
  carousel(k, p) {
    k.box(6.4, Y, 6.4, C.walk);
    k.boxR(4.4, 0.3, 4.4, 0xe8dcc8, 0, Y, 0, 0); k.boxR(4.4, 0.3, 4.4, 0xe8dcc8, 0, Y, 0, Math.PI / 4);
    const ride = new THREE.Group();
    ride.position.y = Y + 0.3;
    ride.add(kitFor((rk) => {
      rk.box(0.45, 2.4, 0.45, C.gold, 0, 0, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        rk.box(0.06, 2.4, 0.06, C.gold, Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6);
        rk.boxR(1.3, 0.3, 0.9, i % 2 ? 0xe74c3c : C.white, Math.cos(a) * 1.55, 2.4, Math.sin(a) * 1.55, -a);
      }
      rk.boxR(2.6, 0.3, 2.6, 0xe74c3c, 0, 2.4, 0, 0); rk.boxR(2.6, 0.3, 2.6, C.white, 0, 2.4, 0, Math.PI / 4);
      rk.box(1.6, 0.35, 1.6, 0xe74c3c, 0, 2.7, 0); rk.box(0.8, 0.35, 0.8, C.gold, 0, 3.05, 0);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; rk.win(0.12, 0.12, 0.12, Math.cos(a) * 2.1, 2.45, Math.sin(a) * 2.1); }
    }));
    const horses = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const h = kitFor((hk) => {
        const c = [C.white, 0x8b5a2b, C.white, 0x2b2f36][i % 4];
        hk.box(0.2, 0.28, 0.6, c, 0, 0, 0); hk.box(0.18, 0.32, 0.2, c, 0, 0.18, 0.32); hk.box(0.06, 0.3, 0.06, c, 0, -0.3, 0.2); hk.box(0.06, 0.3, 0.06, c, 0, -0.3, -0.2);
        hk.box(0.22, 0.06, 0.24, 0xe74c3c, 0, 0.28, 0);
      });
      h.position.set(Math.cos(a) * 1.6, 0.9, Math.sin(a) * 1.6);
      h.rotation.y = -a;
      ride.add(h);
      horses.push(h);
    }
    ride.userData.animate = (t, dt) => {
      ride.rotation.y += dt * 0.6;
      horses.forEach((h, i) => { h.position.y = 0.9 + Math.sin(t * 3 + i * 1.3) * 0.2; });
    };
    k.extras.push(ride);
  },
  lakepark(k, p) {
    k.box(6.4, Y, 6.4, C.lawn);
    k.box(4.4, 0.17, 3.4, C.sand, -0.4, 0, -0.4);
    k.water(4, 0.19, 3, -0.4, 0.01, -0.4);
    k.water(1.6, 0.19, 1, 1.0, 0.01, 1.4);
    for (let i = 0; i < 5; i++) k.box(0.3, 0.02, 0.3, 0x4caf50, -1.8 + hash(p.k, i, 1) * 3, 0.2, -1.6 + hash(p.k, i, 2) * 2.2);
    k.box(0.9, 0.12, 3.6, C.wood, 0.5, 0.25, -0.4);
    for (const x of [0.08, 0.92]) k.box(0.06, 0.25, 3.6, 0x6e4b2a, x, 0.37, -0.4);
    for (const [x, z] of [[-2.7, 2.6], [2.7, -2.7], [2.6, 0.6], [-2.6, -2.6]]) tree(k, x, z, p.k * 7 + x + z);
    k.box(1.2, 0.3, 0.4, C.wood, -1.2, Y, 2.6);
    const ducks = new THREE.Group();
    const duck = (c) => kitFor((dk) => { dk.box(0.3, 0.18, 0.2, c, 0, 0, 0); dk.box(0.12, 0.14, 0.12, c, 0.12, 0.15, 0); dk.box(0.08, 0.04, 0.06, 0xf39c12, 0.21, 0.18, 0); });
    const d1 = duck(C.white), d2 = duck(0xd4a76a);
    ducks.add(d1, d2);
    ducks.userData.animate = (t) => {
      [d1, d2].forEach((d, i) => {
        const a = t * 0.15 + i * 2.5;
        d.position.set(-1.2 + Math.cos(a) * 0.9, 0.18, -0.6 + Math.sin(a) * 0.7);
        d.rotation.y = -a - Math.PI / 2;
      });
    };
    k.extras.push(ducks);
  },
  flowergarden(k, p) {
    k.box(6.4, Y, 6.4, C.lawn);
    k.box(6.4, 0.17, 0.9, C.sand, 0, 0, 0); k.box(0.9, 0.17, 6.4, C.sand, 0, 0, 0);
    for (const [qx, qz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        k.box(0.55, 0.3, 0.55, C.flower[(i + j + qx + 2) % 5], qx * (1.2 + i * 0.6), Y, qz * (1.2 + j * 0.6));
      }
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; k.box(0.1, 1.4, 0.1, C.white, Math.cos(a) * 0.9, Y, Math.sin(a) * 0.9); }
    k.box(1.1, 0.15, 1.1, C.white, 0, Y, 0);
    k.boxR(2.2, 0.25, 2.2, 0x16a085, 0, Y + 1.4, 0, 0); k.boxR(2.2, 0.25, 2.2, 0x16a085, 0, Y + 1.4, 0, Math.PI / 4);
    k.box(1.2, 0.3, 1.2, 0x16a085, 0, Y + 1.65, 0); k.box(0.4, 0.3, 0.4, C.gold, 0, Y + 1.95, 0);
  },
  skatepark(k, p) {
    k.box(6.4, Y, 6.4, 0x9aa3ad);
    for (let i = 0; i < 4; i++) { k.box(1.2 - i * 0.3, 0.35, 5.6, 0xb8c0c8, -2.6 + i * 0.15, Y + i * 0.35, 0); k.box(1.2 - i * 0.3, 0.35, 5.6, 0xb8c0c8, 2.6 - i * 0.15, Y + i * 0.35, 0); }
    k.box(1.6, 0.5, 1.2, 0xc7ccd3, 0, Y, -1.2);
    k.box(0.6, 0.25, 1.2, 0xc7ccd3, -1.1, Y, -1.2); k.box(0.6, 0.25, 1.2, 0xc7ccd3, 1.1, Y, -1.2);
    k.box(2.6, 0.06, 0.06, 0xf5c518, 0, Y + 0.5, 1.4);
    for (const x of [-1.2, 1.2]) k.box(0.06, 0.5, 0.06, C.dark, x, Y, 1.4);
    const tags = [0xe84393, 0x2ecc71, C.base, 0xf5c518];
    for (let i = 0; i < 4; i++) k.box(1.3, 0.8, 0.12, tags[i], -2 + i * 1.35, Y, -3);
  },
  pool(k, p) {
    k.box(6.4, Y, 6.4, C.white);
    k.box(5, 0.17, 3.4, 0x5dade2, 0, 0, -0.6);
    k.water(4.8, 0.2, 3.2, 0, 0.01, -0.6);
    for (let i = 1; i < 4; i++) k.box(4.8, 0.04, 0.05, i % 2 ? 0xe74c3c : C.white, 0, 0.21, -2.2 + i * 0.8);
    k.box(0.5, 0.1, 1.2, C.white, 2.2, 0.25, -2.6);
    for (const x of [-2.2, -1, 0.2]) { k.box(0.5, 0.15, 1, C.base, x, Y, 2.1); }
    for (const x of [-1.6, 1.4]) { k.box(0.06, 1.3, 0.06, C.dark, x, Y, 2.8); k.box(1.2, 0.1, 1.2, x < 0 ? 0xe74c3c : C.gold, x, Y + 1.3, 2.8); }
    k.box(1.2, 1.2, 0.9, 0x5dade2, 2.4, Y, 2.4);
  },
  soccer(k, p) {
    k.box(6.4, Y, 6.4, C.walk);
    for (let i = 0; i < 6; i++) k.box(0.9, 0.17, 4.4, i % 2 ? 0x4caf50 : 0x5cb85c, -2.25 + i * 0.9, 0, -0.4);
    k.box(5.4, 0.18, 0.06, C.white, 0, 0, -2.6); k.box(5.4, 0.18, 0.06, C.white, 0, 0, 1.8);
    k.box(0.06, 0.18, 4.4, C.white, -2.7, 0, -0.4); k.box(0.06, 0.18, 4.4, C.white, 2.7, 0, -0.4); k.box(0.06, 0.18, 4.4, C.white, 0, 0, -0.4);
    k.box(0.9, 0.18, 0.06, C.white, 0, 0, -0.85); k.box(0.9, 0.18, 0.06, C.white, 0, 0, 0.05);
    for (const x of [-2.75, 2.75]) {
      k.box(0.08, 0.8, 0.08, C.white, x, Y, -1); k.box(0.08, 0.8, 0.08, C.white, x, Y, 0.2);
      k.box(0.08, 0.08, 1.3, C.white, x, Y + 0.8, -0.4);
    }
    for (let i = 0; i < 3; i++) k.box(5, 0.3, 0.4, i % 2 ? C.base : C.white, 0, Y + i * 0.3, 2.3 + i * 0.35);
    k.box(0.25, 0.25, 0.25, C.white, 0.6, Y, -0.3);
  },
  stage(k, p) {
    k.box(6.4, Y, 6.4, 0x9aa3ad);
    k.box(5, 0.7, 2.4, C.dark, 0, Y, -1.6);
    k.box(5, 2.6, 0.2, 0x1d2127, 0, Y + 0.7, -2.7);
    k.blue(2.4, 0.6, 0.06, 0, Y + 2.1, -2.58);
    for (const x of [-2.4, 2.4]) { k.box(0.15, 3.6, 0.15, 0x95a5a6, x, Y, -0.5); k.box(0.7, 1.2, 0.6, C.dark, x * 0.85, Y + 0.7, -0.8); }
    k.box(5, 0.15, 0.15, 0x95a5a6, 0, Y + 3.6, -0.5);
    for (let i = 0; i < 5; i++) k.win(0.25, 0.25, 0.25, -1.6 + i * 0.8, Y + 3.35, -0.5);
    for (let i = 0; i < 12; i++) k.box(0.2, 0.35, 0.2, C.flower[i % 5], -2.4 + hash(p.k, i, 3) * 4.8, Y, 0.6 + hash(p.k, i, 4) * 2.2);
  },
  icecream(k, p) {
    lawn(k);
    k.box(2.2, 1.8, 2, 0xffd1dc, 0, Y, -0.6);
    k.win(1.4, 0.7, 0.06, 0, Y + 0.8, 0.43);
    for (let i = 0; i < 5; i++) k.box(0.44, 0.1, 0.6, i % 2 ? C.white : 0xe84393, -0.88 + i * 0.44, Y + 1.6, 0.7);
    k.box(2.4, 0.2, 2.2, 0xe84393, 0, Y + 1.8, -0.6);
    for (let i = 0; i < 4; i++) k.box(0.25 + i * 0.15, 0.3, 0.25 + i * 0.15, 0xd4a76a, 0, Y + 2.0 + i * 0.3, -0.6); // cone, point down
    k.box(0.9, 0.5, 0.9, 0xffb6c1, 0, Y + 3.2, -0.6); k.box(0.6, 0.35, 0.6, C.white, 0, Y + 3.7, -0.6); k.box(0.15, 0.15, 0.15, 0xe74c3c, 0, Y + 4.05, -0.6);
    for (const x of [-2, 2]) { k.box(0.6, 0.4, 0.6, C.white, x, Y, 2.2); k.box(0.06, 1.1, 0.06, C.dark, x, Y + 0.4, 2.2); k.box(1, 0.08, 1, x < 0 ? 0x5dade2 : C.gold, x, Y + 1.5, 2.2); }
  },
};

// ---------- the Whale Fountain: a wonder for every $1k+ buy, signed with the whale's wallet ----------

function plaqueMaterial(p) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 180;
  const g = cv.getContext('2d');
  g.fillStyle = '#14213d'; g.fillRect(0, 0, 512, 180);
  g.strokeStyle = '#f4c542'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 170);
  g.fillStyle = '#f4c542'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fit = (text, weight, size, family, y) => {
    do { g.font = `${weight} ${size}px ${family}`; size -= 2; } while (g.measureText(text).width > 460 && size > 12);
    g.fillText(text, 256, y);
  };
  fit('WHALE FOUNTAIN', 800, 56, '"Lilita One", Inter, system-ui, sans-serif', 62);
  const w = p.whale, who = w?.name || (w?.from ? `${w.from.slice(0, 6)}…${w.from.slice(-4)}` : 'a whale'); // its Basename, if it has one
  g.fillStyle = '#ffffff';
  fit(p.dark ? 'its whale sold · waiting for the next one' : `gifted by ${who}${w?.usd ? ` · $${Math.round(w.usd).toLocaleString('en-US')}` : ''}`, 700, 32, 'Inter, system-ui, sans-serif', 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.3 });
}

// ---------- Whale Towers and Skyscrapers: a $2.5k+ / $5k+ buy, named after the whale while it holds ----------

const WHALE_SIGNS = new Map();
function whaleSign(p) {
  const w = p.whale || {}, key = `${p.k}|${w.name}|${p.dark}`;
  if (WHALE_SIGNS.has(key)) return WHALE_SIGNS.get(key);
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 192;
  const g = cv.getContext('2d');
  g.fillStyle = p.dark ? '#1c1d21' : '#0b1630'; g.fillRect(0, 0, 512, 192);
  g.strokeStyle = p.dark ? '#5b5f66' : '#f4c542'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 182);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const fit = (text, weight, size, family, y, color) => {
    g.fillStyle = color;
    do { g.font = `${weight} ${size}px ${family}`; size -= 2; } while (g.measureText(text).width > 440 && size > 12);
    g.fillText(text, 256, y);
  };
  const display = '"Lilita One", Inter, system-ui, sans-serif', body = 'Inter, system-ui, sans-serif';
  const tier = (w.tier || 'Whale Tower').toUpperCase();
  if (p.dark) {
    fit(tier, 800, 28, display, 40, '#8a8f98');
    fit('FOR SALE', 800, 64, display, 100, '#f4c542');
    fit('the next whale of its size takes it', 700, 24, body, 156, '#b8bcc4');
  } else {
    const who = w.name || (w.from ? `${w.from.slice(0, 6)}…${w.from.slice(-4)}` : 'a whale');
    fit(tier, 800, 28, display, 40, '#f4c542');
    fit(who, 800, 60, display, 100, '#ffffff');
    fit(`$${Math.round(w.usd || 0).toLocaleString('en-US')} of ${CONFIG.ticker} · still holding`, 700, 24, body, 156, '#9fd0ff');
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: p.dark ? 0.05 : 0.45 });
  WHALE_SIGNS.set(key, mat);
  return mat;
}
// the tower or skyscraper design, with the whale's name on its crown (two faces, clickable)
function whaleTower(k, p) {
  DESIGN[p.build](k, p);
  let y, s;
  if (p.build === 'tower') { s = p.w - 1; y = Y + p.h - 1.1; }
  else { const a = Math.ceil(p.h * 0.5), b = Math.ceil(p.h * 0.3); s = p.w - 1; y = Y + a + 0.2 + b - 1; }
  const sponsor = p.dark || !p.whale?.from ? null : { name: p.whale.name || p.whale.from, url: `https://basescan.org/address/${p.whale.from}` };
  for (const [x, z, ry] of [[0, s / 2 + 0.03, 0], [s / 2 + 0.03, 0, Math.PI / 2]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.94, s * 0.94 * 0.375), whaleSign(p));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    if (sponsor) m.userData.sponsor = sponsor;
    k.extras.push(m);
  }
  if (!p.dark) k.box(s + 0.12, 0.18, s + 0.12, C.gold, 0, y + s * 0.19 + 0.12, 0); // a gold band over the name
}
// lights out: a whale that sold leaves its building dark
// a tech building waiting for chips (src/chips.js): its lights off, and a sign over it
const WAIT_SIGN = (() => {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(10,14,24,0.85)'; g.beginPath(); g.roundRect(4, 4, 504, 120, 28); g.fill();
  g.strokeStyle = '#ffd23f'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#ffd23f'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 54; // fits whatever font is there when it's drawn
  do { g.font = `800 ${size}px Inter, system-ui, sans-serif`; size -= 2; } while (g.measureText('WAITING FOR CHIPS').width > 460 && size > 20);
  g.fillText('WAITING FOR CHIPS', 256, 66);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, depthWrite: false });
})();
export function offline(group, h = 3) {
  group.traverse((o) => { if (o.isMesh && (o.material === GLOW_MAT || o.material === GREEN_GLOW || o.material === BLUE_GLOW)) o.material = RUIN_SHUT; });
  const sign = new THREE.Sprite(WAIT_SIGN);
  sign.scale.set(3.4, 0.85, 1); sign.position.set(0, h + 1.4, 0); sign.renderOrder = 5;
  group.add(sign);
  return group;
}
export function darken(group) {
  group.traverse((o) => { if (o.isMesh && o.material === GLOW_MAT) o.material = RUIN_SHUT; });
  return group;
}

function wonder(k, p) {
  const stone = 0xe9e4d8, rim = 0xd5d8dc;
  k.box(6.4, Y, 6.4, stone);
  for (const s of [-1, 1]) { k.box(6.4, 0.04, 0.18, C.gold, 0, Y, s * 3.1); k.box(0.18, 0.04, 6.4, C.gold, s * 3.1, Y, 0); }
  // octagonal basin
  k.boxR(3.6, 0.5, 3.6, rim, 0, Y, -0.2, 0); k.boxR(3.6, 0.5, 3.6, rim, 0, Y, -0.2, Math.PI / 4);
  k.boxR(3.2, 0.06, 3.2, undefined, 0, Y + 0.48, -0.2, 0, 'water'); k.boxR(3.2, 0.06, 3.2, undefined, 0, Y + 0.48, -0.2, Math.PI / 4, 'water');
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; k.box(0.2, 0.12, 0.2, C.gold, Math.cos(a) * 2.25, Y + 0.5, -0.2 + Math.sin(a) * 2.25); }
  // lamps on the corners
  for (const [x, z] of [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.5], [2.8, 2.5]]) { k.box(0.12, 1.4, 0.12, C.dark, x, Y, z); k.box(0.3, 0.1, 0.3, C.gold, x, Y + 1.4, z); k.win(0.22, 0.24, 0.22, x, Y + 1.5, z); }
  // the plaque, signed by the whale
  k.box(2.7, 0.9, 0.14, C.dark, 0, Y, 2.9);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.88), plaqueMaterial(p));
  plaque.position.set(0, Y + 0.48, 2.98);
  k.extras.push(plaque);
  // a voxel whale in Base blue, leaping out of the water and spouting
  const whale = new THREE.Group();
  whale.add(kitFor((wk) => {
    const blue = 0x1f5fe0, belly = 0xdbe8ff, dark = 0x163fa8;
    wk.box(2.4, 1.3, 1.5, blue, 0, 0, 0); // body
    wk.box(1.0, 1.15, 1.35, blue, 1.6, 0.05, 0); // head
    wk.box(3.0, 0.32, 1.2, belly, 0.4, -0.1, 0); // belly
    wk.box(1.0, 0.85, 1.0, blue, -1.6, 0.3, 0); // tail stock
    wk.box(0.7, 0.55, 0.7, blue, -2.3, 0.65, 0);
    wk.box(0.5, 0.16, 2.0, dark, -2.65, 1.1, 0); // flukes
    wk.box(0.95, 0.06, 1.37, dark, 1.6, 0.35, 0); // mouth line
    for (const z of [-0.69, 0.69]) { wk.box(0.18, 0.18, 0.03, 0xffffff, 1.75, 0.68, z); wk.box(0.1, 0.1, 0.035, 0x111111, 1.78, 0.68, z); }
    for (const z of [-0.95, 0.95]) wk.box(0.6, 0.12, 0.45, dark, 0.7, 0.25, z); // flippers
  }));
  const spout = kitFor((sk) => {
    sk.water(0.22, 1.5, 0.22, 0, 0, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; sk.water(0.18, 0.18, 0.18, Math.cos(a) * 0.4, 1.35 + (i % 2) * 0.15, Math.sin(a) * 0.4); }
  });
  spout.position.set(1.0, 1.3, 0);
  whale.add(spout);
  whale.scale.setScalar(0.82);
  whale.rotation.y = 0.55;
  const base = Y + 0.15;
  whale.position.set(0.1, base, -0.3);
  whale.userData.animate = (t) => {
    whale.position.y = base + Math.sin(t * 1.4) * 0.12;
    whale.rotation.z = Math.sin(t * 1.4 + 0.6) * 0.05;
    spout.scale.y = 0.75 + 0.35 * Math.abs(Math.sin(t * 2.2));
  };
  k.extras.push(whale);
}

// a service vehicle parked on its lot, facing the street (+z)
function parked(k, kind, x, z, ry = -Math.PI / 2) {
  const v = makeService(kind, true);
  v.position.set(x, Y, z);
  v.rotation.y = ry;
  k.extras.push(v);
}

Object.assign(DESIGN, {
  firestation(k) {
    sidewalk(k);
    const red = 0xc0392b, dark = 0x8e2a1f;
    k.box(4.4, 2.6, 3.4, red, -0.7, Y, -1.1);
    k.box(4.6, 0.25, 3.6, dark, -0.7, Y + 2.6, -1.1);
    for (const x of [-1.8, 0.4]) { // bay doors
      k.box(1.6, 1.7, 0.06, 0xd5d8dc, x, Y, 0.62);
      for (let r = 0; r < 4; r++) k.box(1.6, 0.05, 0.08, 0xaab2bb, x, Y + 0.25 + r * 0.38, 0.63);
      k.win(1.3, 0.25, 0.07, x, Y + 1.35, 0.64);
    }
    k.box(3.6, 0.5, 0.08, C.white, -0.7, Y + 1.95, 0.64);
    for (let i = 0; i < 4; i++) k.box(0.32, 0.3, 0.02, red, -1.55 + i * 0.55, Y + 2.05, 0.69);
    k.box(1.3, 5, 1.3, red, 2.3, Y, -2.2); // hose tower
    k.box(1.5, 0.3, 1.5, dark, 2.3, Y + 5, -2.2);
    k.win(0.4, 0.7, 0.06, 2.3, Y + 3.4, -1.53);
    k.flame(0.35, 0.3, 0.35, 2.3, Y + 5.3, -2.2); // siren
    k.box(4.4, 0.02, 2.4, 0xb9bec5, -0.7, Y, 1.9); // apron
    k.box(0.22, 0.45, 0.22, 0xe74c3c, 2.6, Y, 2.6); // hydrant
    parked(k, 'fire', 0.4, 1.9);
  },
  police(k) {
    sidewalk(k);
    const blue = 0x2c3e66, trim = 0xe9eef5;
    k.box(5, 2.8, 3.2, trim, 0, Y, -1.3);
    windows(k, 5, 3.2, Y, 2, true, 0, -1.3);
    k.box(5.2, 0.3, 3.4, blue, 0, Y + 2.8, -1.3);
    k.box(1.3, 1.4, 0.4, blue, -1.4, Y, 0.45); k.win(0.8, 1.0, 0.06, -1.4, Y, 0.66); // entrance
    k.box(2.8, 0.5, 0.08, blue, 0.4, Y + 2.15, 0.34); // POLICE sign
    for (let i = 0; i < 6; i++) k.box(0.24, 0.24, 0.02, trim, -0.45 + i * 0.34, Y + 2.28, 0.39);
    k.blue(0.32, 0.25, 0.32, 1.8, Y + 3.1, -1.3); // roof beacon
    k.box(0.06, 1.6, 0.06, C.dark, 2.0, Y + 3.1, -2.4);
    k.box(0.08, 3, 0.08, 0xd5d8dc, -2.85, Y, 2.7); k.box(0.8, 0.5, 0.04, C.base, -2.4, Y + 2.4, 2.7); // flag
    k.box(3.6, 0.02, 2.3, C.road, 0.9, Y, 1.95);
    for (const x of [0.15, 1.65]) k.box(0.06, 0.03, 2, C.white, x + 0.75, Y, 1.95);
    parked(k, 'police', 0.15, 1.95); parked(k, 'police', 1.65, 1.95);
  },
  hospital(k) {
    sidewalk(k);
    const white = 0xf4f6f8, red = 0xe0302a;
    k.box(5.2, 4, 4, white, 0, Y, -1.0);
    windows(k, 5.2, 4, Y, 4, true, 0, -1.0);
    k.box(5.4, 0.3, 4.2, 0xd5dbe2, 0, Y + 4, -1.0);
    k.box(1.1, 0.34, 0.08, red, 0, Y + 3.2, 1.05); k.box(0.34, 1.1, 0.08, red, 0, Y + 2.82, 1.05); // red cross
    k.win(1.6, 1.1, 0.06, 0, Y, 1.03); // glass entrance
    k.box(2.4, 0.15, 1.2, 0x16a085, 0, Y + 1.4, 1.6);
    for (const x of [-1.1, 1.1]) k.box(0.1, 1.4, 0.1, C.white, x, Y, 2.1);
    k.box(2.6, 0.08, 2.6, 0x3b4048, 0.7, Y + 4.3, -1.0); // helipad on the roof
    k.box(0.12, 0.02, 1.2, C.white, 0.35, Y + 4.38, -1.0); k.box(0.12, 0.02, 1.2, C.white, 1.05, Y + 4.38, -1.0); k.box(0.6, 0.02, 0.12, C.white, 0.7, Y + 4.38, -1.0);
    k.box(0.9, 0.5, 0.9, 0xd5dbe2, -1.8, Y + 4.3, -2.0);
    parked(k, 'ambulance', -2.0, 2.1);
  },
  recycling(k) {
    k.box(6.4, Y, 6.4, 0x9aa3ad);
    const green = 0x2e7d32;
    k.box(4, 2.4, 3, green, -1, Y, -1.4);
    for (let i = 0; i < 6; i++) k.box(0.06, 2.4, 3.02, 0x256b28, -2.8 + i * 0.72, Y, -1.4);
    k.box(4.2, 0.25, 3.2, 0x1b5e20, -1, Y + 2.4, -1.4);
    k.box(1.6, 1.6, 0.06, 0x3b4048, -1.6, Y, 0.12);
    k.box(1, 1, 0.06, C.white, 0, Y + 1.1, 0.13); // recycling sign
    for (const [x, y] of [[-0.2, 0.25], [0.2, 0.25], [0, 0.6]]) k.box(0.22, 0.22, 0.02, 0x2e9a3a, x, Y + 1.1 + y - 0.1, 0.17);
    [0x2e86de, 0xf1c40f, 0x27ae60].forEach((c, i) => { k.box(0.6, 0.7, 0.6, c, -2.4 + i * 0.75, Y, 1.0); k.box(0.64, 0.08, 0.64, 0x2b2f36, -2.4 + i * 0.75, Y + 0.7, 1.0); });
    k.box(1.4, 1, 2.8, 0xe67e22, 2.3, Y, -1.4); k.box(1.4, 1, 2.8, 0x2e86de, 2.3, Y + 1, -1.4); // containers
    for (let i = 0; i < 6; i++) k.box(0.3, 0.3, 0.3, C.flower[i % 5], 1.6 + (i % 3) * 0.35, Y + Math.floor(i / 3) * 0.3, 0.6);
    parked(k, 'garbage', 0.4, 2.3, 0);
  },
  solarfarm(k) {
    k.box(6.4, Y, 6.4, C.lawn);
    for (let r = 0; r < 4; r++) {
      const z = -2.3 + r * 1.45;
      for (const x of [-1.5, 1.5]) {
        for (const px of [x - 1.1, x + 1.1]) k.box(0.1, 0.45, 0.1, 0x9aa3ad, px, Y, z);
        k.beam([x, Y + 0.5, z + 0.45], [x, Y + 0.95, z - 0.4], 2.7, 0.06, 0x1d3a6e); // tilted panel
        k.beam([x, Y + 0.53, z + 0.43], [x, Y + 0.98, z - 0.42], 0.05, 0.06, 0x7f9cc4);
      }
    }
    k.box(0.8, 0.8, 0.6, 0xd5d8dc, 2.6, Y, 2.75); k.green(0.12, 0.12, 0.06, 2.6, Y + 0.6, 3.06); // inverter
    fence(k, 6.2, 6.2, 0x9aa3ad, 1.2);
  },
  // glass office with glowing floors, a robot-head logo and a drone pad on the roof
  aistartup(k, p) {
    sidewalk(k);
    const h = Math.max(3, p.h || 3), oz = -0.6;
    k.box(4, h, 4, 0xdfe8f5, 0, Y, oz);
    for (let f = 0; f < h; f++) { // blue glass floors with lit desks at night
      k.box(4.06, 0.72, 4.06, 0x7fb2e5, 0, Y + f + 0.18, oz);
      for (const x of [-1.2, 0, 1.2]) { k.win(0.7, 0.3, 4.08, x, Y + f + 0.38, oz); k.win(4.08, 0.3, 0.7, 0, Y + f + 0.38, oz + x); }
    }
    k.box(4.2, 0.15, 4.2, 0xb8c4d6, 0, Y + h, oz);
    k.box(0.9, 1.2, 0.06, 0x2b2f36, 0, Y, oz + 2.03);
    k.box(2.2, 0.42, 0.08, 0x7c3aed, 0, Y + 1.3, oz + 2.05); // sign
    for (let i = 0; i < 5; i++) k.box(0.22, 0.2, 0.02, C.white, -0.7 + i * 0.35, Y + 1.41, oz + 2.1);
    const top = Y + h + 0.15;
    k.box(1.2, 1, 1, C.white, -0.9, top, oz - 0.9); // robot-head logo
    k.green(0.26, 0.2, 0.04, -1.15, top + 0.5, oz - 0.38); k.green(0.26, 0.2, 0.04, -0.65, top + 0.5, oz - 0.38);
    k.box(0.06, 0.4, 0.06, C.dark, -0.9, top + 1, oz - 0.9); k.blue(0.16, 0.16, 0.16, -0.9, top + 1.4, oz - 0.9);
    k.box(1.4, 0.05, 1.4, 0x3b4048, 0.9, top, oz + 0.8); k.blue(1.0, 0.02, 0.06, 0.9, top + 0.05, oz + 0.8); // drone pad
    const d = makeDrone();
    d.position.set(0.9, top + 0.22, oz + 0.8);
    d.userData.parcel.visible = false;
    k.extras.push(d);
    for (const x of [-2.6, 2.6]) bush(k, x, 2.4, p.k + x);
  },
  // a small trading shop: glass front, LED ticker, green awning, a candlestick chart on the roof
  brokerage(k, p) {
    sidewalk(k);
    const navy = 0x1b2a4a;
    k.box(4, 2.3, 3, navy, 0, Y, -1.2);
    k.win(3.4, 1.2, 0.06, 0, Y + 0.15, 0.33);
    k.box(4.2, 0.2, 3.2, 0x111827, 0, Y + 2.3, -1.2);
    k.box(4.2, 0.12, 0.9, 0x16a34a, 0, Y + 1.45, 0.75);
    tickerStrip(k, 3.8, 0.34, 0, Y + 1.95, 0.32);
    k.box(2.6, 1.3, 0.12, C.dark, 0, Y + 2.5, -0.8); // chart sign
    [[0.4, 0.3, 1], [0.55, 0.45, 1], [0.35, 0.65, 0], [0.6, 0.6, 1], [0.7, 0.85, 1], [0.4, 0.75, 0]].forEach(([hh, y0, up], i) => {
      const x = -1.0 + i * 0.4;
      k.box(0.04, hh + 0.2, 0.04, up ? 0x2ee87a : 0xff5c5c, x, Y + 2.5 + y0 - 0.1, -0.72);
      k.box(0.2, hh, 0.04, up ? 0x2ee87a : 0xff5c5c, x, Y + 2.5 + y0, -0.71);
    });
    k.box(1.2, 0.3, 0.4, C.wood, -2.3, Y, 2.4); bush(k, 2.5, 2.5, p.k);
  },
});

// ---------- market statues: the bull when $BLOCKY is up over 24h, the bear when it is down ----------
const bullKit = () => kitFor((k) => {
  const gold = 0xd4a017, horn = 0xf3e2a0;
  k.box(1.1, 0.5, 0.5, gold, 0, 0.32, 0);
  k.box(0.5, 0.56, 0.54, gold, 0.3, 0.3, 0); // shoulders
  k.box(0.36, 0.36, 0.4, gold, 0.68, 0.32, 0); // head, lowered to charge
  k.box(0.1, 0.1, 0.72, horn, 0.72, 0.66, 0); k.box(0.08, 0.18, 0.08, horn, 0.76, 0.7, 0.34); k.box(0.08, 0.18, 0.08, horn, 0.76, 0.7, -0.34);
  k.box(0.06, 0.1, 0.1, 0x3a2a10, 0.87, 0.42, 0);
  for (const [x, z] of [[-0.4, -0.15], [-0.4, 0.15], [0.35, -0.15], [0.35, 0.15]]) k.box(0.14, 0.34, 0.14, gold, x, 0, z);
  k.box(0.06, 0.3, 0.06, gold, -0.58, 0.5, 0); k.box(0.1, 0.1, 0.1, gold, -0.6, 0.78, 0);
});
const bearKit = () => kitFor((k) => {
  const fur = 0x7a3b2a, snout = 0xc28a6a;
  k.box(1.0, 0.58, 0.6, fur, -0.05, 0.3, 0);
  k.box(0.44, 0.42, 0.46, fur, 0.6, 0.4, 0); k.box(0.2, 0.16, 0.24, snout, 0.85, 0.44, 0);
  k.box(0.06, 0.06, 0.06, 0x111111, 0.96, 0.54, 0);
  k.box(0.12, 0.12, 0.08, fur, 0.55, 0.84, 0.16); k.box(0.12, 0.12, 0.08, fur, 0.55, 0.84, -0.16); // ears
  for (const [x, z] of [[-0.4, -0.18], [-0.4, 0.18], [0.35, -0.18], [0.35, 0.18]]) k.box(0.18, 0.3, 0.18, fur, x, 0, z);
});
function marketStatue(k, x, y, z, ry) {
  const g = new THREE.Group(), bull = bullKit(), bear = bearKit();
  g.add(bull, bear);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.userData.animate = () => { bull.visible = MOOD.up; bear.visible = !MOOD.up; };
  k.extras.push(g);
}

// translucent holographic agent heads over the AI Agent Hub plaza
const HOLO = new THREE.MeshLambertMaterial({ color: 0x66e0ff, emissive: 0x00b4ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.55, depthWrite: false });
function hologram() {
  const g = new THREE.Group();
  const part = (w, h, d, x, y, z) => { const m = new THREE.Mesh(UNIT, HOLO); m.scale.set(w, h, d); m.position.set(x, y, z); g.add(m); };
  part(0.9, 0.75, 0.8, 0, 0, 0); part(0.14, 0.12, 0.05, -0.2, 0.08, 0.43); part(0.14, 0.12, 0.05, 0.2, 0.08, 0.43);
  part(0.4, 0.06, 0.05, 0, -0.18, 0.43); part(0.06, 0.35, 0.06, 0, 0.55, 0); part(0.14, 0.14, 0.14, 0, 0.76, 0);
  part(0.1, 0.3, 0.3, -0.5, 0, 0); part(0.1, 0.3, 0.3, 0.5, 0, 0);
  return g;
}

// the coaster's track: a figure-loop with two drops (local lot coords)
function coasterPoint(a) {
  return [
    Math.cos(a) * 2.4 + Math.cos(2 * a) * 0.35,
    Y + 0.5 + 2.4 * Math.max(0, Math.sin(a + 0.4)) ** 2 + 0.8 * Math.max(0, Math.sin(3 * a - 1)),
    Math.sin(a) * 2.2,
  ];
}

const LANDMARK = {
  garage(k) {
    sidewalk(k);
    k.box(5, 2.6, 4, 0xb5523b, 0, Y, -0.5);
    for (let i = 0; i < 5; i++) k.box(3, 0.32, 0.06, i % 2 ? 0x9aa3ad : 0xb8c0c8, 0, Y + 0.1 + i * 0.4, 1.53);
    k.box(5.4, 0.3, 4.4, 0x6e2f22, 0, Y + 2.6, -0.5);
    k.box(2.6, 0.6, 0.15, C.base, 0, Y + 2.9, 1.3);
    k.box(1.4, 0.8, 0.6, 0x8b5a2b, 2.2, Y, 2.2);
    k.box(0.4, 0.4, 0.4, C.gold, 2.0, Y + 0.8, 2.2);
    k.box(0.4, 0.4, 0.4, C.base, 2.45, Y + 0.8, 2.2);
  },
  square(k) {
    billboard(k, 0.9, Y, -2.85, 3.4, 1.35, 0, 1.2);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k.box(1.6, Y, 1.6, (i + j) % 2 ? 0xe2dccd : 0xd2cab6, -2.4 + i * 1.6, 0, -2.4 + j * 1.6);
    k.box(2, 0.3, 2, C.stone, 0, Y, 0);
    k.box(1.2, 0.8, 1.2, C.white, 0, Y + 0.3, 0);
    k.blue(0.9, 0.9, 0.9, 0, Y + 1.1, 0); // the treasury block, resting on its pedestal
    k.box(2.4, 0.06, 2.4, C.dark, 1.8, Y, 1.8);
    k.box(0.2, 0.07, 1.2, C.white, 1.45, Y, 1.8); k.box(0.2, 0.07, 1.2, C.white, 2.15, Y, 1.8); k.box(0.7, 0.07, 0.2, C.white, 1.8, Y, 1.8);
    const cols = [C.base, C.gold, 0xe74c3c, 0x2ecc71, C.white];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let h = 0; h < 1 + ((a + b) % 3); h++) k.box(0.5, 0.5, 0.5, cols[(a + b + h) % 5], -2.4 + a * 0.55, Y + h * 0.5, -2.4 + b * 0.55);
    k.box(0.1, 3.2, 0.1, C.dark, -2.6, Y, 2.6);
    k.box(1.1, 0.7, 0.06, C.base, -2.0, Y + 2.4, 2.6);
    k.box(1.2, 0.3, 0.4, C.wood, 2.4, Y, -0.6);
  },
  cafe(k) {
    DESIGN.cafe(k, { w: 5, d: 4, h: 3, color: 0xfff1e0 });
    for (const [x, z] of [[-2.6, 2.6], [2.6, 2.6]]) tree(k, x, z, x * 5);
  },
  hq(k) {
    sidewalk(k);
    k.box(6, 3, 6, 0xe9eef5, 0, Y, 0);
    windows(k, 6, 6, Y, 3);
    k.box(4, 8, 4, 0xdfe6ee, 0, Y + 3, 0);
    windows(k, 4, 4, Y + 3, 8);
    k.box(4.4, 0.5, 4.4, C.base, 0, Y + 11, 0);
    k.blue(2, 2, 2, 0, Y + 11.5, 0);
    k.box(0.1, 3, 0.1, C.dark, 2.6, Y + 3, 2.6);
    k.box(1.2, 0.7, 0.06, C.base, 3.2, Y + 5.2, 2.6);
    billboard(k, -0.6, Y + 3, 2.45, 3.2, 1.28, 2, 0.35);
  },
  hackathon(k) {
    sidewalk(k);
    k.box(6, 3, 5, 0xf0e6d6, 0, Y, 0);
    k.box(6.2, 0.6, 5.2, 0xe67e22, 0, Y + 3, 0);
    k.box(4.6, 0.6, 4.2, 0xe67e22, 0, Y + 3.6, 0);
    k.box(3, 0.5, 3, 0xe67e22, 0, Y + 4.2, 0);
    k.win(3.6, 1.6, 0.08, 0, Y + 0.8, 2.54);
    windows(k, 6, 5, Y, 1);
  },
  studio(k) {
    sidewalk(k);
    const cols = [0xe84393, 0xf5c518, 0x2e86de, 0x2ecc71, 0xe67e22];
    [[0, 0, 0, 3.4, 2, 3.4], [0.8, 2, -0.6, 2.6, 2, 2.4], [-0.9, 2, 0.8, 1.8, 1.6, 1.8], [0.2, 4, 0, 1.6, 1.6, 1.6], [-1.6, 0, -1.6, 1.4, 1.4, 1.4]]
      .forEach(([x, y, z, w, h, d], i) => k.box(w, h, d, cols[i], x, Y + y, z));
    k.win(1.6, 1, 0.06, 0, Y + 0.4, 1.73);
  },
  datalab(k) {
    sidewalk(k);
    k.box(5.6, 2, 5.6, 0xe6e9ee, 0, Y, 0);
    windows(k, 5.6, 5.6, Y, 2);
    k.box(4.4, 1, 4.4, 0xcfd6de, 0, Y + 2, 0);
    k.box(3, 0.8, 3, 0xcfd6de, 0, Y + 3, 0);
    k.box(1.6, 0.6, 1.6, 0xcfd6de, 0, Y + 3.8, 0);
    k.box(0.2, 1.4, 0.2, C.dark, 2.2, Y + 2, -2.2);
    k.box(1.4, 1.4, 0.15, C.white, 2.2, Y + 3.2, -2.2);
    k.win(0.25, 0.25, 0.25, 0, Y + 4.4, 0);
  },
  launchpad(k) {
    k.box(6.4, 0.4, 6.4, 0x6b7785);
    for (let y = 0; y < 14; y++) {
      for (const [x, z] of [[-2.2, -0.6], [-1.2, -0.6], [-2.2, 0.4], [-1.2, 0.4]]) k.box(0.12, 1, 0.12, 0xe74c3c, x, 0.4 + y, z);
      k.box(1.1, 0.08, 0.08, 0xe74c3c, -1.7, 0.4 + y, -0.6);
    }
    k.box(1.6, 9, 1.6, C.white, 1, 0.4, 0);
    k.box(1.7, 1.5, 1.7, C.base, 1, 6, 0);
    k.box(1.2, 1.2, 1.2, C.white, 1, 9.4, 0);
    k.box(0.6, 1, 0.6, C.base, 1, 10.6, 0);
    for (const [x, z] of [[1.9, 0], [0.1, 0], [1, 0.9], [1, -0.9]]) k.box(0.4, 1.4, 0.4, C.base, x, 0.4, z);
    k.win(0.3, 0.3, 0.3, -1.7, 14.5, -0.1);
  },
  stadium(k) {
    k.box(6.4, 0.3, 6.4, 0x9aa3ad);
    for (let i = 0; i < 3; i++) {
      const s = 6.2 - i * 0.7, c = i % 2 ? C.base : C.white;
      k.box(s, 0.6, 0.6, c, 0, 0.3 + i * 0.6, -s / 2 + 0.3); k.box(s, 0.6, 0.6, c, 0, 0.3 + i * 0.6, s / 2 - 0.3);
      k.box(0.6, 0.6, s, c, -s / 2 + 0.3, 0.3 + i * 0.6, 0); k.box(0.6, 0.6, s, c, s / 2 - 0.3, 0.3 + i * 0.6, 0);
    }
    k.box(3.4, 0.1, 3.4, 0x3fa34d, 0, 0.3, 0);
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { k.box(0.15, 4, 0.15, C.dark, x, 0.3, z); k.win(0.6, 0.3, 0.6, x, 4.3, z); }
  },
  // Statue of Blockerty: the city icon. A copper-green Blocky raising a torch, a Base block under its arm.
  liberty(k) {
    const cu = 0x5fae96, cuDark = 0x4a9480, granite = 0xc9c3b6;
    k.box(6.4, Y, 6.4, C.lawn);
    k.boxR(4.6, 0.6, 4.6, 0xb8b2a4, 0, Y, 0, 0); k.boxR(4.6, 0.6, 4.6, 0xb8b2a4, 0, Y, 0, Math.PI / 4); // star fort
    for (const [x, z] of [[-2.3, 2.3], [2.3, 2.3], [-2.3, -2.3], [2.3, -2.3]]) { k.box(0.3, 0.3, 0.3, C.dark, x, Y + 0.6, z); k.win(0.2, 0.2, 0.2, x, Y + 0.9, z); }
    tree(k, -2.8, 2.8, 11); tree(k, -2.8, -2.6, 12);
    // pedestal + statue, built at y = 0 and scaled up so the icon towers over the city
    const st = new Kit();
    st.box(2.6, 0.7, 2.6, granite, 0, 0, 0);
    st.box(2.1, 1.9, 2.1, 0xd8d2c4, 0, 0.7, 0);
    for (const [x, z, w, d] of [[0, 1.06, 1.3, 0.06], [0, -1.06, 1.3, 0.06], [1.06, 0, 0.06, 1.3], [-1.06, 0, 0.06, 1.3]]) st.box(w, 0.8, d, 0xb8b2a4, x, 1.2, z);
    st.box(2.4, 0.3, 2.4, granite, 0, 2.6, 0);
    const b = 2.9; // statue base
    st.box(1.5, 0.25, 1.25, cuDark, 0, b, 0);
    st.box(1.3, 1.4, 1.05, cu, 0, b + 0.25, 0); // robe
    for (let i = 0; i < 4; i++) st.box(0.07, 1.3, 0.04, cuDark, -0.44 + i * 0.29, b + 0.3, 0.53); // folds
    st.box(1.15, 0.95, 0.92, cu, 0, b + 1.65, 0); // torso
    st.beam([-0.57, b + 2.5, 0.44], [0.57, b + 1.75, 0.47], 0.2, 0.1, cuDark); // sash
    st.box(0.35, 0.22, 0.35, cu, 0, b + 2.6, 0); // neck
    st.box(0.8, 0.8, 0.8, cu, 0, b + 2.82, 0); // head
    st.box(0.1, 0.1, 0.04, 0x2f6b5c, -0.18, b + 3.12, 0.41); st.box(0.1, 0.1, 0.04, 0x2f6b5c, 0.18, b + 3.12, 0.41);
    st.box(0.88, 0.16, 0.88, cuDark, 0, b + 3.58, 0); // crown band
    for (let i = 0; i < 7; i++) { // seven rays fanning out over the front and sides
      const t = ((i - 3) / 3) * 1.4;
      st.beam([Math.sin(t) * 0.4, b + 3.66, Math.cos(t) * 0.4], [Math.sin(t) * 0.92, b + 4.14, Math.cos(t) * 0.92], 0.09, 0.09, cu);
    }
    st.beam([0.62, b + 2.48, 0], [0.84, b + 4.35, 0.09], 0.28, 0.28, cu); // raised right arm
    st.box(0.32, 0.32, 0.32, cu, 0.85, b + 4.3, 0.09);
    st.beam([0.86, b + 4.52, 0.09], [0.88, b + 5.05, 0.1], 0.2, 0.2, cuDark); // torch
    st.box(0.44, 0.1, 0.44, C.gold, 0.88, b + 5.05, 0.1);
    st.flame(0.28, 0.4, 0.28, 0.88, b + 5.15, 0.1); st.flame(0.16, 0.22, 0.16, 0.88, b + 5.55, 0.1);
    st.beam([-0.62, b + 2.45, 0], [-0.75, b + 1.66, 0.3], 0.26, 0.26, cu); // left arm
    st.blue(0.66, 0.66, 0.66, -0.7, b + 1.52, 0.57); // the Base block under its arm
    const statue = st.build();
    statue.scale.setScalar(1.45);
    statue.position.y = Y + 0.6;
    k.extras.push(statue);
  },
  // Base Airport: runway, terminal, control tower, windsock, and a plane that lands and takes off
  airport(k) {
    const white = C.white;
    k.box(6.4, Y, 6.4, 0x9aa3ad);
    k.box(6.4, 0.18, 2.2, C.road, 0, 0, 1.6);
    for (let x = -2.4; x <= 2.4; x += 1) k.box(0.5, 0.2, 0.1, white, x, 0, 1.6);
    for (const ex of [-2.95, 2.95]) for (let s = -0.75; s <= 0.76; s += 0.3) k.box(0.36, 0.2, 0.12, white, ex, 0, 1.6 + s);
    for (let x = -3; x <= 3.01; x += 1) { k.win(0.12, 0.12, 0.12, x, 0.18, 0.45); k.win(0.12, 0.12, 0.12, x, 0.18, 2.75); }
    k.box(3.8, 1.4, 1.6, 0xe9eef5, -0.8, Y, -2.2);
    k.win(3.4, 0.6, 0.06, -0.8, Y + 0.5, -1.38);
    k.box(4.1, 0.2, 1.9, C.base, -0.8, Y + 1.4, -2.2);
    k.box(2.2, 0.4, 0.1, C.base, -0.8, Y + 1.6, -1.4);
    billboard(k, -0.8, Y + 1.6, -2.5, 3.0, 1.2, 3, 0.45);
    k.box(0.7, 3.2, 0.7, 0xdfe6ee, 2.3, Y, -2.2);
    k.box(1.3, 0.8, 1.3, 0x2b2f36, 2.3, Y + 3.2, -2.2);
    k.win(1.34, 0.4, 1.34, 2.3, Y + 3.4, -2.2);
    k.box(1.4, 0.15, 1.4, white, 2.3, Y + 4, -2.2);
    k.green(0.18, 0.18, 0.18, 2.3, Y + 4.15, -2.2);
    k.box(0.08, 1.4, 0.08, C.dark, -2.9, Y, -0.5); k.box(0.5, 0.22, 0.22, 0xf39c12, -2.6, Y + 1.15, -0.5);
    const plane = new THREE.Group();
    plane.add(kitFor((pk) => {
      pk.box(1.7, 0.36, 0.36, white, 0, 0, 0); pk.box(0.3, 0.26, 0.26, white, 0.95, 0.05, 0);
      pk.box(0.08, 0.1, 0.3, 0x2b2f36, 1.08, 0.18, 0);
      for (let i = 0; i < 5; i++) pk.box(0.1, 0.08, 0.38, 0x9fd8ff, -0.5 + i * 0.25, 0.2, 0);
      pk.box(0.45, 0.06, 2, white, 0.05, 0.12, 0); pk.box(0.45, 0.07, 2.02, C.base, 0.05, 0.1, 0);
      pk.box(0.3, 0.5, 0.06, C.base, -0.75, 0.36, 0); pk.box(0.25, 0.05, 0.8, white, -0.75, 0.25, 0);
      pk.box(0.12, 0.14, 0.12, C.dark, 0.3, -0.14, 0.4); pk.box(0.12, 0.14, 0.12, C.dark, 0.3, -0.14, -0.4); pk.box(0.12, 0.14, 0.12, C.dark, -0.5, -0.14, 0);
    }));
    plane.add(kitFor((pk) => { pk.win(0.1, 0.1, 0.1, 0.05, 0.12, 1.02); pk.win(0.1, 0.1, 0.1, 0.05, 0.12, -1.02); }));
    // 40s loop: parked, take-off roll and climb out east, away, approach from the west and land
    plane.userData.animate = (t) => {
      const c = t % 40, z = 1.6, park = -0.6;
      plane.visible = true;
      if (c < 8) { plane.position.set(park, 0.32, z); plane.rotation.z = 0; }
      else if (c < 14) {
        const u = (c - 8) / 6, roll = Math.min(1, u * 2.2);
        const x = park + roll * roll * 3.6 + Math.max(0, u - 0.45) * 60;
        const y = 0.32 + Math.max(0, u - 0.45) ** 1.6 * 26;
        plane.position.set(x, y, z); plane.rotation.z = u > 0.45 ? 0.25 : 0;
      } else if (c < 26) plane.visible = false;
      else if (c < 34) {
        const u = (c - 26) / 8;
        if (u < 0.75) { const a = u / 0.75; plane.position.set(-40 + a * 37.2, 12 * (1 - a) ** 1.3 + 0.32, z); plane.rotation.z = -0.12 * (1 - a); }
        else { const a = (u - 0.75) / 0.25; plane.position.set(-2.8 + (park + 2.8) * (1 - (1 - a) ** 2), 0.32, z); plane.rotation.z = 0; }
      } else { plane.position.set(park, 0.32, z); plane.rotation.z = 0; }
    };
    k.extras.push(plane);
  },
  // a neoclassical exchange: columns, a live LED ticker on the frieze, a big board on the roof and
  // the bull (or bear) out front, all following $BLOCKY
  exchange(k) {
    sidewalk(k);
    const stone = 0xe9e4d8, stone2 = 0xd8d1bf;
    k.box(5.6, 0.4, 4.4, stone2, 0, Y, -0.8);
    k.box(3.6, 0.2, 0.6, stone2, 0, Y, 1.7); k.box(3.6, 0.1, 0.4, stone2, 0, Y, 2.1);
    k.box(5.0, 3.4, 3.0, 0xdcd5c4, 0, Y + 0.4, -1.4);
    windows(k, 5.0, 3.0, Y + 0.4, 3, false, 0, -1.4);
    k.win(4.6, 2.2, 0.06, 0, Y + 0.5, 0.13); // the trading floor glowing behind the columns
    for (let i = 0; i < 6; i++) k.box(0.32, 2.6, 0.32, 0xf7f4ec, -2.2 + i * 0.88, Y + 0.4, 1.0);
    k.box(5.4, 0.45, 1.8, stone, 0, Y + 3.0, 0.35);
    k.box(5.2, 0.3, 1.7, stone, 0, Y + 3.45, 0.35); k.box(3.8, 0.3, 1.6, stone, 0, Y + 3.75, 0.35); k.box(2.2, 0.3, 1.5, stone, 0, Y + 4.05, 0.35);
    k.box(5.2, 0.2, 3.2, stone2, 0, Y + 3.8, -1.4);
    tickerStrip(k, 5.2, 0.34, 0, Y + 3.22, 1.26);
    k.box(2.8, 1.5, 0.15, C.dark, 0, Y + 4.0, -1.7); // big board
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), BIG_MAT);
    board.position.set(0, Y + 4.75, -1.62);
    k.extras.push(board);
    for (const x of [-2.3, 2.3]) { k.box(0.06, 1.2, 0.06, C.dark, x, Y + 4.0, -2.6); k.box(0.6, 0.35, 0.03, C.base, x + 0.3, Y + 4.85, -2.6); }
    k.box(0.9, 0.35, 1.5, 0x9aa3ad, 2.4, Y, 2.3); // plinth
    marketStatue(k, 2.4, Y + 0.35, 2.3, -Math.PI / 2);
  },
  // the AI Agent Hub: a dark glass tower with glowing floors, server racks and a hologram plaza
  agenthub(k) {
    k.box(6.4, Y, 6.4, 0x2b2f36);
    for (const v of [-1.6, 1.6]) { k.blue(6.4, 0.02, 0.05, 0, Y, v + 0.8); k.blue(0.05, 0.02, 6.4, v + 0.8, Y, 0); }
    const glass = 0x1d2433;
    k.box(3.2, 7.2, 3.2, glass, -1.2, Y, -1.2);
    for (let f = 0; f < 7; f++) k.blue(3.24, 0.08, 3.24, -1.2, Y + 0.9 + f, -1.2);
    for (const [x, z] of [[-2.8, -2.8], [0.4, -2.8], [-2.8, 0.4], [0.4, 0.4]]) k.box(0.14, 7.2, 0.14, 0x3b4458, x, Y, z);
    k.box(3.4, 0.3, 3.4, 0x2b3242, -1.2, Y + 7.2, -1.2);
    k.box(1.6, 0.05, 1.6, 0x3b4048, -1.2, Y + 7.5, -1.2); k.blue(1.2, 0.02, 0.06, -1.2, Y + 7.55, -1.2);
    k.box(0.1, 1.6, 0.1, C.dark, -0.2, Y + 7.5, -2.3); k.green(0.18, 0.18, 0.18, -0.2, Y + 9.1, -2.3);
    k.box(2.6, 0.55, 0.06, C.base, -1.2, Y + 5.4, 0.43); // AGENTS sign
    for (let i = 0; i < 6; i++) k.box(0.24, 0.26, 0.02, C.white, -2.05 + i * 0.34, Y + 5.54, 0.47);
    k.box(1.0, 1.4, 0.06, 0x111827, -1.2, Y, 0.42);
    for (let i = 0; i < 3; i++) { // server racks
      const x = 1.3 + i * 0.75;
      k.box(0.55, 1.5, 1.8, 0x15181f, x, Y, -2.0);
      for (let r = 0; r < 4; r++) k.green(0.4, 0.05, 0.02, x, Y + 0.3 + r * 0.3, -1.09);
    }
    k.box(1.3, 0.25, 1.3, 0x3b4048, 1.6, Y, 1.6); k.blue(1.0, 0.06, 1.0, 1.6, Y + 0.25, 1.6); // projector
    const holo = hologram();
    holo.position.set(1.6, Y + 1.5, 1.6);
    holo.userData.animate = (t) => { holo.rotation.y = t * 0.8; holo.position.y = Y + 1.5 + Math.sin(t * 1.6) * 0.12; };
    k.extras.push(holo);
    const d = makeDrone();
    d.position.set(-1.2, Y + 7.72, -1.2);
    d.userData.parcel.visible = false;
    k.extras.push(d);
  },
  beacon(k) {
    k.box(3, 1, 3, C.stone, 0, 0, 0);
    k.box(1.6, 18, 1.6, 0xe9eef5, 0, 1, 0);
    for (let y = 2; y < 18; y += 3) k.box(1.7, 0.4, 1.7, C.base, 0, y, 0);
    k.blue(2.4, 2.4, 2.4, 0, 19, 0);
  },
};

// ---------- Base Avenue: a headquarters for Base projects (src/projects.js) ----------
// Four shapes in the project's colours, its logo up top and its name over the door. The signs are
// clickable (they open the project's site). Until the HQ is built its plot shows the goal, and a plot
// no project has taken yet says so (and links to the contact for ads).
const BRAND_MATS = new Map();
const css = (c) => (typeof c === 'number' ? `#${c.toString(16).padStart(6, '0')}` : c);
const num = (c) => (typeof c === 'number' ? c : parseInt(String(c).replace('#', ''), 16));
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
// a logo image from public/logos (or any https URL that allows it), loaded once
const LOGO_IMAGES = new Map();
function logoImage(src, onload) {
  let img = LOGO_IMAGES.get(src);
  if (!img) { img = new Image(); img.crossOrigin = 'anonymous'; img.src = src; LOGO_IMAGES.set(src, img); }
  if (!img.complete) img.addEventListener('load', onload, { once: true });
  return img.complete && img.naturalWidth ? img : null;
}
// a project's logo: hand-drawn (LOGOS), an image (redraw: called once it loads), else its initial
function drawLogo(g, b, x, y, s, redraw = () => {}) {
  if (LOGOS[b.logo]) return LOGOS[b.logo](g, x, y, s);
  const img = typeof b.logo === 'string' && /^(\/|https:\/\/)/.test(b.logo) ? logoImage(b.logo, redraw) : null;
  if (img) {
    g.save(); g.beginPath(); g.roundRect(x, y, s, s, s * 0.14); g.clip();
    g.drawImage(img, x, y, s, s);
    g.restore();
    return;
  }
  g.fillStyle = css(b.color); rr(g, x, y, s, s, s * 0.14);
  g.fillStyle = css(b.text || '#ffffff'); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${Math.round(s * 0.62)}px "Lilita One", Inter, system-ui, sans-serif`;
  g.fillText(b.name[0].toUpperCase(), x + s / 2, y + s * 0.55);
}
function fitText(g, text, weight, size, family, maxW, x, y) {
  do { g.font = `${weight} ${size}px ${family}`; size -= 2; } while (g.measureText(text).width > maxW && size > 12);
  g.fillText(text, x, y);
}
const DISPLAY = '"Lilita One", Inter, system-ui, sans-serif', BODY = 'Inter, system-ui, sans-serif';
const contact = () => CONFIG.adContact || (CONFIG.xHandle ? `DM @${CONFIG.xHandle}` : '');
// Draws a sign onto its canvas. kind: 'logo' (square), 'name' (the sign over the door), 'soon' (its
// plot's sign) or 'free' (a plot no project has taken: b is { id, plot }). redraw: for logo images.
function drawSign(cv, g, b, kind, redraw) {
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (kind === 'logo') {
    cv.width = cv.height = 256;
    g.fillStyle = css(b.color); g.fillRect(0, 0, 256, 256);
    drawLogo(g, b, 8, 8, 240, redraw);
  } else if (kind === 'name') {
    cv.width = 512; cv.height = 128;
    g.fillStyle = css(b.color); g.fillRect(0, 0, 512, 128);
    drawLogo(g, b, 12, 12, 104, redraw);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = css(b.text || '#ffffff');
    fitText(g, b.name, 800, 60, DISPLAY, 360, 320, b.tagline ? 50 : 66);
    if (b.tagline) { g.globalAlpha = 0.85; fitText(g, b.tagline, 700, 24, BODY, 360, 320, 98); g.globalAlpha = 1; }
  } else if (kind === 'soon') {
    cv.width = 512; cv.height = 256;
    g.fillStyle = '#14213d'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#f4c542'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 246);
    drawLogo(g, b, 28, 52, 152, redraw);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f4c542'; fitText(g, 'COMING SOON', 800, 34, DISPLAY, 280, 345, 56);
    g.fillStyle = '#ffffff'; fitText(g, b.label || `${b.name} HQ`, 800, 48, DISPLAY, 290, 345, 118);
    g.fillStyle = '#9fd0ff'; fitText(g, b.at > 0 ? `at ${Number(b.at).toLocaleString('en-US')} ${CONFIG.citizenPlural}` : 'breaking ground soon', 700, 30, BODY, 290, 345, 186);
  } else {
    cv.width = 512; cv.height = 256;
    g.fillStyle = '#14213d'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#ffc83d'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 246);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffc83d'; fitText(g, 'BASE AVENUE', 800, 34, DISPLAY, 440, 256, 50);
    g.fillStyle = '#ffffff'; fitText(g, `PLOT ${b.plot}`, 800, 64, DISPLAY, 440, 256, 112);
    g.fillStyle = '#9fd0ff'; fitText(g, "Your project's HQ here", 700, 30, BODY, 440, 256, 172);
    if (contact()) { g.fillStyle = '#ffc83d'; fitText(g, contact(), 700, 24, BODY, 440, 256, 214); }
  }
}
function brandMaterial(b, kind) {
  const key = `${b.id}|${kind}|${b.at}|${b.logo}`;
  if (BRAND_MATS.has(key)) return BRAND_MATS.get(key);
  const cv = document.createElement('canvas'), g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  const draw = () => drawSign(cv, g, b, kind, () => { draw(); tex.needsUpdate = true; });
  draw();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 });
  BRAND_MATS.set(key, mat);
  return mat;
}
// a clickable panel facing +z (ry turns it), centred at (x, y, z)
function brandPanel(k, b, kind, w, h, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), brandMaterial(b, kind));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.userData.sponsor = kind === 'free' ? AD_SLOT() : { name: b.name, url: b.url };
  k.extras.push(m);
}
const SIDE = Math.PI / 2; // a panel on the +x face

const HQ = {
  // a glass tower on a podium: accent fins, the logo on its crown, a beacon on top
  tower(k, b, p) {
    const main = num(b.color), acc = num(b.accent || '#ffffff'), glass = mix(main, 0xffffff, 0.55), s = 4.4;
    sidewalk(k);
    k.box(5.8, 1.5, 5.8, mix(main, 0x000000, 0.35), 0, Y, 0);
    k.win(4.2, 1.0, 0.06, 0, Y + 0.25, 2.92); k.win(0.06, 1.0, 4.2, 2.92, Y + 0.25, 0);
    k.box(6, 0.16, 6, acc, 0, Y + 1.5, 0);
    const floors = Math.max(6, p.h - 4), y0 = Y + 1.66;
    for (let f = 0; f < floors; f++) {
      k.box(s, 1, s, main, 0, y0 + f, 0);
      k.box(s + 0.06, 0.5, s + 0.06, glass, 0, y0 + f + 0.28, 0);
      if (f % 2 === 0) { k.win(s * 0.72, 0.28, 0.05, 0, y0 + f + 0.39, s / 2 + 0.06); k.win(0.05, 0.28, s * 0.72, s / 2 + 0.06, y0 + f + 0.39, 0); }
    }
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.32, floors + 2.2, 0.32, acc, (x * s) / 2, y0, (z * s) / 2);
    const top = y0 + floors;
    k.box(s + 0.2, 2.2, s + 0.2, mix(main, 0x000000, 0.25), 0, top, 0);
    brandPanel(k, b, 'logo', 1.9, 1.9, 0, top + 1.1, s / 2 + 0.12);
    brandPanel(k, b, 'logo', 1.9, 1.9, s / 2 + 0.12, top + 1.1, 0, SIDE);
    k.box(0.16, 2.6, 0.16, C.dark, 0, top + 2.2, 0);
    k.blue(0.45, 0.45, 0.45, 0, top + 4.8, 0);
    brandPanel(k, b, 'name', 3.6, 0.9, 0, Y + 2.15, 2.93);
  },
  // a low campus around a forecourt: glass ribbons, a raised wing, a logo cube by the entrance
  campus(k, b, p) {
    const main = num(b.color), acc = num(b.accent || '#ffffff'), glass = mix(main, 0xffffff, 0.6);
    lawn(k);
    k.box(6.4, 0.05, 2.2, 0xd5d8dc, 0, Y, 2.1);
    const h = Math.max(2.6, p.h - 1.4);
    k.box(5.8, h, 3.6, main, 0, Y, -1);
    for (const y of [0.45, 1.55]) { k.box(5.86, 0.7, 3.66, glass, 0, Y + y, -1); k.win(5.2, 0.36, 0.05, 0, Y + y + 0.17, 0.84); k.win(0.05, 0.36, 3.0, 2.94, Y + y + 0.17, -1); }
    k.box(6, 0.16, 3.8, mix(main, 0x000000, 0.35), 0, Y + h, -1);
    k.box(3.2, 1.3, 2.4, acc, -1.1, Y + h + 0.16, -1.4);
    k.win(2.6, 0.4, 0.05, -1.1, Y + h + 0.6, -0.18);
    brandPanel(k, b, 'name', 3.4, 0.85, 1.05, Y + h + 0.62, 0.62);
    for (const x of [-0.6, 2.7]) k.box(0.1, 0.5, 0.1, C.dark, x, Y + h + 0.16, 0.6);
    k.box(1.4, 0.3, 1.4, C.stone, 1.9, Y, 2.1);
    k.box(1.2, 1.2, 1.2, main, 1.9, Y + 0.3, 2.1);
    brandPanel(k, b, 'logo', 1.08, 1.08, 1.9, Y + 0.9, 2.71);
    brandPanel(k, b, 'logo', 1.08, 1.08, 2.51, Y + 0.9, 2.1, SIDE);
    tree(k, -2.6, 2.3, p.k); bush(k, -1.2, 2.6, p.k + 1); bush(k, 0.3, 2.6, p.k + 2);
  },
  // a slim tower in three setbacks with accent rings and a lit spire
  spire(k, b, p) {
    const main = num(b.color), acc = num(b.accent || '#ffffff'), glass = mix(main, 0xffffff, 0.55);
    sidewalk(k);
    const H = Math.max(9, p.h), parts = [[4.2, Math.ceil(H * 0.42)], [3.3, Math.ceil(H * 0.34)], [2.4, H - Math.ceil(H * 0.42) - Math.ceil(H * 0.34)]];
    let y = Y, mid = 0;
    parts.forEach(([s, h], i) => {
      k.box(s, h, s, main, 0, y, 0);
      for (let f = 0; f < h; f += 1) k.box(s + 0.05, 0.42, s + 0.05, glass, 0, y + f + 0.3, 0);
      for (let f = 1; f < h; f += 2) { k.win(s * 0.6, 0.22, 0.05, 0, y + f + 0.4, s / 2 + 0.05); k.win(0.05, 0.22, s * 0.6, s / 2 + 0.05, y + f + 0.4, 0); }
      y += h;
      k.box(s + 0.3, 0.25, s + 0.3, acc, 0, y, 0);
      if (i === 1) mid = y - h / 2;
      y += 0.25;
    });
    brandPanel(k, b, 'logo', 1.8, 1.8, 0, mid, 3.3 / 2 + 0.1);
    brandPanel(k, b, 'logo', 1.8, 1.8, 3.3 / 2 + 0.1, mid, 0, SIDE);
    k.box(0.3, 3.4, 0.3, acc, 0, y, 0);
    k.blue(0.5, 0.5, 0.5, 0, y + 3.4, 0);
    brandPanel(k, b, 'name', 3.4, 0.85, 0, Y + 1.5, 2.16);
  },
  // a round hall under a glass dome, the logo on a pylon out front
  dome(k, b, p) {
    const main = num(b.color), acc = num(b.accent || '#ffffff'), glass = mix(main, 0xffffff, 0.65);
    sidewalk(k);
    const h = Math.max(2.2, p.h - 3.6);
    for (const r of [0, Math.PI / 4]) {
      k.boxR(4.6, h, 4.6, main, 0, Y, -0.4, r);
      k.boxR(4.68, 0.55, 4.68, glass, 0, Y + h * 0.45, -0.4, r);
      k.boxR(4.8, 0.2, 4.8, acc, 0, Y + h, -0.4, r);
    }
    for (let i = 0; i < 5; i++) for (const r of [0, Math.PI / 4]) k.boxR(4.2 - i * 0.8, 0.5, 4.2 - i * 0.8, mix(glass, 0xffffff, i * 0.08), 0, Y + h + 0.2 + i * 0.5, -0.4, r);
    k.blue(0.5, 0.5, 0.5, 0, Y + h + 2.7, -0.4);
    k.win(1.4, 1.1, 0.06, 0, Y + 0.1, 2.0);
    k.box(2.6, 0.18, 1.2, acc, 0, Y + 1.3, 2.2);
    brandPanel(k, b, 'name', 2.8, 0.7, 0, Y + 1.85, 2.82);
    k.box(0.9, 2.4, 0.9, mix(main, 0x000000, 0.35), 2.45, Y, 2.45);
    brandPanel(k, b, 'logo', 0.82, 0.82, 2.45, Y + 1.85, 2.91);
    brandPanel(k, b, 'logo', 0.82, 0.82, 2.91, Y + 1.85, 2.45, SIDE);
  },
  // The GPU District Power Plant: a dark data hall with green light strips, the world's biggest GPU on
  // its roof (its fans spin with the grid), cooling stacks, and a screen with NVDAc live
  gpu(k, b) {
    const hall = 0x16191e, card = 0x2b2f36, green = [0x76b900, 0xb9c4cc, 0xd4af37, 0xb06cff][GRID.level || 0] ?? 0x76b900; // the shroud: its GPU tier
    sidewalk(k, 0x9aa3ad);
    k.box(5.4, 2.6, 4.2, hall, 0, Y, -0.6);
    for (const y of [0.5, 1.2, 1.9]) { k.green(5.0, 0.08, 0.05, 0, Y + y, 1.53); k.green(0.05, 0.08, 3.8, 2.73, Y + y, -0.6); }
    k.box(1.2, 1.3, 0.08, C.dark, -1.6, Y, 1.55); // the door
    brandPanel(k, b, 'name', 3.0, 0.62, 0.9, Y + 0.85, 1.56);
    // the GPU: a card lying across the roof, three fans facing up
    const top = Y + 2.6;
    k.box(4.8, 0.55, 2.4, card, 0, top + 0.3, -0.6);
    k.box(4.9, 0.12, 2.5, green, 0, top + 0.85, -0.6);
    k.box(4.8, 0.3, 0.12, 0xc9a227, 0, top, 0.62); // the gold edge connector
    for (let i = 0; i < 3; i++) {
      const fan = new THREE.Group();
      fan.position.set(-1.55 + i * 1.55, top + 0.98, -0.6);
      const blades = new Kit();
      for (let j = 0; j < 5; j++) {
        const g = UNIT.clone(); g.scale(0.24, 0.05, 0.62); g.translate(0, 0, 0.33); g.rotateY((j * Math.PI * 2) / 5);
        blades.lists.body.push(colored(g, 0x0c0d10));
      }
      blades.box(0.3, 0.07, 0.3, 0x76b900, 0, 0, 0);
      fan.add(blades.build());
      const dir = i % 2 ? -1 : 1;
      fan.userData.animate = (t, dt) => { fan.rotation.y += dt * dir * 7 * GRID.power; };
      k.extras.push(fan);
      k.box(1.45, 0.04, 1.45, 0x3a3f47, -1.55 + i * 1.55, top + 0.94, -0.6);
    }
    brandPanel(k, b, 'logo', 0.9, 0.9, 2.46, top + 0.45, -0.6, SIDE);
    for (const x of [-2.4, 2.4]) { k.box(0.7, 3.4, 0.7, 0x5d6670, x, Y, -2.6); k.green(0.74, 0.1, 0.74, x, Y + 3.0, -2.6); } // cooling stacks
    // the screen by the door: NVDAc live, and the grid's power
    k.box(0.16, 1.6, 0.16, C.dark, -1.95, Y, 2.55);
    k.box(2.0, 1.05, 0.1, C.dark, -1.95, Y + 1.55, 2.5);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 0.93), GPU_MAT);
    screen.position.set(-1.95, Y + 2.07, 2.56);
    k.extras.push(screen);
    brandPanel(k, b, 'logo', 0.7, 0.7, -1.6, Y + 1.85, 1.56); // over the door
  },
  // The Chip Fab: a white cleanroom with a blue-lit band, a second tier with the ducts and air
  // handlers on top, two exhaust stacks, a silicon silo fed from the river side, and the wafer logo
  fab(k, b) {
    const white = 0xf2f4f7, grey = 0xd5d9df, duct = 0xb8c0c8;
    sidewalk(k, 0xd5d8dc);
    k.box(5.4, 2.2, 3.8, white, 0.2, Y, -0.6);
    k.blue(5.0, 0.28, 0.05, 0.2, Y + 1.25, 1.31); k.blue(0.05, 0.28, 3.4, 2.91, Y + 1.25, -0.6);
    k.box(5.5, 0.12, 3.9, grey, 0.2, Y + 2.2, -0.6);
    k.box(4.0, 0.9, 2.6, 0xe6e9ee, 0.6, Y + 2.32, -1.0);
    for (const x of [-0.6, 0.6, 1.8]) { k.box(0.8, 0.45, 0.8, 0x9aa3ad, x, Y + 3.22, -1.0); k.box(0.6, 0.04, 0.6, 0x3a3f47, x, Y + 3.67, -1.0); } // air handlers
    k.box(4.2, 0.22, 0.3, duct, 0.6, Y + 3.0, 0.4); k.box(0.3, 0.22, 2.0, duct, -1.5, Y + 2.6, -0.4); // ducts
    for (const [x, z] of [[-2.3, -2.3], [2.6, -2.4]]) { k.box(0.5, 4.2, 0.5, 0xe6e9ee, x, Y, z); k.box(0.56, 0.2, 0.56, 0xc0392b, x, Y + 3.7, z); k.win(0.5, 0.12, 0.5, x, Y + 4.2, z); } // exhaust stacks
    // the silicon silo and its hopper, on the river side
    k.box(1.0, 2.6, 1.0, 0xc9ced6, -2.45, Y, 1.5); k.box(1.1, 0.3, 1.1, duct, -2.45, Y + 2.6, 1.5); k.box(0.6, 0.6, 0.6, 0xe8d9b5, -2.45, Y + 2.9, 1.5);
    k.box(0.3, 0.2, 1.6, 0x7f8c8d, -2.45, Y + 2.4, 0.4); // the belt into the hall
    brandPanel(k, b, 'name', 2.8, 0.62, 0.7, Y + 0.7, 1.32);
    brandPanel(k, b, 'logo', 0.9, 0.9, 2.92, Y + 1.85, -0.2, SIDE);
    k.box(1.0, 1.1, 0.08, C.dark, -1.0, Y, 1.32); // the door
  },
  // Cat Town Plaza: the town cat as a statue on a plinth (its name on the front), a cat tree, food
  // bowls and the logo on a pylon; cats stroll and nap around it (src/cats.js)
  cats(k, b, p) {
    const main = num(b.color), acc = num(b.accent || '#ffffff');
    lawn(k);
    k.box(5.4, 0.04, 5.4, 0xd9d2c4, 0, Y, 0);
    k.box(2.8, 0.7, 2.8, 0xbfc6cf, 0, Y, -0.6); k.box(2.3, 0.45, 2.3, 0xd9dee5, 0, Y + 0.7, -0.6);
    catStatue(k, 3.2, 0, Y + 1.15, -0.6);
    brandPanel(k, b, 'name', 2.6, 0.62, 0, Y + 0.36, 0.81);
    k.box(0.22, 1.7, 0.22, 0xc8a878, -2.3, Y, 1.9); k.box(0.8, 0.12, 0.8, acc, -2.3, Y + 0.85, 1.9); k.box(0.7, 0.12, 0.7, main, -2.3, Y + 1.7, 1.9); // cat tree
    for (const [x, c] of [[1.0, 0xff79b0], [1.5, 0x9b7cf0]]) { k.box(0.34, 0.1, 0.34, c, x, Y + 0.04, 2.3); k.box(0.24, 0.03, 0.24, 0x8a5a3a, x, Y + 0.14, 2.3); } // bowls
    k.box(0.9, 2.3, 0.9, mix(main, 0x000000, 0.35), 2.4, Y, -2.4);
    brandPanel(k, b, 'logo', 0.82, 0.82, 2.4, Y + 1.75, -1.94);
    brandPanel(k, b, 'logo', 0.82, 0.82, 2.86, Y + 1.75, -2.4, SIDE);
    tree(k, -2.5, -2.5, p.k); bush(k, -2.6, 0.2, p.k + 2); bush(k, 2.6, 0.6, p.k + 3); bush(k, 2.6, 1.6, p.k + 4);
  },
};
export const brandHq = (k, p) => (HQ[p.brand.style] || HQ.tower)(k, p.brand, p);

// A Base Avenue plot no project has taken yet: a lawn with hedges and a sign with the plot's number.
export function freePlot(k, n) {
  k.box(6.4, 0.06, 6.4, C.lawn);
  k.box(6.4, 0.08, 1.2, C.walk, 0, 0, 2.6);
  for (const s of [-1, 1]) { k.box(0.5, 0.45, 5, 0x3f8a3a, s * 2.95, 0, -0.5); k.box(6.4, 0.45, 0.5, 0x3f8a3a, 0, 0, -2.95); }
  for (let i = 0; i < 5; i++) k.box(0.3, 0.25, 0.3, C.flower[i], -1.6 + i * 0.8, 0.06, 1.6);
  for (const x of [-1.6, 1.6]) k.box(0.14, 1.5, 0.14, C.dark, x, 0, 2.4);
  k.box(3.8, 2.0, 0.1, C.dark, 0, 1.0, 2.33);
  brandPanel(k, { id: `plot${n}`, plot: n }, 'free', 3.6, 1.8, 0, 2.0, 2.4);
}

// A Base project's plot before its HQ: cleared ground behind a fence, and a sign with the goal.
export function brandPlot(k, b) {
  k.box(6.4, 0.05, 6.4, 0xc9b99a);
  for (let a = -3; a <= 3; a += 0.75) {
    for (const [x, z] of [[a, -3.1], [-3.1, a], [3.1, a]]) k.box(0.08, 0.6, 0.08, C.wood, x, 0, z);
    if (Math.abs(a) > 2) k.box(0.08, 0.6, 0.08, C.wood, a, 0, 3.1);
  }
  for (const s of [-1, 1]) { k.box(6.2, 0.08, 0.06, C.wood, 0, 0.45, s * 3.1); k.box(0.06, 0.08, 6.2, C.wood, s * 3.1, 0.45, 0); }
  for (const x of [-1.6, 1.6]) k.box(0.14, 1.5, 0.14, C.dark, x, 0, 2.4);
  k.box(3.8, 2.0, 0.1, C.dark, 0, 1.0, 2.33);
  brandPanel(k, b, 'soon', 3.6, 1.8, 0, 2.0, 2.4);
  for (let i = 0; i < 3; i++) k.box(0.45, 0.45, 0.45, i % 2 ? C.gold : C.base, -2 + i * 0.5, 0.05, -1.5); // the first blocks
}

// Every billboard design side by side (for the gallery).
export const adWall = () => kitFor((k) => {
  sidewalk(k);
  const n = Math.min(6, (CONFIG.sponsors?.length || 0) + 1), rows = Math.ceil(n / 2);
  for (const x of [-3.15, 0, 3.15]) k.box(0.16, 0.5 + rows * 1.5, 0.16, C.dark, x, Y, -0.2);
  for (let i = 0; i < n; i++) billboard(k, (i % 2 ? 1 : -1) * 1.58, Y + 0.45 + (rows - 1 - Math.floor(i / 2)) * 1.5, 0, 2.9, 1.13, i, 0.05);
});

// Untouched land: forest, meadow, rocks. Lot (0,0) starts with the founder's pile of blocks.
function wildLot(k, i, j) {
  if (i === 0 && j === 0) {
    const cols = [C.base, C.gold, 0xe74c3c, 0x2ecc71, C.white];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let h = 0; h < 1 + ((a + b) % 3); h++) k.box(0.5, 0.5, 0.5, cols[(a + b + h) % 5], -2.4 + a * 0.55, h * 0.5, -2.4 + b * 0.55);
    return;
  }
  const biome = hash(i, j, 60);
  if (biome < 0.35) { // forest
    const n = 3 + Math.floor(hash(i, j, 61) * 4);
    for (let t = 0; t < n; t++) tree(k, -2.6 + hash(i, j, t, 62) * 5.2, -2.6 + hash(i, j, t, 63) * 5.2, i * 31 + j * 7 + t, 0);
  } else if (biome < 0.7) { // meadow
    for (let t = 0; t < 7; t++) k.box(0.22, 0.22, 0.22, C.flower[t % 5], -2.8 + hash(i, j, t, 64) * 5.6, 0, -2.8 + hash(i, j, t, 65) * 5.6);
    if (hash(i, j, 66) < 0.5) tree(k, -1 + hash(i, j, 67) * 2, -1 + hash(i, j, 68) * 2, i * 17 + j, 0);
  } else { // rocks and bushes
    for (let t = 0; t < 3; t++) {
      const s = 0.4 + hash(i, j, t, 69) * 0.7;
      k.box(s, s * 0.7, s, [0x95a5a6, 0x7f8c8d, 0xa3acb5][t], -2 + hash(i, j, t, 70) * 4, 0, -2 + hash(i, j, t, 71) * 4);
    }
    bush(k, -2 + hash(i, j, 72) * 4, -2 + hash(i, j, 73) * 4, i + j, 0);
  }
}

// Woods the city keeps (sim.js isReserve): tall trees around a trail, sometimes a pond, a bench and
// a sign. Blockies off the site crew come here for a walk.
export function reserveLot(k, i, j) {
  k.box(6.4, 0.1, 6.4, 0x4e9a3c, 0, 0, 0); // forest floor
  const alongX = hash(i, j, 120) < 0.5, pond = hash(i, j, 125) < 0.4;
  k.box(alongX ? 6.4 : 0.8, 0.12, alongX ? 0.8 : 6.4, 0xc9a66b, 0, 0, 0); // the trail
  const px = alongX ? (hash(i, j, 126) - 0.5) * 2 : 1.7, pz = alongX ? 1.7 : (hash(i, j, 126) - 0.5) * 2;
  if (pond) { k.box(2.2, 0.08, 1.6, 0x8d6e4a, px, 0.04, pz); k.water(1.8, 0.1, 1.2, px, 0.06, pz); }
  const clear = (x, z) => (alongX ? Math.abs(z) < 0.95 : Math.abs(x) < 0.95) || (pond && Math.abs(x - px) < 1.6 && Math.abs(z - pz) < 1.3);
  let planted = 0;
  const want = 9 + Math.floor(hash(i, j, 121) * 5);
  for (let t = 0; t < 40 && planted < want; t++) {
    const x = -2.7 + hash(i, j, t, 122) * 5.4, z = -2.7 + hash(i, j, t, 123) * 5.4;
    if (clear(x, z)) continue;
    tree(k, x, z, i * 53 + j * 19 + t, 0.1);
    planted++;
  }
  const bx = alongX ? -1.4 : -1.25, bz = alongX ? -1.25 : -1.4; // a bench by the trail
  k.box(alongX ? 1 : 0.35, 0.08, alongX ? 0.35 : 1, C.wood, bx, 0.38, bz);
  for (const o of [-0.4, 0.4]) k.box(0.08, 0.3, 0.08, C.trunk, bx + (alongX ? o : 0), 0.1, bz + (alongX ? 0 : o));
  k.box(0.08, 0.75, 0.08, C.trunk, alongX ? 2.6 : 1.1, 0.1, alongX ? 1.1 : 2.6); // trail sign
  k.box(alongX ? 0.06 : 0.7, 0.36, alongX ? 0.7 : 0.06, 0x2e7d32, alongX ? 2.6 : 1.1, 0.85, alongX ? 1.1 : 2.6);
}

// How tall a building is drawn. The sim's height (p.h) only prices it (src/sim.js); drawn at full
// height, skyscrapers and whale towers hid the streets behind them, so anything over SHOWN_LOW
// floors grows at SHOWN_RATE per floor instead. The ranking stays: taller in the sim, taller here.
const SHOWN_LOW = 6, SHOWN_RATE = 0.4;
export const shownH = (h) => (h > SHOWN_LOW ? Math.round(SHOWN_LOW + (h - SHOWN_LOW) * SHOWN_RATE) : h);
const asShown = (p) => (p.h > SHOWN_LOW ? { ...p, h: shownH(p.h) } : p);

// A finished building or landmark as a standalone group (also used by gallery.html).
const ROOF_BOARD = { office: 0.35, apartment: 0.3, devhub: 0.25, shop: 0.25 }; // roof height above the body
export const buildingGroup = (p0) => kitFor((k) => {
  const p = asShown(p0);
  if (p.kind === 'landmark') return p.brand ? brandHq(k, p) : LANDMARK[p.type](k);
  if (p.kind === 'wonder') return p.build === 'tower' || p.build === 'skyscraper' ? whaleTower(k, p) : wonder(k, p);
  DESIGN[p.type](k, p);
  if (ROOF_BOARD[p.type] !== undefined && hash(p.k, 77) < 0.5) {
    billboard(k, 0, Y + p.h + ROOF_BOARD[p.type], -p.d / 2 + 0.35, Math.min(p.w - 0.4, 3.4), Math.min(p.w - 0.4, 3.4) * 0.4, 1 + p.k, 0.45);
  }
});

// ---------- ruins: a home, shop or office abandoned after a big exit (src/sim.js depart) ----------
// The same building gone grey and dark, rubble at its feet, weeds, caution tape and a keep-out sign,
// until the crew rebuilds it.
const RUIN_SHUT = new THREE.MeshLambertMaterial({ color: 0x37332f }); // dark windows, dead signs
// the doors of each kind of home, shop or office, as [x, z of the front wall]: boarded up on a ruin
const DOORS = {
  cottage: (p) => [[-p.w / 5, -0.6 + p.d / 2]], house: (p) => [[0, -0.8 + p.d / 2]],
  shop: (p) => [[0, p.d / 2]], cafe: (p) => [[0, -0.5 + p.d / 2]], villa: (p) => [[-0.6, -1.2 + p.d / 2]],
  townhouses: (p) => [[-p.w / 3, p.d / 2], [0, p.d / 2], [p.w / 3, p.d / 2]], suburb: () => [[-1.15, 1.72], [1.15, 1.72]],
  apartment: (p) => [[0, p.d / 2]], office: (p) => [[0, p.d / 2]], devhub: (p) => [[0, p.d / 2]],
  aistartup: () => [[0, 1.4]], brokerage: () => [[0, 0.3]], tower: (p) => [[0, p.d / 2]], skyscraper: (p) => [[0, p.w / 2]],
};
export function ruinGroup(p0) {
  const p = asShown(p0);
  const g = kitFor((k) => DESIGN[p.type](k, p)); // no rooftop ad: nobody rents a board on a ruin
  g.traverse((o) => {
    delete o.userData.animate;
    if (!o.isMesh) return;
    if (o.material !== BODY_MAT) { o.material = RUIN_SHUT; return; }
    const c = o.geometry.attributes.color; // dusty grey
    for (let i = 0; i < c.count; i++) {
      const r = c.getX(i), gr = c.getY(i), b = c.getZ(i), l = 0.3 * r + 0.59 * gr + 0.11 * b;
      c.setXYZ(i, (r * 0.2 + l * 0.8) * 0.64, (gr * 0.2 + l * 0.8) * 0.61, (b * 0.2 + l * 0.8) * 0.56);
    }
    c.needsUpdate = true;
  });
  g.add(kitFor((k) => {
    const s = p.k;
    for (let i = 0; i < 9; i++) { // rubble and fallen blocks along the lot's edge
      const side = i % 4, t = -2.6 + hash(s, i, 1) * 5.2, w = 0.3 + hash(s, i, 2) * 0.45;
      const [x, z] = [[t, 2.75], [2.75, t], [t, -2.75], [-2.75, t]][side];
      k.boxR(w, 0.2 + hash(s, i, 3) * 0.35, w * 0.8, i % 3 ? 0x8d8a85 : 0x6e5d4b, x, Y, z, hash(s, i, 4) * 3);
    }
    for (let i = 0; i < 5; i++) k.box(0.3, 0.3 + hash(s, i, 5) * 0.3, 0.3, C.leaf[i % 4], -2.9 + hash(s, i, 6) * 5.8, Y, i % 2 ? 2.95 : -2.95); // weeds
    for (const [x, z] of [[-3.05, 3.05], [3.05, 3.05], [3.05, -3.05], [-3.05, -3.05]]) k.box(0.1, 0.75, 0.1, 0x7f8c8d, x, Y, z); // caution tape
    for (let a = -3; a < 3; a += 0.5) {
      const c = Math.round((a + 3) / 0.5) % 2 ? 0x2b2f36 : 0xf4c542;
      k.box(0.5, 0.1, 0.03, c, a + 0.25, Y + 0.6, 3.05); k.box(0.5, 0.1, 0.03, c, a + 0.25, Y + 0.6, -3.05);
      k.box(0.03, 0.1, 0.5, c, 3.05, Y + 0.6, a + 0.25); k.box(0.03, 0.1, 0.5, c, -3.05, Y + 0.6, a + 0.25);
    }
    for (const [x, z] of DOORS[p.type]?.(p) || []) { // boarded-up doors
      [0.22, 0.55, 0.88].forEach((y, i) => k.box(0.8 + hash(s, x, i) * 0.3, 0.16, 0.05, i % 2 ? 0x8a6a45 : C.wood, x + (hash(s, x, i, 1) - 0.5) * 0.2, Y + y, z + 0.08));
    }
    k.box(0.08, 1.1, 0.08, C.trunk, 2.3, Y, 3.25); // keep out
    k.boxR(1, 0.55, 0.06, 0xc0392b, 2.3, Y + 0.85, 3.3, 0.12);
    k.boxR(0.75, 0.09, 0.07, C.white, 2.3, Y + 1.08, 3.31, 0.12);
  }));
  return g;
}

// ---------- city ----------

const lotPos = ([i, j]) => [i * PITCH, j * PITCH];
const lotKey = ([i, j]) => `${i},${j}`;

export function createCity(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const hemi = new THREE.HemisphereLight(0xdff1ff, 0x7a6a55, 1.8);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(0xd6efff, 120, 260); // distant countryside fades into haze

  const groundGroup = new THREE.Group();
  const roadGroup = new THREE.Group();
  const lotsGroup = new THREE.Group();
  root.add(groundGroup, roadGroup, lotsGroup);

  let land = 0;
  const lots = new Map(); // key -> { kind, k, group }
  const sites = new Map(); // project k -> its construction site (one per crew, see CONFIG.sites)
  let siteVersion = 0;
  const rising = []; // groups animating out of the ground
  const animated = []; // objects with userData.animate(t, dt): rides, turbines, planes
  const billboards = []; // clickable billboard panels (userData.sponsor)
  let developed = new Set();
  let roadSig = '';
  let snapshot = { land: 0, next: null, placed: 0, sites: [] };
  let drawn = 1; // builders drawn in the city (set by main.js)
  let counts = {}; // finished buildings by type (service vehicles read it)
  let built = []; // finished lots: { x, z, h, type } (the AI agent drones fly between them)
  const graph = { nodes: new Map(), adj: new Map(), version: 0 };

  function setLot(key, lot, kind, k, group, animate, sig = '') {
    const old = lots.get(key);
    if (old) {
      lotsGroup.remove(old.group);
      old.group.traverse((o) => {
        const i = animated.indexOf(o); if (i >= 0) animated.splice(i, 1);
        const b = billboards.indexOf(o); if (b >= 0) billboards.splice(b, 1);
      });
    }
    const [x, z] = lotPos(lot);
    group.position.set(x, 0, z);
    group.traverse((o) => { if (o.userData.animate) animated.push(o); if (o.userData.sponsor) billboards.push(o); });
    lotsGroup.add(group);
    lots.set(key, { kind, k, group, sig });
    if (animate) { group.scale.set(1, 0.01, 1); rising.push({ group, t: 0, mode: 'grow' }); }
  }

  // a concrete road bridge where a paved street crosses the river: it spans between two junctions,
  // and its railings stop where the junctions begin (the junctions get their own deck and railings)
  const RAIL = 0xd5d8dc, DECK = 0xb0b6bd;
  function roadBridge(k, x, z, along) {
    const span = PITCH - 2, ax = along === 'x';
    k.box(ax ? span + 0.6 : 2.6, 0.3, ax ? 2.6 : span + 0.6, DECK, x, -0.15, z);
    k.box(ax ? span : 2, 0.05, ax ? 2 : span, C.road, x, 0.15, z);
    for (let s = -2; s <= 2; s += 2) k.box(ax ? 0.9 : 0.12, 0.02, ax ? 0.12 : 0.9, 0xf4f4f0, x + (ax ? s : 0), 0.2, z + (ax ? 0 : s));
    for (const o of [-1.2, 1.2]) k.box(ax ? span : 0.2, 0.3, ax ? 0.2 : span, RAIL, x + (ax ? 0 : o), 0.15, z + (ax ? o : 0));
    for (const s of [-2.5, 2.5]) k.box(ax ? 0.6 : 1.6, 0.6, ax ? 1.6 : 0.6, 0x9aa3ad, x + (ax ? s : 0), -0.75, z + (ax ? 0 : s));
  }

  // a wooden footbridge where no road crosses; cutA / cutB pull its ends back from a road junction
  function bridge(k, x, z, along, cutA = 0, cutB = 0) {
    const ax = along === 'x', from = -(PITCH + 0.4) / 2 + cutA, to = (PITCH + 0.4) / 2 - cutB, long = to - from, mid = (from + to) / 2;
    const at = (s, o) => (ax ? [x + s, z + o] : [x + o, z + s]);
    const [cx, cz] = at(mid, 0);
    k.box(ax ? long : 2, 0.25, ax ? 2 : long, C.wood, cx, -0.1, cz);
    const posts = Math.max(1, Math.round(long / 1.4));
    for (const o of [-0.95, 0.95]) {
      const [rx, rz] = at(mid, o);
      k.box(ax ? long : 0.08, 0.08, ax ? 0.08 : long, 0x6e4b2a, rx, 0.45, rz);
      for (let n = 0; n <= posts; n++) { const [px, pz] = at(from + (n * long) / posts, o); k.box(0.1, 0.45, 0.1, 0x6e4b2a, px, 0.1, pz); }
    }
  }

  // ----- square city land with a river, set in open countryside -----
  // A river lot: sand bed, water, grass banks where the neighbours are dry.
  function riverCell(k, i, j) {
    const x = i * PITCH, z = j * PITCH;
    const wet = (di, dj) => isWater(i + di, j + dj);
    k.box(PITCH, 0.12, PITCH, C.sand, x, -0.42, z);
    const x0 = wet(-1, 0) ? -4 : -3, x1 = wet(1, 0) ? 4 : 3, z0 = wet(0, -1) ? -4 : -3, z1 = wet(0, 1) ? 4 : 3;
    k.water(x1 - x0, 0.15, z1 - z0, x + (x0 + x1) / 2, -0.32, z + (z0 + z1) / 2);
    if (!wet(-1, 0)) k.box(1, 0.3, PITCH, C.grass2, x - 3.5, -0.3, z);
    if (!wet(1, 0)) k.box(1, 0.3, PITCH, C.grass2, x + 3.5, -0.3, z);
    if (!wet(0, -1)) k.box(PITCH, 0.3, 1, C.grass2, x, -0.3, z - 3.5);
    if (!wet(0, 1)) k.box(PITCH, 0.3, 1, C.grass2, x, -0.3, z + 3.5);
    for (const [cx, cz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) {
      const sx = Math.sign(cx), sz = Math.sign(cz);
      if (!wet(sx, sz) || !wet(sx, 0) || !wet(0, sz)) k.box(1, 0.3, 1, C.grass2, x + cx, -0.3, z + cz);
    }
    if (hash(i, j, 80) < 0.5) k.box(0.5, 0.05, 0.5, 0x4caf50, x + hash(i, j, 81) * 3 - 1.5, -0.18, z + hash(i, j, 82) * 3 - 1.5);
  }

  // The countryside around the city, level with it: crop fields, meadows, woods and farms.
  const FIELD = [0xd9c45a, 0x9ccc65, 0xc8b46a, 0x8bc34a, 0xe0b85a];
  function countryCell(k, i, j, road) {
    const x = i * PITCH, z = j * PITCH, r = hash(i, j, 90);
    k.box(PITCH, 0.3, PITCH, (i + j) % 2 ? 0x66b046 : 0x5fa942, x, -0.3, z);
    if (road) return;
    if (r < 0.34) { // a crop field in rows
      const crop = FIELD[Math.floor(hash(i, j, 91) * FIELD.length)], alongX = hash(i, j, 92) < 0.5;
      k.box(6.6, 0.05, 6.6, crop, x, 0, z);
      for (let s = -2.8; s <= 2.81; s += 0.8) {
        if (alongX) k.box(6.6, 0.07, 0.14, 0x7a6a3a, x, 0, z + s); else k.box(0.14, 0.07, 6.6, 0x7a6a3a, x + s, 0, z);
      }
    } else if (r < 0.6) { // woods
      const n = 3 + Math.floor(hash(i, j, 93) * 4);
      for (let t = 0; t < n; t++) tree(k, x - 2.6 + hash(i, j, t, 94) * 5.2, z - 2.6 + hash(i, j, t, 95) * 5.2, i * 41 + j * 13 + t, 0);
    } else if (r < 0.67) { // a farm: barn, silo, a tree
      k.box(2.2, 1.4, 1.6, 0xb03a2e, x - 0.8, 0, z - 0.6); gableRoof(k, 2.2, 1.6, 1.4, 0x6e2f22, x - 0.8, z - 0.6);
      k.box(0.9, 2.4, 0.9, 0xd5d8dc, x + 1.6, 0, z - 1.2); k.box(1.0, 0.3, 1.0, 0x9aa3ad, x + 1.6, 2.4, z - 1.2);
      k.box(3.2, 0.05, 2.2, 0xc8b46a, x + 0.2, 0, z + 2.0);
      tree(k, x + 2.4, z + 2.4, i * 7 + j, 0);
    } else { // meadow
      for (let t = 0; t < 5; t++) k.box(0.22, 0.22, 0.22, C.flower[t % 5], x - 2.8 + hash(i, j, t, 96) * 5.6, 0, z - 2.8 + hash(i, j, t, 97) * 5.6);
      if (hash(i, j, 98) < 0.4) bush(k, x - 2 + hash(i, j, 99) * 4, z - 2 + hash(i, j, 100) * 4, i + j * 3, 0);
    }
  }

  function buildLand(L, animateRing) {
    groundGroup.clear();
    const H = L * PITCH + 4, RC = L + 7; // city half-size; countryside drawn out to RC lots
    const k = new Kit();
    for (let i = -L; i <= L; i++) for (let j = -L; j <= L; j++) {
      const x = i * PITCH, z = j * PITCH;
      if (isWater(i, j)) riverCell(k, i, j);
      else k.box(PITCH, 0.3, PITCH, (i + j) % 2 ? C.grass : C.grass2, x, -0.3, z);
    }
    // highways into town from the west and the south, clear of the river
    const westZ = PITCH / 2, southX = -1.5 * PITCH;
    const onRoad = (i, j) => (i < -L && (j === 0 || j === 1)) || (j > L && (i === -2 || i === -1));
    for (let i = -RC; i <= RC; i++) for (let j = -RC; j <= RC; j++) {
      if (Math.abs(i) <= L && Math.abs(j) <= L) continue;
      if (isWater(i, j)) riverCell(k, i, j); else countryCell(k, i, j, onRoad(i, j));
    }
    const far = RC * PITCH + 4, len = far - H;
    k.box(len, 0.06, 2.4, C.road, -(H + far) / 2, 0, westZ);
    k.box(2.4, 0.06, len, C.road, southX, 0, (H + far) / 2);
    for (let d = H + 1; d < far; d += 2.2) { k.box(1, 0.02, 0.12, C.white, -d, 0.06, westZ); k.box(0.12, 0.02, 1, C.white, southX, 0.06, d); }
    for (let d = H + 6; d < far; d += 12) { // street lights along the highways
      k.box(0.1, 1.8, 0.1, C.dark, -d, 0, westZ + 1.5); k.win(0.3, 0.2, 0.3, -d, 1.8, westZ + 1.5);
      k.box(0.1, 1.8, 0.1, C.dark, southX + 1.5, 0, d); k.win(0.3, 0.2, 0.3, southX + 1.5, 1.8, d);
    }
    // the city limits: a gravel path around the land (the river runs under it)
    const lim = H - 0.55;
    for (let t = -L; t <= L; t++) for (const sgn of [-1, 1]) {
      if (!isWater(t, sgn * L) && !isWater(t, sgn * (L + 1))) k.box(PITCH, 0.04, 0.7, 0xd9cfb8, t * PITCH, 0, sgn * lim);
      if (!isWater(sgn * L, t) && !isWater(sgn * (L + 1), t)) k.box(0.7, 0.04, PITCH, 0xd9cfb8, sgn * lim, 0, t * PITCH);
    }
    k.box(4000, 0.1, 4000, 0x5fa942, 0, -0.56, 0); // and the rest of the world
    if (scene.fog) { scene.fog.near = 70 + H * 1.1; scene.fog.far = scene.fog.near + 140; }
    groundGroup.add(k.build());
    Object.assign(sun.shadow.camera, { left: -H - 24, right: H + 24, top: H + 24, bottom: -H - 24, near: 1, far: 300 });
    sun.shadow.camera.updateProjectionMatrix();

    for (let i = -L; i <= L; i++) for (let j = -L; j <= L; j++) {
      const key = `${i},${j}`;
      if (lots.has(key) || isWater(i, j)) continue;
      const plot = AVENUE.findIndex((lot) => lot[0] === i && lot[1] === j), hq = plot >= 0 && LANDMARKS.find((l) => l.brand?.plot === plot + 1)?.brand;
      if (isReserve(i, j)) setLot(key, [i, j], 'reserve', -1, kitFor((kk) => reserveLot(kk, i, j)));
      else if (hq) setLot(key, [i, j], 'plot', -1, kitFor((kk) => brandPlot(kk, hq))); // a Base project's HQ goes here
      else if (plot >= 0) setLot(key, [i, j], 'plot', -1, kitFor((kk) => freePlot(kk, plot + 1)));
      else setLot(key, [i, j], 'wild', -1, kitFor((kk) => wildLot(kk, i, j)));
      if (animateRing && Math.max(Math.abs(i), Math.abs(j)) === L) {
        const g = lots.get(key).group;
        g.position.y = -3;
        rising.push({ group: g, t: 0, mode: 'rise' });
      }
    }
    land = L;
  }

  // ----- roads appear next to developed lots; bridges carry them over the river -----
  function buildRoads() {
    const L = land;
    const dev = (i, j) => developed.has(`${i},${j}`);
    const segs = [];
    const paved = new Set();
    // h(i,j): between lots (i,j)-(i,j+1), runs along x at z = 8j+4. v(i,j): between (i,j)-(i+1,j), along z at x = 8i+4.
    for (let i = -L; i <= L; i++) for (let j = -L; j < L; j++) {
      if (!(isWater(i, j) && isWater(i, j + 1)) && (dev(i, j) || dev(i, j + 1))) { segs.push([i, j, 'h', false]); paved.add(`h${i},${j}`); }
    }
    for (let i = -L; i < L; i++) for (let j = -L; j <= L; j++) {
      if (!(isWater(i, j) && isWater(i + 1, j)) && (dev(i, j) || dev(i + 1, j))) { segs.push([i, j, 'v', false]); paved.add(`v${i},${j}`); }
    }
    // node X(i,j) sits at (8i+4, 8j+4)
    const touch = (i, j) => paved.has(`h${i},${j}`) || paved.has(`h${i + 1},${j}`) || paved.has(`v${i},${j}`) || paved.has(`v${i},${j + 1}`);
    for (let i = -L; i <= L; i++) for (let j = -L; j < L; j++) {
      if (isWater(i, j) && isWater(i, j + 1) && touch(i - 1, j) && touch(i, j)) segs.push([i, j, 'h', true]);
    }
    for (let i = -L; i < L; i++) for (let j = -L; j <= L; j++) {
      if (isWater(i, j) && isWater(i + 1, j) && touch(i, j - 1) && touch(i, j)) segs.push([i, j, 'v', true]);
    }
    const sig = `${L}|` + segs.map((s) => s.join(':')).sort().join('|');
    if (sig === roadSig) return;
    roadSig = sig;

    roadGroup.clear();
    graph.nodes.clear(); graph.adj.clear(); graph.version++;
    const k = new Kit();
    const edge = (i, j) => i >= L || i < -L || j >= L || j < -L; // junctions on the land's rim
    const node = (i, j) => {
      const key = `${i},${j}`;
      if (!graph.nodes.has(key)) { graph.nodes.set(key, [i * PITCH + 4, j * PITCH + 4]); graph.adj.set(key, []); }
      return key;
    };
    const link = (a, b) => {
      if (edge(...a) || edge(...b)) return; // cars turn back before the rim
      const ka = node(...a), kb = node(...b);
      graph.adj.get(ka).push(kb); graph.adj.get(kb).push(ka);
    };
    const carried = new Set();
    for (const [i, j, dir, onBridge] of segs) {
      if (dir === 'h') {
        const x = i * PITCH, z = j * PITCH + 4;
        if (onBridge) { roadBridge(k, x, z, 'x'); carried.add(`h${i},${j}`); }
        else {
          k.box(PITCH - 2, 0.05, 2, C.road, x, 0, z);
          for (let s = -2; s <= 2; s += 2) k.box(0.9, 0.02, 0.12, 0xf4f4f0, x + s, 0.05, z);
        }
        link([i - 1, j], [i, j]);
      } else {
        const x = i * PITCH + 4, z = j * PITCH;
        if (onBridge) { roadBridge(k, x, z, 'z'); carried.add(`v${i},${j}`); }
        else {
          k.box(2, 0.05, PITCH - 2, C.road, x, 0, z);
          for (let s = -2; s <= 2; s += 2) k.box(0.12, 0.02, 0.9, 0xf4f4f0, x, 0.05, z + s);
        }
        link([i, j - 1], [i, j]);
      }
    }
    // every other river crossing keeps a wooden footbridge, stopping short of any road junction
    const foot = [];
    for (let i = -L; i <= L; i++) for (let j = -L; j < L; j++) if (isWater(i, j) && isWater(i, j + 1) && !carried.has(`h${i},${j}`)) foot.push([i, j, 'h']);
    for (let i = -L; i < L; i++) for (let j = -L; j <= L; j++) if (isWater(i, j) && isWater(i + 1, j) && !carried.has(`v${i},${j}`)) foot.push([i, j, 'v']);
    const cut = (i, j) => (graph.nodes.has(`${i},${j}`) ? 1.2 : 0);
    for (const [i, j, d] of foot) {
      if (d === 'h') bridge(k, i * PITCH, j * PITCH + 4, 'x', cut(i - 1, j), cut(i, j));
      else bridge(k, i * PITCH + 4, j * PITCH, 'z', cut(i, j - 1), cut(i, j));
    }
    // junctions: over the river they sit on a deck at bridge height, with railings on every side over
    // the water that no road or bridge leaves from
    const open = new Set([...segs, ...foot].map(([i, j, d]) => `${d}${i},${j}`));
    for (const [key, [x, z]] of graph.nodes) {
      const [i, j] = key.split(',').map(Number);
      const wet = [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]].map(([a, b]) => isWater(a, b));
      const y = wet.every(Boolean) ? 0.15 : 0;
      if (wet.some(Boolean)) k.box(2.6, 0.3, 2.6, DECK, x, y - 0.3, z);
      k.box(2, 0.05, 2, C.road, x, y, z);
      for (const [seg, a, b, dx, dz] of [
        [`h${i},${j}`, [i, j], [i, j + 1], -1, 0], [`h${i + 1},${j}`, [i + 1, j], [i + 1, j + 1], 1, 0],
        [`v${i},${j}`, [i, j], [i + 1, j], 0, -1], [`v${i},${j + 1}`, [i, j + 1], [i + 1, j + 1], 0, 1],
      ]) {
        if (!open.has(seg) && isWater(...a) && isWater(...b)) k.box(dx ? 0.2 : 2.6, 0.3, dx ? 2.6 : 0.2, RAIL, x + dx * 1.2, y, z + dz * 1.2);
      }
      if ((i + j) % 2 === 0) { k.box(0.12, 2, 0.12, C.dark, x + 1.15, y, z + 1.15); k.win(0.35, 0.25, 0.35, x + 1.15, y + 2, z + 1.15); }
    }
    roadGroup.add(k.build());
  }

  // ----- construction site -----
  function makeSite(p) {
    const g = new THREE.Group();
    g.add(kitFor((k) => {
      k.box(6.4, 0.08, 6.4, 0xc9b99a);
      for (let s = -3; s <= 3; s += 0.75) {
        const c = Math.round(s / 0.75) % 2 ? 0xf39c12 : C.white;
        k.box(0.7, 0.35, 0.1, c, s, 0.08, -3.1); k.box(0.1, 0.35, 0.7, c, -3.1, 0.08, s); k.box(0.1, 0.35, 0.7, c, 3.1, 0.08, s);
        if (Math.abs(s) > 1) k.box(0.7, 0.35, 0.1, c, s, 0.08, 3.1);
      }
      for (let i = 0; i < 4; i++) k.box(0.45, 0.45, 0.45, i % 2 ? C.gold : C.base, 2.3 + (i % 2) * 0.5, 0.08 + Math.floor(i / 2) * 0.45, 2.4);
    }));
    const s = { k: p.k, p, group: g, jib: null, hook: null, cable: null, ch: 0, floors: -1, floorsMesh: null, topY: 1 };
    if (p.h >= 4) {
      s.ch = Math.max(7, shownH(p.h) + 4);
      g.add(kitFor((ck) => {
        for (let y = 0; y < s.ch; y++) {
          for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) ck.box(0.1, 1, 0.1, C.gold, x - 3.6, Y + y, z - 3.6);
          ck.box(0.7, 0.07, 0.07, C.gold, -3.6, Y + y, -3.9);
        }
      }));
      s.jib = new THREE.Group();
      s.jib.position.set(-3.6, Y + s.ch, -3.6);
      s.jib.add(kitFor((jk) => { jk.box(0.4, 0.4, 6, C.gold, 0, 0, 2.2); jk.box(0.7, 0.6, 1, C.dark, 0, 0, -1.2); jk.box(0.6, 0.6, 0.6, C.dark, 0, 0.4, 0); }));
      s.hook = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial({ color: 0xd35400 }));
      s.hook.scale.setScalar(0.35);
      s.cable = new THREE.Mesh(UNIT, new THREE.MeshBasicMaterial({ color: 0x222222 }));
      s.jib.add(s.hook, s.cable);
      g.add(s.jib);
    }
    s.partial = new THREE.InstancedMesh(UNIT, new THREE.MeshLambertMaterial({ color: p.color }), 64);
    s.partial.castShadow = s.partial.receiveShadow = true;
    s.partial.count = 0;
    g.add(s.partial);
    return s;
  }

  function updateSite(p, placed) {
    if (!p.lot) return; // land expansion, metro: no construction site on a lot
    let site = sites.get(p.k);
    if (!site) {
      site = makeSite(p);
      sites.set(p.k, site);
      siteVersion++;
      setLot(lotKey(p.lot), p.lot, 'site', p.k, site.group);
    }
    const frac = Math.min(1, placed / p.cost);
    const fw = Math.min(6, p.w), fd = Math.min(6, p.d), area = fw * fd;
    const levels = Math.max(1, shownH(p.h));
    const exact = frac * levels;
    const floors = Math.min(levels - 1, Math.floor(exact));
    const partialN = Math.min(area, Math.floor((exact - floors) * area));
    if (floors !== site.floors) {
      site.floors = floors;
      if (site.floorsMesh) site.group.remove(site.floorsMesh);
      site.floorsMesh = null;
      if (floors > 0) {
        site.floorsMesh = kitFor((k) => {
          k.box(fw, floors, fd, p.color, 0, 0.08, 0);
          for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.1, floors + 1, 0.1, 0x7f8c8d, x * (fw / 2 + 0.25), 0.08, z * (fd / 2 + 0.25));
        });
        site.group.add(site.floorsMesh);
      }
    }
    const m4 = new THREE.Matrix4();
    site.partial.count = partialN;
    for (let n = 0; n < partialN; n++) {
      m4.makeTranslation(-fw / 2 + 0.5 + (n % fw), 0.08 + floors + 0.5, -fd / 2 + 0.5 + Math.floor(n / fw));
      site.partial.setMatrixAt(n, m4);
    }
    site.partial.instanceMatrix.needsUpdate = true;
    site.topY = floors + 1;
  }


  // Bring the rendered city in line with a simulation snapshot.
  let waiting = new Set(); // tech buildings waiting for chips (their project k), from main.js
  function sync(sim, animate) {
    if (sim.land !== land) buildLand(sim.land, animate && land > 0);
    // what stands on each lot now; a lot being rebuilt shows its construction site instead
    const now = sim.sites || [{ p: sim.next, placed: sim.placed }];
    const busy = new Set(now.filter((x) => x.p.lot).map((x) => lotKey(x.p.lot)));
    const dev = new Set(sim.standing.keys());
    for (const [key, p] of sim.standing) {
      if (busy.has(key)) continue;
      // a whale's building shows its name, until its whale sells (then it goes dark)
      const dark = p.whale?.lostAt <= sim.now, kind = p.ruinedAt ? 'ruin' : 'built', off = waiting.has(p.k);
      const sig = `${p.whale?.name || ''}${dark ? '|dark' : ''}${off ? '|off' : ''}${p.type === 'hq-gpu' ? `|gpu${GRID.level}` : ''}`;
      const cur = lots.get(key);
      if (cur?.kind === kind && cur.k === p.k && cur.sig === sig) continue;
      sites.delete(p.k);
      const group = kind === 'ruin' ? ruinGroup(p) : dark ? darken(buildingGroup({ ...p, dark })) : off ? offline(buildingGroup(p), shownH(p.h)) : buildingGroup(p);
      setLot(key, p.lot, kind, p.k, group, animate && kind === 'built' && cur?.k !== p.k, sig);
    }
    for (const key of busy) dev.add(key);
    developed = dev;
    counts = {};
    built = [];
    for (const [key, p] of sim.standing) {
      if (busy.has(key) || p.ruinedAt) continue;
      counts[p.type] = (counts[p.type] || 0) + 1;
      built.push({ x: p.lot[0] * PITCH, z: p.lot[1] * PITCH, h: shownH(p.h ?? 2), type: p.type });
    }
    // sites whose project is gone without a building (an expansion took over...): back to wild land
    const live = new Set(now.map((x) => x.p.k));
    for (const [k, st] of sites) {
      if (live.has(k)) continue;
      const key = lotKey(st.p.lot);
      if (lots.get(key)?.kind === 'site' && lots.get(key).k === k) setLot(key, st.p.lot, 'wild', -1, kitFor((kk) => wildLot(kk, ...st.p.lot)));
      sites.delete(k);
    }
    for (const x of now) updateSite(x.p, x.placed);
    buildRoads();
    snapshot = { land: sim.land, next: sim.next, placed: sim.placed, sites: now };
  }

  // ----- day / night, same phase for every visitor -----
  // phaseOverride / warm: a visitor's own light for cinematic shots (src/cinematic.js); the sky's
  // colours and the sun's direction for its sky dome
  const env = { daylight: 1, phase: 0, phaseOverride: null, warm: 0, skyTop: new THREE.Color(), skyBottom: new THREE.Color(), sunDir: new THREE.Vector3(0, 1, 0) };
  const WARM_TOP = new THREE.Color('#6b78c8'), WARM_BOT = new THREE.Color('#ffb070'), WARM_SUN = new THREE.Color('#ffae5c');
  const sky = {
    dayTop: new THREE.Color('#5fb8ff'), dayBot: new THREE.Color('#d6efff'), nightTop: new THREE.Color('#0a1230'), nightBot: new THREE.Color('#2b3a6b'),
    stormTop: new THREE.Color('#4a5568'), stormBot: new THREE.Color('#8a94a6'),
  };
  let skyAcc = 1, pulse = 0;

  function update(t, dt) {
    const phase = env.phaseOverride ?? (now() / (CONFIG.dayLengthMin * 60000)) % 1;
    const s = Math.sin(phase * Math.PI * 2);
    const dl = THREE.MathUtils.smoothstep(s, -0.25, 0.3);
    env.daylight = dl; env.phase = phase;
    const H = land * PITCH + 4;
    sun.position.set(Math.cos(phase * Math.PI * 2) * H * 1.5, 25 + Math.max(0, s) * 20, H * 0.6);
    const gloom = env.gloom || 0, flash = env.flash || 0; // weather (see weather.js)
    sun.intensity = (0.25 + 2.4 * dl) * (1 - 0.65 * gloom) + flash * 2;
    sun.color.setHSL(0.1, 0.6 - 0.3 * dl, 0.75 + 0.2 * dl);
    if (env.warm) sun.color.lerp(WARM_SUN, env.warm * 0.6);
    env.sunDir.copy(sun.position).normalize();
    hemi.intensity = (0.55 + 1.3 * dl) * (1 - 0.35 * gloom) + flash * 3;
    hemi.color.setHSL(0.58, 0.6, 0.45 + 0.45 * dl);
    GLOW_MAT.emissiveIntensity = 0.15 + 1.1 * (1 - dl);
    GREEN_GLOW.emissiveIntensity = (0.4 + 0.8 * (1 - dl)) * GRID.power; // the GPU District's grid (NVDAc)
    pulse = Math.max(0, pulse - dt * 1.5);
    BLUE_GLOW.emissiveIntensity = 0.8 + pulse * 1.5;
    const top = env.skyTop.copy(sky.nightTop).lerp(sky.dayTop, dl).lerp(sky.stormTop, gloom * 0.8), bot = env.skyBottom.copy(sky.nightBot).lerp(sky.dayBot, dl).lerp(sky.stormBot, gloom * 0.8);
    if (env.warm) { top.lerp(WARM_TOP, env.warm * 0.35 * dl); bot.lerp(WARM_BOT, env.warm * 0.6 * dl); }
    if (flash > 0) { top.lerp(new THREE.Color('#e8ecff'), flash * 0.7); bot.lerp(new THREE.Color('#ffffff'), flash * 0.7); }
    scene.fog.color.copy(bot);
    skyAcc += dt;
    if (skyAcc > (flash > 0 ? 0.05 : 0.5)) {
      skyAcc = 0;
      document.documentElement.style.setProperty('--sky-top', `#${top.getHexString()}`);
      document.documentElement.style.setProperty('--sky-bottom', `#${bot.getHexString()}`);
    }

    for (let i = rising.length - 1; i >= 0; i--) {
      const r = rising[i];
      r.t = Math.min(1, r.t + dt * (r.mode === 'rise' ? 0.6 : 1.4));
      if (r.mode === 'grow') {
        const k = r.t, b = 1.7;
        r.group.scale.y = Math.max(0.01, 1 + (b + 1) * Math.pow(k - 1, 3) + b * Math.pow(k - 1, 2));
      } else {
        r.group.position.y = -3 * Math.pow(1 - r.t, 3);
      }
      if (r.t >= 1) rising.splice(i, 1);
    }
    for (const o of animated) o.userData.animate(t, dt);

    for (const site of sites.values()) {
      if (!site.jib) continue;
      const o = site.k * 1.7; // each crane on its own swing
      site.jib.rotation.y = 0.8 + Math.sin(t * 0.4 + o) * 0.5;
      const reach = 4.2 + Math.sin(t * 0.7 + o) * 0.8;
      const drop = Math.max(1, site.ch - site.topY + 0.5);
      site.hook.position.set(0, -drop, reach);
      site.cable.scale.set(0.04, drop, 0.04);
      site.cable.position.set(0, -drop / 2, reach);
    }
  }

  // ----- spots for Blockies to walk to -----
  const home = (seed) => {
    const a = hash(seed, 1) * Math.PI * 2;
    return [-1.9 + Math.cos(a) * 1.5, -1.9 + Math.sin(a) * 1.5];
  };
  // who: the builder, so each one keeps to one side of a long site (the land's border, the metro loop)
  // which site a builder works on: each keeps to one while the number of sites stays the same
  const siteOf = (who) => { const list = snapshot.sites || []; return list.length ? list[Math.floor(hash(who, 13) * list.length)].p : snapshot.next; };
  function siteSpot(seed, who = seed) {
    const p = siteOf(who);
    if (!p) return home(seed);
    if (p.kind === 'expand' || p.kind === 'metro') { // reclaim land along the border / raise the metro over the ring road
      const e = p.kind === 'metro' ? PITCH * (land - 1) + PITCH / 2 : land * PITCH + 2.5, s = (hash(seed, 5) - 0.5) * 2 * e;
      return [[s, e], [s, -e], [e, s], [-e, s]][Math.floor(hash(who, 6) * 4)];
    }
    const [x, z] = lotPos(p.lot);
    const side = Math.floor(hash(seed, 2) * 4), off = (hash(seed, 3) - 0.5) * 4.5, e = 3.5;
    return [[x + off, z + e], [x + off, z - e], [x + e, z + off], [x - e, z + off]][side];
  }
  // The crew's block pile sits right by the site (the crossroads at its corner facing the town centre),
  // so trips stay short and the streets stay clear.
  function depotSpot(seed, who = seed) {
    const p = siteOf(who);
    if (!p) return home(seed);
    if (p.kind === 'expand' || p.kind === 'metro') { const [x, z] = siteSpot(seed, who); return [x * 0.86, z * 0.86]; }
    const [x, z] = lotPos(p.lot), a = hash(seed, 1) * Math.PI * 2;
    return [x + (x > 0 ? -1 : 1) * (PITCH / 2) + Math.cos(a) * 0.9, z + (z > 0 ? -1 : 1) * (PITCH / 2) + Math.sin(a) * 0.9];
  }
  function chillSpot(seed) { // somewhere in town for Blockies off the site crew, or waiting for more Blockies
    const built = [...lots.entries()].filter(([, v]) => v.kind === 'built' || v.kind === 'reserve');
    if (!built.length) return home(seed);
    const [key] = built[Math.floor(hash(seed, 7) * built.length)];
    const [i, j] = key.split(',').map(Number);
    return [i * PITCH + (hash(seed, 8) - 0.5) * 4, j * PITCH + 3.5];
  }
  // A City Council member's office (CONFIG.offices home: landmark ids or building types): a spot on the
  // sidewalk in front of one that stands, and its name. null while none is built.
  function officeSpot(types, seed) {
    const here = built.filter((b) => types.includes(b.type));
    if (!here.length) return null;
    const b = here[Math.floor(hash(seed, 9) * here.length)];
    const name = LANDMARKS.find((l) => l.id === b.type)?.label || CATALOG[b.type]?.label || 'the office';
    return [b.x + (hash(seed, 10) - 0.5) * 4, b.z + 3.5, name];
  }
  function riverPath() {
    const pts = [];
    for (let j = -land; j <= land; j++) {
      const row = [];
      for (let i = -land; i <= land; i++) if (isWater(i, j)) row.push([i * PITCH, j * PITCH]);
      if (j % 2) row.reverse();
      pts.push(...row);
    }
    return pts;
  }

  return {
    root, env, graph, sync, update, depotSpot, siteSpot, chillSpot, officeSpot, riverPath, billboards,
    setWaiting(set) { waiting = set; }, // src/chips.js: the next sync shows them dark
    solids: lotsGroup, // buildings, sites, trees: what a film camera must not go through
    feePulse: () => (pulse = 1),
    get land() { return land; },
    get counts() { return counts; },
    get built() { return built; },
    get siteVersion() { return siteVersion; },
    // A site has room for a crew of about 12 (20 along the border or the metro): the share of the drawn
    // builders on it at any time. The others walk around town and take turns (see BuilderView).
    get crewShare() {
      const room = (snapshot.sites || []).reduce((n, { p }) => n + (p.kind === 'expand' || p.kind === 'metro' ? 20 : 12), 0);
      return Math.min(1, room / Math.max(1, drawn));
    },
    set drawn(n) { drawn = n; },
    helipad: [1.8, 1.8],
  };
}
