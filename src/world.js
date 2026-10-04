import * as THREE from 'three';
import { hash } from './sim.js';

// ---------- voxel helpers ----------

const GEO = new THREE.BoxGeometry(1, 1, 1);
const MATS = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${opts.emissive ?? ''}|${opts.opacity ?? 1}`;
  if (!MATS.has(key)) {
    MATS.set(key, new THREE.MeshLambertMaterial({
      color,
      emissive: opts.emissive ?? 0x000000,
      transparent: (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    }));
  }
  return MATS.get(key);
}

// Add a box whose *bottom* sits at y. Returns the mesh.
export function B(parent, w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(GEO, mat(color, opts));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const C = {
  grass: [0x6cc24a, 0x63b843, 0x74c950, 0x5fb03f],
  path: [0xd9c38f, 0xcfb883, 0xe0cb98],
  dirt: [0x8b5a2b, 0x7f522a, 0x946233],
  stone: [0x8a8f98, 0x7d828b, 0x959aa3],
  plank: 0xc8a26b, plankDark: 0x9c7643, log: 0x7a5230,
  leaf: [0x3f9b3a, 0x4caf50, 0x2e8b3a],
  roof: [0xc0392b, 0x2e86de, 0x8e44ad, 0x16a085, 0xd35400],
  white: 0xf4f4f0, dark: 0x2b2f36, base: 0x0052ff, gold: 0xf4c542,
};
const pick = (arr, ...seed) => arr[Math.floor(hash(...seed) * arr.length)];

// ---------- layout ----------

// Buildings face the island centre (local +z = door side).
export const SITES = {
  core: { x: 0, z: 0, r: 2 },
  dock: { x: 11.5, z: 0, r: 1 },
  hut: { x: -3.5, z: 4, r: 2 },
  farm: { x: -7, z: -2.5, r: 3 },
  mine: { x: -8.5, z: 5, r: 2.6 },
  market: { x: 4.5, z: -4.5, r: 2.6 },
  sawmill: { x: 3.5, z: 7, r: 2.4 },
  houses: { x: -2, z: -8, r: 3.2 },
  crane: { x: 9, z: -6, r: 2 },
  tower: { x: 8, z: 4, r: 1.8 },
  lighthouse: { x: -12, z: 0, r: 1.5 },
  castle: { x: -8, z: -9.5, r: 3 },
};
for (const s of Object.values(SITES)) {
  const len = Math.hypot(s.x, s.z) || 1;
  s.rot = Math.atan2(-s.x, -s.z);
  const off = s.r + 1.2;
  s.front = len > 1 ? [s.x - (s.x / len) * off, s.z - (s.z / len) * off] : [0, 2.6];
}
SITES.dock.front = [9.5, 0];

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

const R = 13.5;
function radiusAt(a) {
  return R * (0.88 + 0.07 * Math.sin(3 * a + 1.3) + 0.05 * Math.sin(5 * a + 4.1) + 0.04 * Math.sin(8 * a));
}
function inIsland(x, z) {
  if (Math.hypot(x, z) < radiusAt(Math.atan2(z, x))) return true;
  for (const s of Object.values(SITES)) {
    if (s === SITES.dock) continue;
    if (Math.hypot(x - s.x, z - s.z) < s.r + 1.5) return true;
  }
  return false;
}
function onPath(x, z) {
  for (const s of Object.values(SITES)) {
    if (s === SITES.core) continue;
    if (segDist(x, z, 0, 0, s.front[0], s.front[1]) < 0.75) return true;
  }
  return Math.hypot(x, z) < 3.2;
}

// ---------- island ----------

function buildIsland(root) {
  const cells = [];
  for (let x = -18; x <= 18; x++) {
    for (let z = -18; z <= 18; z++) if (inIsland(x, z)) cells.push([x, z]);
  }
  const blocks = [];
  for (const [x, z] of cells) {
    const d = Math.hypot(x, z) / R;
    // deep in the middle, thin at the rim, with ragged stalactites underneath
    const drip = hash(x, z, 5) < 0.12 ? 2 + Math.floor(hash(x, z, 6) * 4) : 0;
    const depth = 1 + Math.floor(Math.pow(Math.max(0, 1 - d), 1.3) * 16 + hash(x, z, 1) * 2.5) + drip;
    for (let i = 0; i < depth; i++) {
      let color;
      if (i === 0) color = onPath(x, z) ? pick(C.path, x, z, 2) : pick(C.grass, x, z, 3);
      else if (i < 3) color = pick(C.dirt, x, z, i);
      else {
        const o = hash(x, z, i, 9);
        color = o < 0.025 ? C.gold : o < 0.045 ? C.base : pick(C.stone, x, z, i);
      }
      blocks.push([x, -0.5 - i, z, color]);
    }
  }
  const mesh = new THREE.InstancedMesh(GEO, new THREE.MeshLambertMaterial(), blocks.length);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  blocks.forEach(([x, y, z, c], i) => {
    m4.makeTranslation(x, y, z);
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.setHex(c));
  });
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  root.add(mesh);
  return cells;
}

// ---------- props ----------

function tree(parent, x, z, seed) {
  const g = new THREE.Group();
  const h = 1.6 + Math.floor(hash(seed, 1) * 3) * 0.4;
  B(g, 0.4, h, 0.4, C.log);
  const leaf = pick(C.leaf, seed, 2);
  B(g, 1.6, 1, 1.6, leaf, 0, h - 0.2, 0);
  B(g, 1.0, 0.6, 1.0, leaf, 0, h + 0.8, 0);
  g.position.set(x, 0, z);
  g.rotation.y = hash(seed, 3) * Math.PI;
  parent.add(g);
  return g;
}

function crate(p, x, z, y = 0, color = C.plankDark) {
  B(p, 0.5, 0.5, 0.5, color, x, y, z);
}

function house(p, x, z, roof, w = 2.6, d = 2.4, h = 1.6) {
  B(p, w, h, d, C.plank, x, 0, z);
  B(p, 0.7, 1.1, 0.1, C.dark, x, 0, z + d / 2 + 0.01, { shadow: false });
  B(p, 0.5, 0.5, 0.1, 0x9fd8ff, x + w / 4 + 0.2, 0.7, z + d / 2 + 0.01, { shadow: false });
  B(p, w + 0.4, 0.4, d + 0.4, roof, x, h, z);
  B(p, w - 0.4, 0.4, d - 0.2, roof, x, h + 0.4, z);
  B(p, w - 1.2, 0.35, d - 0.8, roof, x, h + 0.8, z);
  B(p, 0.35, 0.8, 0.35, C.stone[1], x - w / 4, h + 0.4, z - d / 4);
}

// Each builder returns a Group in local coords (door faces +z).
const BUILD = {
  core(g, fx) {
    B(g, 3.2, 0.3, 3.2, C.stone[0]);
    B(g, 2.4, 0.3, 2.4, C.stone[2], 0, 0.3);
    B(g, 1.2, 1.2, 1.2, C.white, 0, 0.6);
    for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
      B(g, 0.3, 1.4, 0.3, C.stone[1], x, 0.3, z);
      B(g, 0.35, 0.35, 0.35, C.base, x, 1.7, z, { emissive: 0x0030a0 });
    }
    const crystal = B(g, 0.9, 0.9, 0.9, 0x3d8bff, 0, 2.4, 0, { emissive: 0x0040ff });
    crystal.rotation.set(Math.PI / 4, 0, Math.PI / 4);
    crystal.material = crystal.material.clone();
    fx.crystal = crystal;
  },
  dock(g) {
    B(g, 5, 0.2, 2.2, C.plank, 1, 0);
    for (let i = -1; i <= 3; i++) B(g, 0.06, 0.02, 2.2, C.plankDark, i + 0.5, 0.2, 0, { shadow: false });
    for (const [x, z] of [[3.3, -1], [3.3, 1], [1, -1], [1, 1]]) B(g, 0.25, 1.6, 0.25, C.log, x, -1.4, z);
    B(g, 0.2, 1.6, 0.2, C.dark, 3.3, 0.2, 1);
    B(g, 0.35, 0.35, 0.35, 0xffd27a, 3.3, 1.8, 1, { emissive: 0xffa000 });
    crate(g, -0.6, -0.7); crate(g, -0.6, -0.15); crate(g, -0.6, -0.4, 0.5, C.plank);
  },
  hut(g) { house(g, 0, 0, C.roof[0]); crate(g, 1.6, 1.2); },
  farm(g) {
    B(g, 5, 0.12, 4, 0x6b4423, 0, 0, -0.2, { shadow: false });
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 4; j++) {
        const ripe = hash(i, j, 77) > 0.4;
        B(g, 0.5, ripe ? 0.6 : 0.35, 0.5, ripe ? 0xe8c547 : 0x7cc94a, -2 + i, 0.12, -1.7 + j);
      }
    }
    for (let i = -2.6; i <= 2.6; i += 1.3) {
      B(g, 0.15, 0.6, 0.15, C.plankDark, i, 0, -2.4);
      B(g, 0.15, 0.6, 0.15, C.plankDark, i, 0, 2.0);
    }
    B(g, 5.3, 0.1, 0.1, C.plank, 0, 0.45, -2.4);
    B(g, 0.2, 1.4, 0.2, C.log, 2.8, 0, 1.4);
    B(g, 1.0, 0.15, 0.15, C.log, 2.8, 1.0, 1.4);
    B(g, 0.45, 0.45, 0.45, 0xe8c547, 2.8, 1.3, 1.4);
  },
  mine(g) {
    B(g, 4.6, 1.2, 4, C.stone[0], 0, 0, -0.4);
    B(g, 3.6, 1.0, 3.2, C.stone[1], 0, 1.2, -0.6);
    B(g, 2.4, 0.8, 2.2, C.stone[2], 0.2, 2.2, -0.8);
    B(g, 1.3, 1.6, 0.2, 0x111318, 0, 0, 1.62, { shadow: false });
    B(g, 0.25, 1.8, 0.25, C.log, -0.75, 0, 1.7);
    B(g, 0.25, 1.8, 0.25, C.log, 0.75, 0, 1.7);
    B(g, 1.8, 0.25, 0.3, C.log, 0, 1.75, 1.7);
    B(g, 0.12, 0.05, 1.4, 0x666b73, -0.35, 0, 2.4);
    B(g, 0.12, 0.05, 1.4, 0x666b73, 0.35, 0, 2.4);
    B(g, 0.9, 0.5, 0.7, 0x55595f, 0, 0.12, 2.6);
    B(g, 0.35, 0.3, 0.35, C.gold, -0.18, 0.62, 2.6);
    B(g, 0.35, 0.3, 0.35, C.base, 0.2, 0.62, 2.6, { emissive: 0x001a66 });
  },
  market(g, fx) {
    const stripes = [[0xe74c3c, C.white], [C.base, C.white], [0xf39c12, C.white]];
    stripes.forEach((st, k) => {
      const x = (k - 1) * 1.8;
      for (const [px, pz] of [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.6], [0.7, 0.6]]) B(g, 0.12, 1.5, 0.12, C.plankDark, x + px, 0, pz);
      B(g, 1.6, 0.5, 0.6, C.plank, x, 0, 0.3);
      for (let i = 0; i < 4; i++) B(g, 0.4, 0.12, 1.5, st[i % 2], x - 0.6 + i * 0.4, 1.5, 0);
      crate(g, x - 0.3, 0.3, 0.5, k === 1 ? C.gold : 0xd35400);
    });
    // live chart board
    B(g, 3.6, 2.2, 0.2, C.dark, 0, 0.6, -1.4);
    B(g, 0.15, 0.6, 0.15, C.dark, -1.5, 0, -1.4);
    B(g, 0.15, 0.6, 0.15, C.dark, 1.5, 0, -1.4);
    fx.bars = [];
    for (let i = 0; i < 9; i++) {
      const bar = B(g, 0.22, 1, 0.05, 0x2ecc71, -1.4 + i * 0.35, 0.85, -1.27, { shadow: false, emissive: 0x0a5a2a });
      bar.material = bar.material.clone();
      fx.bars.push(bar);
    }
  },
  sawmill(g) {
    B(g, 3, 1.4, 2, C.plank, 0, 0, -0.5);
    B(g, 3.4, 0.3, 2.4, C.roof[3], 0, 1.4, -0.5);
    B(g, 2.6, 0.3, 1.6, C.roof[3], 0, 1.7, -0.5);
    for (let i = 0; i < 3; i++) B(g, 2.2, 0.35, 0.35, C.log, 0.3, 0.35 * i, 1.1 - i * 0.05);
    B(g, 1.6, 0.35, 0.35, C.log, 0.3, 0, 1.5);
    const saw = B(g, 0.08, 0.7, 0.7, 0xbfc5cc, -1.2, 0.2, 1.1);
    saw.rotation.x = Math.PI / 4;
    tree(g, -2.6, 1.2, 501); tree(g, 2.4, -2.2, 502); tree(g, -2.2, -2.4, 503);
  },
  houses(g) {
    house(g, -2.2, 0.6, C.roof[1], 2.2, 2.2);
    house(g, 1.2, 0.2, C.roof[2], 2.6, 2.4, 2);
    house(g, 0, -2.6, C.roof[4], 2.4, 2, 1.4);
    B(g, 0.15, 0.9, 0.15, C.dark, 2.8, 0, 2);
    B(g, 0.3, 0.3, 0.3, 0xffd27a, 2.8, 0.9, 2, { emissive: 0xffa000 });
  },
  crane(g, fx) {
    for (let y = 0; y < 7; y++) {
      B(g, 0.12, 1, 0.12, C.gold, -0.4, y, -0.4); B(g, 0.12, 1, 0.12, C.gold, 0.4, y, -0.4);
      B(g, 0.12, 1, 0.12, C.gold, -0.4, y, 0.4); B(g, 0.12, 1, 0.12, C.gold, 0.4, y, 0.4);
      B(g, 0.9, 0.08, 0.08, C.gold, 0, y, -0.4); B(g, 0.08, 0.08, 0.9, C.gold, 0.4, y, 0);
    }
    const jib = new THREE.Group();
    jib.position.set(0, 7, 0);
    B(jib, 0.5, 0.5, 5, C.gold, 0, 0, 1.2);
    B(jib, 0.8, 0.6, 0.8, C.dark, 0, 0, -1.4);
    B(jib, 0.04, 2.6, 0.04, C.dark, 0, -2.6, 3.2, { shadow: false });
    B(jib, 0.4, 0.4, 0.4, 0xd35400, 0, -3.0, 3.2);
    g.add(jib);
    fx.jib = jib;
    // half-built block structure
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) B(g, 0.9, 0.9, 0.9, C.stone[(i + j) % 3], 1.6 + i * 0.9 - 0.9, 0, 1.6 + j * 0.9);
    B(g, 0.9, 0.9, 0.9, C.stone[1], 1.6, 0.9, 1.6);
  },
  tower(g, fx) {
    B(g, 3, 0.4, 3, C.stone[0]);
    fx.windows = [];
    for (let i = 0; i < 6; i++) {
      B(g, 2.4, 1, 2.4, i % 2 ? C.white : 0xe8e8e2, 0, 0.4 + i, 0);
      const w = B(g, 2.5, 0.4, 2.5, 0x86c5ff, 0, 0.7 + i, 0, { shadow: false, emissive: 0x0b2a66 });
      w.material = w.material.clone();
      fx.windows.push(w);
    }
    B(g, 2.8, 0.3, 2.8, C.base, 0, 6.4);
    B(g, 1.3, 0.4, 0.15, 0x111318, 0, 2.4, 1.28, { shadow: false });
    B(g, 0.12, 1.6, 0.12, C.dark, 0, 6.7, 0);
    fx.blink = B(g, 0.3, 0.3, 0.3, 0xff3b3b, 0, 8.3, 0, { emissive: 0xff0000 });
    fx.blink.material = fx.blink.material.clone();
  },
  lighthouse(g, fx) {
    for (let i = 0; i < 7; i++) B(g, 1.6 - i * 0.08, 1, 1.6 - i * 0.08, i % 2 ? 0xe74c3c : C.white, 0, i, 0);
    B(g, 1.6, 0.25, 1.6, C.dark, 0, 7);
    fx.lamp = B(g, 0.9, 0.9, 0.9, 0xfff2a8, 0, 7.25, 0, { emissive: 0xffc800 });
    B(g, 1.3, 0.3, 1.3, 0xe74c3c, 0, 8.15, 0);
  },
  castle(g) {
    const stone = C.stone;
    B(g, 4.2, 2.4, 3.6, stone[0], 0, 0, -0.2);
    for (const [x, z] of [[-2.2, -2], [2.2, -2], [-2.2, 1.6], [2.2, 1.6]]) {
      B(g, 1.2, 3.6, 1.2, stone[1], x, 0, z);
      B(g, 1.4, 0.4, 1.4, stone[2], x, 3.6, z);
      for (const [cx, cz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) B(g, 0.35, 0.35, 0.35, stone[0], x + cx, 4, z + cz);
    }
    for (let i = -1.5; i <= 1.5; i += 0.75) B(g, 0.4, 0.4, 0.4, stone[2], i, 2.4, 1.5);
    B(g, 1.2, 1.6, 0.2, 0x5a3a1a, 0, 0, 1.62);
    B(g, 0.1, 2, 0.1, C.dark, 0, 2.4, -0.2);
    B(g, 1, 0.6, 0.08, C.base, 0.5, 3.8, -0.2);
  },
};

// ---------- clouds & airship ----------

function cloud(seed) {
  const g = new THREE.Group();
  const n = 3 + Math.floor(hash(seed, 1) * 4);
  for (let i = 0; i < n; i++) {
    const w = 1.5 + hash(seed, i, 2) * 2.5;
    B(g, w, 0.8 + hash(seed, i, 3) * 0.8, w * 0.8, 0xffffff, (i - n / 2) * 1.2, hash(seed, i, 4) * 0.6, hash(seed, i, 5) * 1.5 - 0.75, { opacity: 0.92, shadow: false });
  }
  return g;
}

export function createAirship() {
  const g = new THREE.Group();
  const bal = 0xf4f4f0;
  B(g, 4.4, 1.6, 1.6, bal, 0, 1.2, 0);
  B(g, 5.2, 1.0, 1.0, bal, 0, 1.5, 0);
  B(g, 3.6, 2.0, 1.0, bal, 0, 1.0, 0);
  B(g, 3.6, 1.0, 2.0, bal, 0, 1.5, 0);
  B(g, 4.5, 0.3, 1.65, C.base, 0, 1.75, 0);
  B(g, 0.2, 0.9, 0.1, C.base, -2.5, 2.2, 0);
  B(g, 0.2, 0.1, 1.6, C.base, -2.5, 1.95, 0);
  B(g, 1.8, 0.6, 0.9, C.plank, 0, 0, 0);
  B(g, 0.06, 0.6, 0.06, C.dark, -0.6, 0.6, 0.3); B(g, 0.06, 0.6, 0.06, C.dark, 0.6, 0.6, -0.3);
  const prop = new THREE.Group();
  prop.position.set(-1.1, 0.3, 0);
  B(prop, 0.08, 0.9, 0.12, C.dark, 0, -0.45, 0);
  g.add(prop);
  g.userData.prop = prop;
  return g;
}

// ---------- world ----------

export function createWorld(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const cells = buildIsland(root);

  // decorative trees on free grass
  const taken = (x, z) => onPath(x, z) || Object.values(SITES).some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 1.6);
  for (const [x, z] of cells) {
    if (hash(x, z, 42) < 0.07 && Math.hypot(x, z) < radiusAt(Math.atan2(z, x)) - 1 && !taken(x, z)) tree(root, x, z, x * 100 + z);
  }

  const buildings = {};
  const fx = {};
  for (const [id, s] of Object.entries(SITES)) {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rot;
    if (id === 'dock') g.rotation.y = 0;
    BUILD[id](g, (fx[id] = {}));
    g.visible = id === 'core' || id === 'dock';
    g.userData.grow = g.visible ? 1 : 0;
    root.add(g);
    buildings[id] = g;
  }

  const clouds = [];
  for (let i = 0; i < 9; i++) {
    const c = cloud(i + 1);
    const a = (i / 9) * Math.PI * 2;
    const r = 17 + hash(i, 8) * 9;
    c.position.set(Math.cos(a) * r, -4 + hash(i, 9) * 10 - (i % 3) * 3, Math.sin(a) * r);
    c.userData = { a, r, speed: 0.01 + hash(i, 10) * 0.015 };
    root.add(c);
    clouds.push(c);
  }

  function unlock(id, animate) {
    const g = buildings[id];
    if (!g || g.visible) return;
    g.visible = true;
    g.userData.grow = animate ? 0.001 : 1;
    g.scale.setScalar(animate ? 0.001 : 1);
  }

  let pulse = 0;
  function feePulse() { pulse = 1; }

  function update(t, dt) {
    for (const g of Object.values(buildings)) {
      const u = g.userData;
      if (g.visible && u.grow < 1) {
        u.grow = Math.min(1, u.grow + dt * 1.2);
        const k = u.grow, s = 1.7;
        g.scale.setScalar(1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2));
      }
    }
    pulse = Math.max(0, pulse - dt * 1.5);
    const cr = fx.core.crystal;
    cr.position.y = 2.85 + Math.sin(t * 2) * 0.15;
    cr.rotation.y = t * 0.8;
    cr.scale.setScalar(0.9 + pulse * 0.5);
    cr.material.emissive.setHex(pulse > 0.05 ? 0x4f8bff : 0x0040ff);
    if (fx.market.bars && buildings.market.visible) {
      fx.market.bars.forEach((b, i) => {
        const v = Math.sin(t * 0.9 + i * 0.8) + Math.sin(t * 2.1 + i * 1.7) * 0.5;
        b.scale.y = 0.3 + Math.abs(v) * 0.6;
        b.position.y = 0.85 + b.scale.y / 2;
        const up = v > 0;
        b.material.color.setHex(up ? 0x2ecc71 : 0xe74c3c);
        b.material.emissive.setHex(up ? 0x0a5a2a : 0x5a0a0a);
      });
    }
    if (fx.crane.jib) fx.crane.jib.rotation.y = Math.sin(t * 0.3) * 1.2;
    if (fx.tower.blink) fx.tower.blink.material.emissive.setHex(Math.sin(t * 4) > 0 ? 0xff0000 : 0x220000);
    if (fx.tower.windows) fx.tower.windows.forEach((w, i) => w.material.emissive.setHex(Math.sin(t * 1.5 + i) > 0.6 ? 0x2a6bff : 0x0b2a66));
    if (fx.lighthouse.lamp) fx.lighthouse.lamp.rotation.y = t * 2;
    for (const c of clouds) {
      c.userData.a += c.userData.speed * dt;
      c.position.x = Math.cos(c.userData.a) * c.userData.r;
      c.position.z = Math.sin(c.userData.a) * c.userData.r;
    }
    root.position.y = Math.sin(t * 0.5) * 0.25;
  }

  return { root, buildings, unlock, update, feePulse };
}
