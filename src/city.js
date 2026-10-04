import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { hash, PITCH, cityAt, project } from './sim.js';
import { now } from './time.js';

// ---------- materials & merged-box kits ----------

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const BODY_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
export const GLOW_MAT = new THREE.MeshLambertMaterial({ color: 0xa8d8ff, emissive: 0xffd27a, emissiveIntensity: 0.2 });
const BLUE_GLOW = new THREE.MeshLambertMaterial({ color: 0x3d8bff, emissive: 0x0052ff, emissiveIntensity: 0.8 });

const C = {
  walk: 0xd5d8dc, grass: 0x6cc24a, grass2: 0x5fb03f, road: 0x3b4048, trunk: 0x7a5230,
  leaf: [0x3f9b3a, 0x4caf50, 0x2e8b3a], dark: 0x2b2f36, white: 0xf4f4f0, base: 0x0052ff,
  roof: [0xc0392b, 0x2e86de, 0x16a085, 0x8e44ad, 0xd35400], stone: 0xb9bec5, gold: 0xf4c542,
};

function colored(geo, color) {
  const c = new THREE.Color(color);
  const arr = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Collects boxes (bottom at y) and merges them into one body mesh + one glowing mesh.
class Kit {
  constructor() { this.body = []; this.glow = []; this.blue = []; }
  box(w, h, d, color, x = 0, y = 0, z = 0) {
    const g = UNIT.clone(); g.scale(w, h, d); g.translate(x, y + h / 2, z);
    this.body.push(colored(g, color));
  }
  win(w, h, d, x, y, z) { const g = UNIT.clone(); g.scale(w, h, d); g.translate(x, y + h / 2, z); this.glow.push(g); }
  beacon(w, h, d, x, y, z) { const g = UNIT.clone(); g.scale(w, h, d); g.translate(x, y + h / 2, z); this.blue.push(g); }
  build() {
    const g = new THREE.Group();
    for (const [list, mat] of [[this.body, BODY_MAT], [this.glow, GLOW_MAT], [this.blue, BLUE_GLOW]]) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      list.forEach((x) => x.dispose());
    }
    return g;
  }
}

const Y = 0.15; // sidewalk height

function sidewalk(k, color = C.walk) { k.box(6.4, Y, 6.4, color); }

function windows(k, w, d, y0, floors) {
  const row = (len, place) => {
    const n = Math.max(1, Math.floor((len * 0.85) / 0.9));
    const step = (len * 0.85) / n;
    for (let i = 0; i < n; i++) place(-len * 0.425 + step * (i + 0.5));
  };
  for (let f = 0; f < floors; f++) {
    const y = y0 + f + 0.3;
    row(w, (x) => { k.win(0.55, 0.45, 0.06, x, y, d / 2 + 0.03); k.win(0.55, 0.45, 0.06, x, y, -d / 2 - 0.03); });
    row(d, (z) => { k.win(0.06, 0.45, 0.55, w / 2 + 0.03, y, z); k.win(0.06, 0.45, 0.55, -w / 2 - 0.03, y, z); });
  }
}

function tree(k, x, z, seed) {
  const h = 1 + hash(seed, 1) * 0.8;
  k.box(0.3, h, 0.3, C.trunk, x, Y, z);
  const leaf = C.leaf[Math.floor(hash(seed, 2) * 3)];
  k.box(1.3, 0.9, 1.3, leaf, x, Y + h - 0.1, z);
  k.box(0.8, 0.5, 0.8, leaf, x, Y + h + 0.8, z);
}

// ---------- building designs (local coords, lot centre = origin) ----------

