import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { hash, PITCH, isWater } from './sim.js';
import { now } from './time.js';

// ---------- materials & merged-box kits ----------

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const BODY_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
export const GLOW_MAT = new THREE.MeshLambertMaterial({ color: 0xa8d8ff, emissive: 0xffd27a, emissiveIntensity: 0.2 });
const BLUE_GLOW = new THREE.MeshLambertMaterial({ color: 0x3d8bff, emissive: 0x0052ff, emissiveIntensity: 0.8 });
const GREEN_GLOW = new THREE.MeshLambertMaterial({ color: 0x8be04e, emissive: 0x4caf00, emissiveIntensity: 0.6 });
const WATER_MAT = new THREE.MeshLambertMaterial({ color: 0x3fa9e8, transparent: true, opacity: 0.88 });
const FLAME_MAT = new THREE.MeshLambertMaterial({ color: 0xffb300, emissive: 0xff8c00, emissiveIntensity: 0.9 });

const C = {
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
  boxR(w, h, d, color, x, y, z, ry) {
    const g = UNIT.clone(); g.scale(w, h, d); g.rotateY(ry); g.translate(x, y + h / 2, z);
    this.lists.body.push(colored(g, color));
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
const kitFor = (fn) => { const k = new Kit(); fn(k); return k.build(); };

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
  beacon(k) {
    k.box(3, 1, 3, C.stone, 0, 0, 0);
    k.box(1.6, 18, 1.6, 0xe9eef5, 0, 1, 0);
    for (let y = 2; y < 18; y += 3) k.box(1.7, 0.4, 1.7, C.base, 0, y, 0);
    k.blue(2.4, 2.4, 2.4, 0, 19, 0);
  },
};

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

// A finished building or landmark as a standalone group (also used by gallery.html).
export const buildingGroup = (p) => kitFor((k) => (p.kind === 'landmark' ? LANDMARK[p.type](k) : DESIGN[p.type](k, p)));

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

  const groundGroup = new THREE.Group();
  const roadGroup = new THREE.Group();
  const lotsGroup = new THREE.Group();
  root.add(groundGroup, roadGroup, lotsGroup);

  let land = 0;
  const lots = new Map(); // key -> { kind, k, group }
  let site = null;
  let siteVersion = 0;
  const rising = []; // groups animating out of the ground
  const animated = []; // objects with userData.animate(t, dt): rides, turbines
  let developed = new Set();
  let roadSig = '';
  let snapshot = { land: 0, next: null, placed: 0 };
  const graph = { nodes: new Map(), adj: new Map(), version: 0 };

  function setLot(key, lot, kind, k, group, animate) {
    const old = lots.get(key);
    if (old) {
      lotsGroup.remove(old.group);
      old.group.traverse((o) => { const i = animated.indexOf(o); if (i >= 0) animated.splice(i, 1); });
    }
    const [x, z] = lotPos(lot);
    group.position.set(x, 0, z);
    group.traverse((o) => { if (o.userData.animate) animated.push(o); });
    lotsGroup.add(group);
    lots.set(key, { kind, k, group });
    if (animate) { group.scale.set(1, 0.01, 1); rising.push({ group, t: 0, mode: 'grow' }); }
  }

  function bridge(k, x, z, along) {
    const long = PITCH + 0.4;
    k.box(along === 'x' ? long : 2, 0.25, along === 'x' ? 2 : long, C.wood, x, -0.1, z);
    for (const o of [-0.95, 0.95]) {
      if (along === 'x') k.box(long, 0.08, 0.08, 0x6e4b2a, x, 0.45, z + o); else k.box(0.08, 0.08, long, 0x6e4b2a, x + o, 0.45, z);
      for (let s = -long / 2; s <= long / 2; s += 1.4) {
        if (along === 'x') k.box(0.1, 0.45, 0.1, 0x6e4b2a, x + s, 0.1, z + o); else k.box(0.1, 0.45, 0.1, 0x6e4b2a, x + o, 0.1, z + s);
      }
    }
  }

  // ----- square land slab with a river, banks, bridges and waterfalls -----
  function buildLand(L, animateRing) {
    groundGroup.clear();
    const H = L * PITCH + 4;
    const k = new Kit();
    for (let i = -L; i <= L; i++) for (let j = -L; j <= L; j++) {
      const x = i * PITCH, z = j * PITCH;
      if (!isWater(i, j)) { k.box(PITCH, 0.3, PITCH, (i + j) % 2 ? C.grass : C.grass2, x, -0.3, z); continue; }
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
      // waterfall down the side where the river leaves the land
      if (Math.abs(j) === L && wet(0, Math.sign(j))) k.water(6, 4.6, 0.3, x, -4.9, Math.sign(j) * (H + 0.15));
      if (Math.abs(i) === L && wet(Math.sign(i), 0)) k.water(0.3, 4.6, 6, Math.sign(i) * (H + 0.15), -4.9, z);
    }
    for (let i = -L; i <= L; i++) for (let j = -L; j < L; j++) if (isWater(i, j) && isWater(i, j + 1)) bridge(k, i * PITCH, j * PITCH + 4, 'x');
    for (let i = -L; i < L; i++) for (let j = -L; j <= L; j++) if (isWater(i, j) && isWater(i + 1, j)) bridge(k, i * PITCH + 4, j * PITCH, 'z');
    k.box(2 * H, 0.12, 2 * H, C.base, 0, -0.55, 0);
    k.box(2 * H, 2.6, 2 * H, C.dirt, 0, -3.15, 0);
    k.box(2 * H, 1.6, 2 * H, 0x8a8f98, 0, -4.75, 0);
    groundGroup.add(k.build());
    Object.assign(sun.shadow.camera, { left: -H - 6, right: H + 6, top: H + 6, bottom: -H - 6, near: 1, far: 300 });
    sun.shadow.camera.updateProjectionMatrix();

    for (let i = -L; i <= L; i++) for (let j = -L; j <= L; j++) {
      const key = `${i},${j}`;
      if (lots.has(key) || isWater(i, j)) continue;
      setLot(key, [i, j], 'wild', -1, kitFor((kk) => wildLot(kk, i, j)));
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
    const sig = segs.map((s) => s.join(':')).sort().join('|');
    if (sig === roadSig) return;
    roadSig = sig;

    roadGroup.clear();
    graph.nodes.clear(); graph.adj.clear(); graph.version++;
    const k = new Kit();
    const node = (i, j) => {
      const key = `${i},${j}`;
      if (!graph.nodes.has(key)) { graph.nodes.set(key, [i * PITCH + 4, j * PITCH + 4]); graph.adj.set(key, []); }
      return key;
    };
    const link = (a, b) => { graph.adj.get(a).push(b); graph.adj.get(b).push(a); };
    for (const [i, j, dir, onBridge] of segs) {
      const y = onBridge ? 0.15 : 0;
      if (dir === 'h') {
        const x = i * PITCH, z = j * PITCH + 4;
        k.box(PITCH - 2, 0.05, 2, C.road, x, y, z);
        for (let s = -2; s <= 2; s += 2) k.box(0.9, 0.02, 0.12, 0xf4f4f0, x + s, y + 0.05, z);
        link(node(i - 1, j), node(i, j));
      } else {
        const x = i * PITCH + 4, z = j * PITCH;
        k.box(2, 0.05, PITCH - 2, C.road, x, y, z);
        for (let s = -2; s <= 2; s += 2) k.box(0.12, 0.02, 0.9, 0xf4f4f0, x, y + 0.05, z + s);
        link(node(i, j - 1), node(i, j));
      }
    }
    for (const [key, [x, z]] of graph.nodes) {
      k.box(2, 0.05, 2, C.road, x, 0, z);
      const [i, j] = key.split(',').map(Number);
      if ((i + j) % 2 === 0) { k.box(0.12, 2, 0.12, C.dark, x + 1.15, 0, z + 1.15); k.win(0.35, 0.25, 0.35, x + 1.15, 2, z + 1.15); }
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
      s.ch = Math.max(7, p.h + 4);
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
    if (p.kind === 'expand') {
      if (site) { if (lots.get(lotKey(site.p.lot))?.kind === 'site') setLot(lotKey(site.p.lot), site.p.lot, 'wild', -1, kitFor((kk) => wildLot(kk, ...site.p.lot))); site = null; }
      return;
    }
    if (!site || site.k !== p.k) {
      site = makeSite(p);
      siteVersion++;
      setLot(lotKey(p.lot), p.lot, 'site', p.k, site.group);
    }
    const frac = Math.min(1, placed / p.cost);
    const fw = Math.min(6, p.w), fd = Math.min(6, p.d), area = fw * fd;
    const levels = Math.max(1, p.h);
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
  function sync(sim, animate) {
    if (sim.land !== land) buildLand(sim.land, animate && land > 0);
    const dev = new Set();
    for (const p of sim.done) {
      if (!p.lot) continue;
      const key = lotKey(p.lot);
      dev.add(key);
      const cur = lots.get(key);
      if (cur?.kind === 'built' && cur.k === p.k) continue;
      if (site && site.k === p.k) site = null;
      setLot(key, p.lot, 'built', p.k, buildingGroup(p), animate);
    }
    if (sim.next.lot) dev.add(lotKey(sim.next.lot));
    developed = dev;
    updateSite(sim.next, sim.placed);
    buildRoads();
    snapshot = { land: sim.land, next: sim.next, placed: sim.placed };
  }

  // ----- day / night, same phase for every visitor -----
  const env = { daylight: 1, phase: 0 };
  const sky = { dayTop: new THREE.Color('#5fb8ff'), dayBot: new THREE.Color('#d6efff'), nightTop: new THREE.Color('#0a1230'), nightBot: new THREE.Color('#2b3a6b') };
  let skyAcc = 1, pulse = 0;

  function update(t, dt) {
    const phase = (now() / (CONFIG.dayLengthMin * 60000)) % 1;
    const s = Math.sin(phase * Math.PI * 2);
    const dl = THREE.MathUtils.smoothstep(s, -0.25, 0.3);
    env.daylight = dl; env.phase = phase;
    const H = land * PITCH + 4;
    sun.position.set(Math.cos(phase * Math.PI * 2) * H * 1.5, 25 + Math.max(0, s) * 20, H * 0.6);
    sun.intensity = 0.25 + 2.4 * dl;
    sun.color.setHSL(0.1, 0.6 - 0.3 * dl, 0.75 + 0.2 * dl);
    hemi.intensity = 0.55 + 1.3 * dl;
    hemi.color.setHSL(0.58, 0.6, 0.45 + 0.45 * dl);
    GLOW_MAT.emissiveIntensity = 0.15 + 1.1 * (1 - dl);
    GREEN_GLOW.emissiveIntensity = 0.4 + 0.8 * (1 - dl);
    pulse = Math.max(0, pulse - dt * 1.5);
    BLUE_GLOW.emissiveIntensity = 0.8 + pulse * 1.5;
    skyAcc += dt;
    if (skyAcc > 0.5) {
      skyAcc = 0;
      const top = sky.nightTop.clone().lerp(sky.dayTop, dl), bot = sky.nightBot.clone().lerp(sky.dayBot, dl);
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

    if (site?.jib) {
      site.jib.rotation.y = 0.8 + Math.sin(t * 0.4) * 0.5;
      const reach = 4.2 + Math.sin(t * 0.7) * 0.8;
      const drop = Math.max(1, site.ch - site.topY + 0.5);
      site.hook.position.set(0, -drop, reach);
      site.cable.scale.set(0.04, drop, 0.04);
      site.cable.position.set(0, -drop / 2, reach);
    }
  }

  // ----- spots for Blockies to walk to -----
  const depotSpot = (seed) => {
    const a = hash(seed, 1) * Math.PI * 2;
    return [-1.9 + Math.cos(a) * 1.5, -1.9 + Math.sin(a) * 1.5];
  };
  function siteSpot(seed) {
    const p = snapshot.next;
    if (!p) return depotSpot(seed);
    if (p.kind === 'expand') { // reclaim land along the border
      const e = land * PITCH + 2.5, s = (hash(seed, 5) - 0.5) * 2 * e;
      return [[s, e], [s, -e], [e, s], [-e, s]][Math.floor(hash(seed, 6) * 4)];
    }
    const [x, z] = lotPos(p.lot);
    const side = Math.floor(hash(seed, 2) * 4), off = (hash(seed, 3) - 0.5) * 4.5, e = 3.5;
    return [[x + off, z + e], [x + off, z - e], [x + e, z + off], [x - e, z + off]][side];
  }
  function chillSpot(seed) { // somewhere pleasant while the crew waits for more Blockies
    const built = [...lots.entries()].filter(([, v]) => v.kind === 'built');
    if (!built.length) return depotSpot(seed);
    const [key] = built[Math.floor(hash(seed, 7) * built.length)];
    const [i, j] = key.split(',').map(Number);
    return [i * PITCH + (hash(seed, 8) - 0.5) * 4, j * PITCH + 3.5];
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
    root, env, graph, sync, update, depotSpot, siteSpot, chillSpot, riverPath,
    feePulse: () => (pulse = 1),
    get land() { return land; },
    get siteVersion() { return siteVersion; },
    helipad: [1.8, 1.8],
  };
}
