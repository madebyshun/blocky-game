import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PITCH } from './sim.js';

// Cat Town (@cattownbase) in BaseCity: voxel cats that stroll the sidewalks around the city's parks, and
// more around Cat Town Plaza on Base Avenue once it stands (its statue: catStatue). Just for looks:
// they don't build, and every visitor sees their own.

// coats: Cat Town's own blue-grey cat first, then a few neighbours
export const CAT_COATS = [
  { fur: 0x6178a8, dark: 0x1e3557, ear: 0x9cb8f2, eye: 0xff79b0, nose: 0x9b7cf0, chest: 0xe8e0ff },
  { fur: 0xf0a040, dark: 0xb5621a, ear: 0xffc9a0, eye: 0x5bd16b, nose: 0xff8fa3, chest: 0xfff3e0 },
  { fur: 0x2a2a33, dark: 0x111116, ear: 0x7a6a8a, eye: 0xf4d03f, nose: 0xff8fa3, chest: 0xf4f4f0 },
  { fur: 0xf3f1ea, dark: 0xb9b4a8, ear: 0xffc0cb, eye: 0x4aa3ff, nose: 0xff9fb0, chest: 0xffffff },
  { fur: 0x9aa0a8, dark: 0x4f5560, ear: 0xe8b0b8, eye: 0x8be06a, nose: 0xe88fa0, chest: 0xe9e9e4 },
];

// A cat as boxes [w, h, d, colour, x, y (bottom), z, turn], facing +z, its paws at y 0.
function head(p, y, z, blink) {
  const out = [[0.38, 0.3, 0.3, p.fur, 0, y, z], [0.39, 0.036, 0.31, p.dark, 0, y + 0.27, z]];
  for (const s of [-1, 1]) {
    out.push(
      [0.1, 0.12, 0.08, p.fur, s * 0.12, y + 0.3, z - 0.02], [0.05, 0.07, 0.02, p.ear, s * 0.12, y + 0.31, z + 0.025], [0.1, 0.03, 0.08, p.dark, s * 0.12, y + 0.42, z - 0.02],
      [0.07, blink ? 0.02 : 0.065, 0.02, blink ? p.dark : p.eye, s * 0.09, y + 0.15, z + 0.151],
      [0.12, 0.016, 0.02, p.dark, s * 0.22, y + 0.1, z + 0.12], [0.1, 0.016, 0.02, p.dark, s * 0.22, y + 0.065, z + 0.12], // whiskers
    );
  }
  out.push([0.05, 0.035, 0.02, p.nose, 0, y + 0.1, z + 0.152], [0.1, 0.016, 0.02, p.dark, 0, y + 0.07, z + 0.152]);
  return out;
}
// { body, tail: [pivot, boxes], legs: [[pivot, boxes], [pivot, boxes]] } for 'sit', 'walk' or 'loaf'
export function catShape(p, pose) {
  if (pose === 'sit') {
    return {
      body: [[0.36, 0.38, 0.34, p.fur, 0, 0, 0], [0.24, 0.3, 0.03, p.chest, 0, 0.02, 0.17], [0.1, 0.06, 0.12, p.chest, -0.09, 0, 0.19], [0.1, 0.06, 0.12, p.chest, 0.09, 0, 0.19], [0.37, 0.03, 0.35, p.dark, 0, 0.3, -0.02], ...head(p, 0.36, 0.04)],
      tail: [[0.18, 0, -0.12], [[0.08, 0.08, 0.3, p.fur, 0.02, 0, 0.1], [0.09, 0.09, 0.09, p.dark, 0.05, 0, 0.27]]],
    };
  }
  if (pose === 'loaf') {
    return {
      body: [[0.38, 0.24, 0.5, p.fur, 0, 0, -0.05], [0.39, 0.036, 0.08, p.dark, 0, 0.21, -0.15], ...head(p, 0.08, 0.28, true)],
      tail: [[0, 0, -0.3], [[0.08, 0.08, 0.2, p.fur, 0, 0, -0.1], [0.08, 0.08, 0.22, p.fur, 0.1, 0, -0.25, 0.8]]],
    };
  }
  const leg = (x, z) => [[0.09, 0.17, 0.09, p.fur, x, -0.17, z], [0.095, 0.04, 0.1, p.chest, x, -0.17, z + 0.005]];
  return {
    body: [[0.34, 0.26, 0.6, p.fur, 0, 0.17, -0.05], [0.22, 0.18, 0.03, p.chest, 0, 0.19, 0.25], [0.35, 0.036, 0.08, p.dark, 0, 0.4, -0.18], [0.35, 0.036, 0.08, p.dark, 0, 0.4, 0.02], ...head(p, 0.32, 0.36)],
    tail: [[0, 0.32, -0.33], [[0.08, 0.08, 0.2, p.fur, 0, 0, -0.1], [0.08, 0.3, 0.08, p.fur, 0, 0, -0.22], ...[0.08, 0.18, 0.28].map((t) => [0.09, 0.035, 0.09, p.dark, 0, t, -0.22])]],
    legs: [[[0, 0.17, 0], [...leg(-0.1, 0.18), ...leg(0.1, -0.26)]], [[0, 0.17, 0], [...leg(0.1, 0.18), ...leg(-0.1, -0.26)]]],
  };
}