const DESIGN = {
  loft(k, p) {
    const roof = C.roof[p.k % C.roof.length];
    k.box(p.w, p.h, p.d, p.color, 0, Y, 0);
    windows(k, p.w, p.d, Y, p.h);
    k.box(0.8, 1.2, 0.08, C.dark, 0, Y, p.d / 2 + 0.05);
    k.box(p.w + 0.3, 0.25, p.d + 0.3, roof, 0, Y + p.h, 0);
    k.box(p.w - 1, 0.5, p.d - 1, roof, 0, Y + p.h + 0.25, 0);
    k.box(0.4, 0.8, 0.4, C.stone, p.w / 4, Y + p.h + 0.25, -p.d / 4);
  },
  cafe(k, p) {
    k.box(p.w, p.h, p.d, p.color, 0, Y, 0);
    k.win(p.w * 0.7, 1.1, 0.06, 0, Y + 0.3, p.d / 2 + 0.03);
    windows(k, p.w, p.d, Y + 1, p.h - 1);
    const n = Math.round(p.w / 0.5);
    for (let i = 0; i < n; i++) k.box(0.5, 0.12, 0.8, i % 2 ? C.white : 0x8b4513, -p.w / 2 + 0.25 + i * 0.5, Y + 1.6, p.d / 2 + 0.4);
    k.box(2.2, 0.6, 0.15, C.base, 0, Y + p.h, p.d / 2 - 0.2);
    for (const x of [-1.2, 1.2]) { k.box(0.5, 0.45, 0.5, C.white, x, Y, p.d / 2 + 0.75); }
    k.box(p.w + 0.2, 0.2, p.d + 0.2, 0x8b4513, 0, Y + p.h, 0);
  },
  office(k, p) {
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
    k.box(p.w, p.h, p.d, p.color, 0, Y, 0);
    windows(k, p.w, p.d, Y, p.h);
    k.box(p.w + 0.2, 0.25, p.d + 0.2, 0x111827, 0, Y + p.h, 0);
    k.beacon(1.6, 0.25, 1.6, 0, Y + p.h + 0.25, 0);
    for (let i = 0; i < 3; i++) k.box(0.9, 0.12, 1.4, 0x1f3b73, -p.w / 2 + 1 + i * 1.1, Y + p.h + 0.25, -p.d / 2 + 1.1);
    k.box(1.2, 1.4, 0.08, 0x0b1220, 0, Y, p.d / 2 + 0.05);
  },
  tower(k, p) {
    const h1 = Math.ceil(p.h * 0.62);
    k.box(p.w, h1, p.d, p.color, 0, Y, 0);
    windows(k, p.w, p.d, Y, h1);
    k.box(p.w - 1, p.h - h1, p.d - 1, p.color, 0, Y + h1, 0);
    windows(k, p.w - 1, p.d - 1, Y + h1, p.h - h1);
    k.box(p.w - 1.6, 0.6, p.d - 1.6, C.base, 0, Y + p.h, 0);
    k.box(0.15, 2.4, 0.15, C.dark, 0, Y + p.h + 0.6, 0);
    k.win(0.3, 0.3, 0.3, 0, Y + p.h + 3, 0);
  },
  park(k) {
    k.box(6.2, 0.2, 6.2, C.grass, 0, 0, 0);
    k.box(6.2, 0.22, 1, 0xe0cb98, 0, 0, 0);
    k.box(1, 0.22, 6.2, 0xe0cb98, 0, 0, 0);
    k.box(1.8, 0.4, 1.8, C.stone, 0, 0.2, 0);
    k.box(1.2, 0.42, 1.2, 0x5dade2, 0, 0.2, 0);
    for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) tree(k, x, z, x * 7 + z);
    k.box(1.2, 0.3, 0.4, 0x8b4513, -2, 0.2, 0.9);
  },
  nodes(k, p) {
    k.box(p.w, p.h, p.d, p.color, 0, Y, 0);
    for (let i = 0; i < Math.floor(p.d / 1.2); i++) {
      const z = -p.d / 2 + 0.8 + i * 1.2;
      k.box(p.w - 1, 0.7, 0.5, C.dark, 0, Y + p.h, z);
      for (let j = 0; j < 4; j++) k.win(0.12, 0.12, 0.06, -p.w / 2 + 1 + j * ((p.w - 2) / 3), Y + p.h + 0.35, z + 0.27);
    }
    k.box(1.2, 1.4, 0.08, C.dark, 0, Y, p.d / 2 + 0.05);
  },
};

const LANDMARK = {
  garage(k) {
    k.box(5, 2.6, 4, 0xb5523b, 0, Y, -0.5);
    for (let i = 0; i < 5; i++) k.box(3, 0.32, 0.06, i % 2 ? 0x9aa3ad : 0xb8c0c8, 0, Y + 0.1 + i * 0.4, 1.53);
    k.box(5.4, 0.3, 4.4, 0x6e2f22, 0, Y + 2.6, -0.5);
    k.box(2.6, 0.6, 0.15, C.base, 0, Y + 2.9, 1.3);
    k.box(1.4, 0.8, 0.6, 0x8b5a2b, 2.2, Y, 2.2);
    k.box(0.4, 0.4, 0.4, C.gold, 2.0, Y + 0.8, 2.2);
    k.box(0.4, 0.4, 0.4, C.base, 2.45, Y + 0.8, 2.2);
  },
  cafe(k) {
    DESIGN.cafe(k, { w: 5, d: 4, h: 3, color: 0xfff1e0 });
    for (const [x, z] of [[-2.2, 2.6], [2.2, 2.6]]) { k.box(0.1, 1.6, 0.1, C.dark, x, Y, z); k.box(1.2, 0.1, 1.2, 0xe74c3c, x, Y + 1.6, z); }
  },
  hq(k) {
    k.box(6, 3, 6, 0xe9eef5, 0, Y, 0);
    windows(k, 6, 6, Y, 3);
    k.box(4, 8, 4, 0xdfe6ee, 0, Y + 3, 0);
    windows(k, 4, 4, Y + 3, 8);
    k.box(4.4, 0.5, 4.4, C.base, 0, Y + 11, 0);
    k.beacon(2, 2, 2, 0, Y + 11.5, 0);
    k.box(0.1, 3, 0.1, C.dark, 2.6, Y + 3, 2.6);
    k.box(1.2, 0.7, 0.06, C.base, 3.2, Y + 5.2, 2.6);
  },
  hackathon(k) {
    k.box(6, 3, 5, 0xf0e6d6, 0, Y, 0);
    k.box(6.2, 0.6, 5.2, 0xe67e22, 0, Y + 3, 0);
    k.box(4.6, 0.6, 4.2, 0xe67e22, 0, Y + 3.6, 0);
    k.box(3, 0.5, 3, 0xe67e22, 0, Y + 4.2, 0);
    k.win(3.6, 1.6, 0.08, 0, Y + 0.8, 2.54);
    windows(k, 6, 5, Y, 1);
  },
  studio(k) {
    const cols = [0xe84393, 0xf5c518, 0x2e86de, 0x2ecc71, 0xe67e22];
    [[0, 0, 0, 3.4, 2, 3.4], [0.8, 2, -0.6, 2.6, 2, 2.4], [-0.9, 2, 0.8, 1.8, 1.6, 1.8], [0.2, 4, 0, 1.6, 1.6, 1.6], [-1.6, 0, -1.6, 1.4, 1.4, 1.4]]
      .forEach(([x, y, z, w, h, d], i) => k.box(w, h, d, cols[i], x, Y + y, z));
    k.win(1.6, 1, 0.06, 0, Y + 0.4, 1.73);
  },
  datalab(k) {
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
    k.box(6, 0.4, 6, 0x6b7785, 0, Y, 0);
    for (let y = 0; y < 14; y++) {
      for (const [x, z] of [[-2.2, -0.6], [-1.2, -0.6], [-2.2, 0.4], [-1.2, 0.4]]) k.box(0.12, 1, 0.12, 0xe74c3c, x, Y + 0.4 + y, z);
      k.box(1.1, 0.08, 0.08, 0xe74c3c, -1.7, Y + 0.4 + y, -0.6);
    }
    k.box(1.6, 9, 1.6, C.white, 1, Y + 0.4, 0);
    k.box(1.7, 1.5, 1.7, C.base, 1, Y + 6, 0);
    k.box(1.2, 1.2, 1.2, C.white, 1, Y + 9.4, 0);
    k.box(0.6, 1, 0.6, C.base, 1, Y + 10.6, 0);
    for (const [x, z] of [[1.9, 0], [0.1, 0], [1, 0.9], [1, -0.9]]) k.box(0.4, 1.4, 0.4, C.base, x, Y + 0.4, z);
    k.win(0.3, 0.3, 0.3, -1.7, Y + 14.5, -0.1);
  },
  stadium(k) {
    k.box(6.2, 0.3, 6.2, 0x9aa3ad, 0, Y, 0);
    for (let i = 0; i < 3; i++) {
      const s = 6.2 - i * 0.7;
      k.box(s, 0.6, 0.6, i % 2 ? C.base : C.white, 0, Y + 0.3 + i * 0.6, -s / 2 + 0.3);
      k.box(s, 0.6, 0.6, i % 2 ? C.base : C.white, 0, Y + 0.3 + i * 0.6, s / 2 - 0.3);
      k.box(0.6, 0.6, s, i % 2 ? C.base : C.white, -s / 2 + 0.3, Y + 0.3 + i * 0.6, 0);
      k.box(0.6, 0.6, s, i % 2 ? C.base : C.white, s / 2 - 0.3, Y + 0.3 + i * 0.6, 0);
    }
    k.box(3.4, 0.1, 3.4, 0x3fa34d, 0, Y + 0.3, 0);
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { k.box(0.15, 4, 0.15, C.dark, x, Y, z); k.win(0.6, 0.3, 0.6, x, Y + 4, z); }
  },
  beacon(k) {
    k.box(3, 1, 3, C.stone, 0, Y, 0);
    k.box(1.6, 18, 1.6, 0xe9eef5, 0, Y + 1, 0);
    for (let y = 2; y < 18; y += 3) k.box(1.7, 0.4, 1.7, C.base, 0, Y + y, 0);
    k.beacon(2.4, 2.4, 2.4, 0, Y + 19, 0);
  },
};