// The statue on Cat Town Plaza: a sitting cat `s` times life size, built into a city kit (k.box /
// k.boxR take the bottom y), at (x, y, z).
export function catStatue(k, s, x, y, z) {
  const { body, tail } = catShape(CAT_COATS[0], 'sit');
  const put = ([w, h, d, c, bx, by, bz, ry], ox = 0, oy = 0, oz = 0) => {
    const args = [w * s, h * s, d * s, c, x + (ox + bx) * s, y + (oy + by) * s, z + (oz + bz) * s];
    if (ry) k.boxR(...args, ry); else k.box(...args);
  };
  body.forEach((b) => put(b));
  tail[1].forEach((b) => put(b, ...tail[0]));
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const C = new THREE.Color();
function bake(boxes) {
  const geos = boxes.map(([w, h, d, c, x, y, z, ry = 0]) => {
    const g = BOX.clone().translate(0, 0.5, 0).scale(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    C.set(c);
    const n = g.attributes.position.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i += 3) { arr[i] = C.r; arr[i + 1] = C.g; arr[i + 2] = C.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), MAT);
  geos.forEach((g) => g.dispose());
  m.castShadow = true;
  return m;
}
const part = ([pivot, boxes]) => { const g = new THREE.Group(); g.position.set(...pivot); g.add(bake(boxes)); return g; };
function catModel(p, pose) {
  const s = catShape(p, pose), g = new THREE.Group();
  g.add(bake(s.body));
  const tail = part(s.tail);
  g.add(tail);
  const legs = (s.legs || []).map(part);
  legs.forEach((l) => g.add(l));
  return { g, tail, legs };
}

const SIZE = 1.2; // a Blocky is about 1.3 tall; a sitting cat about half that
const R = 3.35; // the sidewalk around a lot, from its centre
const Y = 0.15;
const CORNERS = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
const PLAZA = 'hq-cattown';
const PARKS = new Set(['park', 'lakepark', 'flowergarden']);
const rand = (a, b) => a + Math.random() * (b - a);

export function createCats(city) {
  const group = new THREE.Group();
  city.root.add(group);
  const cats = [];
  let loafers = null;

  // one strolling cat: around the blocks near `home` ([x, z]), now and then sitting down a while
  function spawn(home, coat) {
    const walk = catModel(coat, 'walk'), sit = catModel(coat, 'sit');
    const o = new THREE.Group();
    o.add(walk.g, sit.g);
    o.scale.setScalar(SIZE);
    sit.g.visible = false;
    const c = { o, walk, sit, home, lot: [...home], corner: Math.floor(rand(0, 4)), dir: Math.random() < 0.5 ? 1 : -1, rest: rand(0, 4), phase: rand(0, 6) };
    const [sx, sz] = CORNERS[c.corner];
    o.position.set(home[0] + sx * R, Y, home[1] + sz * R);
    c.to = target(c);
    group.add(o);
    cats.push(c);
  }
  function target(c) { const [sx, sz] = CORNERS[c.corner]; return [c.lot[0] + sx * R, c.lot[1] + sz * R]; }
  // at a corner: on round the block, or across the road to the next block (staying near home)
  function next(c) {
    const [sx, sz] = CORNERS[c.corner], lim = city.land * PITCH;
    if (Math.random() < 0.3) {
      const ax = Math.random() < 0.5, lot = ax ? [c.lot[0] + sx * PITCH, c.lot[1]] : [c.lot[0], c.lot[1] + sz * PITCH];
      if (Math.abs(lot[0]) <= lim && Math.abs(lot[1]) <= lim && Math.hypot(lot[0] - c.home[0], lot[1] - c.home[1]) <= 2 * PITCH) {
        c.lot = lot;
        c.corner = CORNERS.findIndex(([x, z]) => x === (ax ? -sx : sx) && z === (ax ? sz : -sz));
        return target(c);
      }
    }
    c.corner = (c.corner + c.dir + 4) % 4;
    return target(c);
  }

  function update(t, dt) {
    if (!cats.length) { // around the parks (Town Square until there's one)
      const parks = city.built.filter((b) => PARKS.has(b.type)).slice(0, 3);
      const homes = parks.length ? parks.map((b) => [b.x, b.z]) : [[0, 0]];
      [0, 0, 1, 2, 3, 4].forEach((c, i) => spawn(homes[i % homes.length], CAT_COATS[c]));
    }
    const plaza = city.built.find((b) => b.type === PLAZA);
    if (plaza && cats.length < 12) for (let i = 0; i < 6; i++) spawn([plaza.x, plaza.z], CAT_COATS[i % CAT_COATS.length]);
    if (plaza && !loafers) {
      loafers = new THREE.Group();
      [[-1.9, 0.6, 0.5, 0], [1.7, -0.6, -2.0, 3], [-0.7, 1.5, 2.2, 1]].forEach(([x, ry, z, i]) => {
        const m = catModel(CAT_COATS[i], 'loaf').g;
        m.position.set(x, Y, z); m.rotation.y = ry; m.scale.setScalar(SIZE);
        loafers.add(m);
      });
      loafers.position.set(plaza.x, 0, plaza.z);
      group.add(loafers);
    }
    if (!plaza && loafers) { group.remove(loafers); loafers = null; }
    for (const c of cats) {
      const p = c.o.position, ph = t + c.phase;
      if (c.rest > 0) {
        c.rest -= dt;
        c.sit.g.visible = true; c.walk.g.visible = false;
        c.sit.tail.rotation.y = Math.sin(ph * 1.5) * 0.35;
        continue;
      }
      c.sit.g.visible = false; c.walk.g.visible = true;
      const dx = c.to[0] - p.x, dz = c.to[1] - p.z, d = Math.hypot(dx, dz), step = 0.7 * dt;
      if (d <= step) {
        p.x = c.to[0]; p.z = c.to[1];
        if (Math.random() < 0.35) c.rest = rand(2, 7);
        c.to = next(c);
        continue;
      }
      p.x += (dx / d) * step; p.z += (dz / d) * step;
      c.o.rotation.y = Math.atan2(dx, dz);
      const sw = Math.sin(ph * 11) * 0.5;
      c.walk.legs[0].rotation.x = sw; c.walk.legs[1].rotation.x = -sw;
      c.walk.tail.rotation.y = Math.sin(ph * 3) * 0.3;
      p.y = Y + Math.abs(Math.sin(ph * 11)) * 0.02;
    }
  }

  return { update, group, get count() { return cats.length + (loafers ? loafers.children.length : 0); } };
}