// Plaza in the centre lot: treasury crystal, block depot, helipad for new builders.
function plaza(k) {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) k.box(1.6, Y, 1.6, (i + j) % 2 ? 0xe2dccd : 0xd2cab6, -2.4 + i * 1.6, 0, -2.4 + j * 1.6);
  k.box(2, 0.3, 2, C.stone, 0, Y, 0);
  k.box(1.2, 0.8, 1.2, C.white, 0, Y + 0.3, 0);
  // helipad
  k.box(2.4, 0.06, 2.4, C.dark, 1.8, Y, 1.8);
  k.box(0.2, 0.07, 1.2, C.white, 1.45, Y, 1.8); k.box(0.2, 0.07, 1.2, C.white, 2.15, Y, 1.8); k.box(0.7, 0.07, 0.2, C.white, 1.8, Y, 1.8);
  // block depot
  const cols = [C.base, C.gold, 0xe74c3c, 0x2ecc71, C.white, 0x9b59b6];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const n = 1 + Math.floor(hash(i, j, 5) * 3);
    for (let h = 0; h < n; h++) k.box(0.5, 0.5, 0.5, cols[Math.floor(hash(i, j, h) * cols.length)], -2.4 + i * 0.55, Y + h * 0.5, -2.4 + j * 0.55);
  }
  k.box(0.1, 3.2, 0.1, C.dark, -2.6, Y, 2.6);
  k.box(1.1, 0.7, 0.06, C.base, -2.0, Y + 2.4, 2.6);
}

function emptyLot(k, i, j) {
  k.box(6.4, 0.12, 6.4, (i + j) % 2 ? C.grass : C.grass2);
  const n = Math.floor(hash(i, j, 61) * 3);
  for (let t = 0; t < n; t++) tree(k, -2 + hash(i, j, t, 62) * 4, -2 + hash(i, j, t, 63) * 4, i * 31 + j * 7 + t);
}

function reservedLot(k, l) {
  k.box(6.4, 0.12, 6.4, C.grass2);
  for (let s = -3; s <= 3; s += 1.5) {
    k.box(0.12, 0.6, 0.12, C.white, s, 0.12, -3); k.box(0.12, 0.6, 0.12, C.white, s, 0.12, 3);
    k.box(0.12, 0.6, 0.12, C.white, -3, 0.12, s); k.box(0.12, 0.6, 0.12, C.white, 3, 0.12, s);
  }
  k.box(0.15, 1.4, 0.15, C.dark, 0, 0.12, 2.2);
  k.box(1.8, 0.9, 0.1, C.base, 0, 1.3, 2.2);
}

// ---------- city ----------

const lotPos = ([i, j]) => [i * PITCH, j * PITCH];
const ring = ([i, j]) => Math.max(Math.abs(i), Math.abs(j));

export function createCity(scene) {
  const root = new THREE.Group();
  scene.add(root);

  // lights + day/night
  const hemi = new THREE.HemisphereLight(0xdff1ff, 0x7a6a55, 1.8);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  scene.add(hemi, sun, sun.target);

  const lotsGroup = new THREE.Group();
  root.add(lotsGroup);
  const lotMeshes = new Map(); // "i,j" -> { state, group }
  const landmarkState = new Map(CONFIG.landmarks.map((l) => [l.id, false]));
  let groundGroup = null;
  let extent = 0;
  let state = cityAt(0);
  let site = null; // { k, group, floorsMesh, partial, crane, floors }
  let siteVersion = 0;
  const growing = [];

  const crystal = new THREE.Mesh(UNIT, BLUE_GLOW.clone());
  crystal.scale.setScalar(0.9);
  crystal.rotation.set(Math.PI / 4, 0, Math.PI / 4);
  crystal.position.set(0, Y + 1.8, 0);
  root.add(crystal);

  function setLot(key, lot, kind, group, animate) {
    const old = lotMeshes.get(key);
    if (old) lotsGroup.remove(old.group);
    const [x, z] = lotPos(lot);
    group.position.set(x, 0, z);
    lotsGroup.add(group);
    lotMeshes.set(key, { kind, group });
    if (animate) { group.scale.set(1, 0.01, 1); growing.push({ group, t: 0 }); }
  }

  function kitFor(fn) { const k = new Kit(); fn(k); return k.build(); }

  function buildGround(R) {
    if (groundGroup) root.remove(groundGroup);
    groundGroup = new THREE.Group();
    const H = R * PITCH + 5;
    const k = new Kit();
    k.box(2 * H, 0.3, 2 * H, C.road, 0, -0.3, 0);
    k.box(2 * H + 0.1, 0.12, 2 * H + 0.1, C.base, 0, -0.42, 0);
    k.box(2 * H, 0.6, 2 * H, 0xa7adb4, 0, -1.02, 0);
    k.box(2 * H - 0.4, 2.6, 2 * H - 0.4, 0x7a5230, 0, -3.62, 0);
    k.box(2 * H - 1.2, 1.2, 2 * H - 1.2, 0x8a8f98, 0, -4.82, 0);
    // lane dashes + street lamps
    for (let i = -R - 1; i <= R; i++) {
      const c = (i + 0.5) * PITCH;
      for (let s = -H + 1; s < H - 1; s += 2) {
        k.box(0.12, 0.02, 0.9, 0xf4f4f0, c, 0, s);
        k.box(0.9, 0.02, 0.12, 0xf4f4f0, s, 0, c);
      }
      for (let j = -R - 1; j <= R; j++) {
        const cz = (j + 0.5) * PITCH;
        if (Math.abs(c) > H - 1 || Math.abs(cz) > H - 1) continue;
        k.box(0.12, 2, 0.12, C.dark, c + 1.1, 0, cz + 1.1);
        k.win(0.35, 0.25, 0.35, c + 1.1, 2, cz + 1.1);
      }
    }
    groundGroup.add(k.build());
    root.add(groundGroup);
    // empty / reserved lots inside the new extent
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
      const key = `${i},${j}`;
      if (lotMeshes.has(key)) continue;
      const lm = CONFIG.landmarks.find((l) => l.lot[0] === i && l.lot[1] === j);
      if (i === 0 && j === 0) setLot(key, [0, 0], 'plaza', kitFor(plaza));
      else if (lm) setLot(key, [i, j], 'reserved', kitFor((kk) => reservedLot(kk, lm)));
      else setLot(key, [i, j], 'empty', kitFor((kk) => emptyLot(kk, i, j)));
    }
    Object.assign(sun.shadow.camera, { left: -H - 4, right: H + 4, top: H + 4, bottom: -H - 4, near: 1, far: 200 });
    sun.shadow.camera.updateProjectionMatrix();
  }

  function ensureExtent(R) {
    if (R <= extent) return false;
    extent = R;
    buildGround(R);
    return true;
  }

  function finishedBuilding(p) {
    return kitFor((k) => { if (p.type !== 'park') sidewalk(k); DESIGN[p.type](k, p); });
  }

  // ----- construction site -----
  function makeSite(p) {
    const g = new THREE.Group();
    const k = new Kit();
    sidewalk(k, 0xc9b99a);
    for (let s = -3; s <= 3; s += 0.75) {
      const c = Math.round(s / 0.75) % 2 ? 0xf39c12 : C.white;
      k.box(0.7, 0.35, 0.1, c, s, Y, -3.1); k.box(0.1, 0.35, 0.7, c, -3.1, Y, s); k.box(0.1, 0.35, 0.7, c, 3.1, Y, s);
      if (Math.abs(s) > 1) k.box(0.7, 0.35, 0.1, c, s, Y, 3.1);
    }
    for (let i = 0; i < 4; i++) k.box(0.45, 0.45, 0.45, p.color, 2.3 + (i % 2) * 0.5, Y + Math.floor(i / 2) * 0.45, 2.4);
    g.add(k.build());
    // crane
    const ch = Math.max(7, p.h + 4);
    const ck = new Kit();
    for (let y = 0; y < ch; y++) {
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) ck.box(0.1, 1, 0.1, C.gold, x, Y + y, z);
      ck.box(0.7, 0.07, 0.07, C.gold, 0, Y + y, -0.3);
    }
    const mast = ck.build();
    mast.position.set(-3.6, 0, -3.6);
    g.add(mast);
    const jib = new THREE.Group();
    jib.position.set(-3.6, Y + ch, -3.6);
    const jk = new Kit();
    jk.box(0.4, 0.4, 6, C.gold, 0, 0, 2.2);
    jk.box(0.7, 0.6, 1, C.dark, 0, 0, -1.2);
    jk.box(0.6, 0.6, 0.6, C.dark, 0, 0.4, 0);
    jib.add(jk.build());
    const hook = new THREE.Mesh(UNIT, BODY_MAT.clone());
    hook.material.vertexColors = false; hook.material.color.setHex(0xd35400);
    hook.scale.set(0.35, 0.35, 0.35);
    jib.add(hook);
    const cable = new THREE.Mesh(UNIT, new THREE.MeshBasicMaterial({ color: 0x222222 }));
    jib.add(cable);
    g.add(jib);
    const partial = new THREE.InstancedMesh(UNIT, new THREE.MeshLambertMaterial({ color: p.type === 'park' ? C.grass : p.color }), 36);
    partial.castShadow = partial.receiveShadow = true;
    partial.count = 0;
    g.add(partial);
    return { k: p.k, p, group: g, partial, jib, hook, cable, floors: -1, floorsMesh: null, ch };
  }

  function updateSite(placed) {
    const p = state.active;
    if (!site || site.k !== p.k) {
      if (site) lotsGroup.remove(site.group);
      site = makeSite(p);
      siteVersion++;
      setLot(p.lot.join(','), p.lot, 'site', site.group);
    }
    const isPark = p.type === 'park';
    const area = isPark ? 36 : p.w * p.d;
    const per = isPark ? p.cost : area;
    const floors = Math.min(p.h - 1, Math.floor(placed / per));
    const partialN = isPark ? Math.floor((placed / p.cost) * 36) : Math.floor(placed - floors * per);
    if (floors !== site.floors && !isPark) {
      site.floors = floors;
      if (site.floorsMesh) site.group.remove(site.floorsMesh);
      if (floors > 0) {
        site.floorsMesh = kitFor((k) => {
          k.box(p.w, floors, p.d, p.color, 0, Y, 0);
          for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.1, floors + 1, 0.1, 0x7f8c8d, x * (p.w / 2 + 0.25), Y, z * (p.d / 2 + 0.25));
        });
        site.group.add(site.floorsMesh);
      }
    }
    const m4 = new THREE.Matrix4();
    const w = isPark ? 6 : p.w, d = isPark ? 6 : p.d;
    site.partial.count = Math.min(area, partialN);
    for (let n = 0; n < site.partial.count; n++) {
      const x = -w / 2 + 0.5 + (n % w), z = -d / 2 + 0.5 + Math.floor(n / w);
      if (isPark) m4.compose(new THREE.Vector3(x, 0.1, z), new THREE.Quaternion(), new THREE.Vector3(0.98, 0.2, 0.98));
      else m4.makeTranslation(x, Y + Math.max(0, floors) + 0.5, z);
      site.partial.setMatrixAt(n, m4);
    }
    site.partial.instanceMatrix.needsUpdate = true;
    site.topY = Y + Math.max(0, floors) + 1;
  }

  // Apply total work; returns the projects completed since the last call.
  function setWork(work, animate) {
    const next = cityAt(work);
    const completed = [];
    for (let k = state.done; k < next.done; k++) {
      const p = project(k);
      completed.push(p);
      if (site && site.k === k) { lotsGroup.remove(site.group); site = null; }
      setLot(p.lot.join(','), p.lot, 'built', finishedBuilding(p), animate && k >= next.done - 3);
    }
    state = next;
    const grew = ensureExtent(Math.max(2, ring(next.active.lot) + 1, ...[...landmarkState].filter(([, on]) => on).map(([id]) => ring(CONFIG.landmarks.find((l) => l.id === id).lot))));
    updateSite(next.placed);
    return { completed, grew };
  }

  function setPopulation(n, animate) {
    const unlocked = [];
    for (const l of CONFIG.landmarks) {
      if (l.at > n || landmarkState.get(l.id)) continue;
      landmarkState.set(l.id, true);
      ensureExtent(Math.max(extent, ring(l.lot)));
      setLot(l.lot.join(','), l.lot, 'landmark', kitFor((k) => { sidewalk(k); LANDMARK[l.id](k); }), animate);
      unlocked.push(l);
    }
    return unlocked;
  }

  let pulse = 0;
  const env = { daylight: 1, phase: 0 };
  const sky = { dayTop: new THREE.Color('#5fb8ff'), dayBot: new THREE.Color('#d6efff'), nightTop: new THREE.Color('#0a1230'), nightBot: new THREE.Color('#2b3a6b') };
  let skyAcc = 1;

  function update(t, dt) {
    // day / night, same phase for every visitor
    const phase = (now() / (CONFIG.dayLengthMin * 60000)) % 1;
    const s = Math.sin(phase * Math.PI * 2);
    const dl = THREE.MathUtils.smoothstep(s, -0.25, 0.3);
    env.daylight = dl; env.phase = phase;
    const H = extent * PITCH + 5;
    sun.position.set(Math.cos(phase * Math.PI * 2) * H * 1.5, 25 + Math.max(0, s) * 20, H * 0.6);
    sun.intensity = 0.25 + 2.4 * dl;
    sun.color.setHSL(0.1, 0.6 - 0.3 * dl, 0.75 + 0.2 * dl);
    hemi.intensity = 0.55 + 1.3 * dl;
    hemi.color.setHSL(0.58, 0.6, 0.45 + 0.45 * dl);
    GLOW_MAT.emissiveIntensity = 0.15 + 1.1 * (1 - dl);
    skyAcc += dt;
    if (skyAcc > 0.5) {
      skyAcc = 0;
      const top = sky.nightTop.clone().lerp(sky.dayTop, dl), bot = sky.nightBot.clone().lerp(sky.dayBot, dl);
      document.documentElement.style.setProperty('--sky-top', `#${top.getHexString()}`);
      document.documentElement.style.setProperty('--sky-bottom', `#${bot.getHexString()}`);
    }

    pulse = Math.max(0, pulse - dt * 1.5);
    crystal.position.y = Y + 1.9 + Math.sin(t * 2) * 0.15;
    crystal.rotation.y = t * 0.8;
    crystal.scale.setScalar(0.9 + pulse * 0.5);

    for (let i = growing.length - 1; i >= 0; i--) {
      const gr = growing[i];
      gr.t = Math.min(1, gr.t + dt * 1.4);
      const k = gr.t, b = 1.7;
      gr.group.scale.y = Math.max(0.01, 1 + (b + 1) * Math.pow(k - 1, 3) + b * Math.pow(k - 1, 2));
      if (gr.t >= 1) growing.splice(i, 1);
    }

    if (site) {
      const [sx, sz] = lotPos(site.p.lot);
      const ang = Math.sin(t * 0.4) * 0.5 + Math.atan2(sx - (sx - 3.6), sz - (sz - 3.6));
      site.jib.rotation.y = ang;
      const reach = 4.2 + Math.sin(t * 0.7) * 0.8;
      const drop = Math.max(1, site.ch - (site.topY ?? 1) + 0.5 + Math.sin(t * 1.3) * 0.5);
      site.hook.position.set(0, -drop, reach);
      site.cable.scale.set(0.04, drop, 0.04);
      site.cable.position.set(0, -drop / 2, reach);
    }
  }

  // ----- spots for builders to walk to -----
  const depotSpot = (seed) => {
    const a = hash(seed, 1) * Math.PI * 2;
    return [-1.9 + Math.cos(a) * 1.5, -1.9 + Math.sin(a) * 1.5];
  };
  function siteSpot(seed) {
    const p = state.active;
    const [x, z] = lotPos(p.lot);
    const side = Math.floor(hash(seed, 2) * 4), off = (hash(seed, 3) - 0.5) * 4.5;
    const e = 3.5;
    return [[x + off, z + e], [x + off, z - e], [x + e, z + off], [x - e, z + off]][side];
  }
  function landmarkSpot(id, seed) {
    const l = CONFIG.landmarks.find((x) => x.id === id);
    if (!l || !landmarkState.get(id)) return null;
    const [x, z] = lotPos(l.lot);
    return [x + (hash(seed, 4) - 0.5) * 3, z + 3.4];
  }

  return {
    root,
    env,
    setWork,
    setPopulation,
    update,
    depotSpot,
    siteSpot,
    landmarkSpot,
    feePulse: () => (pulse = 1),
    get extent() { return extent; },
    get siteVersion() { return siteVersion; },
    get state() { return state; },
    helipad: [1.8, 1.8],
  };
}
