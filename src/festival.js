// Balloon Festival (demo, only with ?festival): a launch field east of the city with hot-air balloons
// rising and drifting over the city, one shaped like a Puff, and Puffs (BaseCity's own fluffy little
// citizens) wandering the field. Render only (nothing here touches the sim).
import * as THREE from 'three';
import { PITCH } from './sim.js';

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
const mat = (color, emissive = 0) => {
  const k = `${color}|${emissive}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, emissive }));
  return mats.get(k);
};
function box(parent, w, h, d, color, x, y, z, emissive) {
  const m = new THREE.Mesh(UNIT, mat(color, emissive));
  m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true;
  parent.add(m);
  return m;
}

// ---------- a Puff: a round fluffy body, pointed ears, an antenna with a light, big eyes, stubby feet ----------
const PUFF_COLORS = [0x8fb6ff, 0x6f9dff, 0xa9c6ff, 0x7fd1c9];
function makePuff(color) {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  const fur = color, shade = new THREE.Color(color).multiplyScalar(0.85).getHex();
  box(body, 0.7, 0.62, 0.62, fur, 0, 0.42, 0); // round body: a core and softened sides
  box(body, 0.6, 0.72, 0.52, fur, 0, 0.37, 0);
  box(body, 0.62, 0.5, 0.7, shade, 0, 0.48, 0);
  for (const [x, z] of [[-0.24, 0.3], [0.24, 0.3], [-0.3, -0.1], [0.3, -0.1], [0, 0.34]]) box(body, 0.1, 0.1, 0.1, 0xffffff, x * 0.9, 0.6, z * 0.95); // fluff tufts
  for (const x of [-0.2, 0.2]) { // pointed ears
    box(body, 0.14, 0.14, 0.12, fur, x, 0.98, 0); box(body, 0.08, 0.1, 0.08, shade, x * 1.1, 1.12, 0);
  }
  box(body, 0.04, 0.22, 0.04, 0x2b2f36, 0, 1.0, -0.05); box(body, 0.1, 0.1, 0.1, 0xffd23f, 0, 1.22, -0.05, 0x8a6a00); // antenna light
  for (const x of [-0.14, 0.14]) { // big eyes with a shine
    box(body, 0.14, 0.16, 0.03, 0x14161b, x, 0.6, 0.35); box(body, 0.05, 0.05, 0.02, 0xffffff, x + 0.03, 0.66, 0.37);
  }
  box(body, 0.1, 0.03, 0.03, 0x14161b, 0, 0.47, 0.35); // little mouth
  const feet = [-0.15, 0.15].map((x) => box(g, 0.16, 0.08, 0.2, shade, x, 0.0, 0.05));
  return { g, body, feet };
}

// ---------- a hot-air balloon: a voxel envelope in rings, coloured stripes, ropes, a basket and a burner ----------
const STRIPES = [[0xe74c3c, 0xf4f4f0], [0x0052ff, 0xf4f4f0], [0xf1c40f, 0xe67e22], [0x27ae60, 0xf4f4f0], [0x8e44ad, 0xffd23f]];
function makeBalloon(i) {
  const g = new THREE.Group(), [a, b] = STRIPES[i % STRIPES.length];
  const rings = [[1.2, 0], [1.9, 0.6], [2.3, 1.3], [2.4, 2.1], [2.3, 2.9], [2.0, 3.6], [1.5, 4.2], [0.8, 4.6]];
  rings.forEach(([r, y], k) => { box(g, r * 2, 0.75, r * 2, k % 2 ? a : b, 0, 3.4 + y, 0); box(g, r * 2.04, 0.75, r * 1.4, k % 2 ? b : a, 0, 3.4 + y, 0); });
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) box(g, 0.04, 2.6, 0.04, 0x8a6a40, x, 2.1, z); // ropes
  box(g, 1.0, 0.7, 1.0, 0x9a6b3a, 0, 0.35, 0); box(g, 1.06, 0.08, 1.06, 0x6b4a28, 0, 0.72, 0); // basket
  const flame = box(g, 0.25, 0.4, 0.25, 0xffa53a, 0, 3.2, 0, 0xff7a00);
  return { g, flame };
}
// the balloon shaped like a Puff: the envelope is the Puff's head, ears and all
function makePuffBalloon() {
  const g = new THREE.Group(), fur = 0x8fb6ff, shade = 0x6f9dff;
  box(g, 4.4, 3.8, 4.0, fur, 0, 5.4, 0); box(g, 3.8, 4.4, 3.6, fur, 0, 5.1, 0); box(g, 4.0, 3.0, 4.6, shade, 0, 5.8, 0);
  for (const x of [-1.3, 1.3]) { box(g, 0.9, 0.9, 0.8, fur, x, 9.3, 0); box(g, 0.5, 0.6, 0.5, shade, x * 1.08, 10.1, 0); }
  box(g, 0.2, 1.1, 0.2, 0x2b2f36, 0, 9.4, -0.3); box(g, 0.5, 0.5, 0.5, 0xffd23f, 0, 10.5, -0.3, 0x8a6a00);
  for (const x of [-0.9, 0.9]) { box(g, 0.8, 1.0, 0.1, 0x14161b, x, 6.6, 2.32); box(g, 0.28, 0.28, 0.06, 0xffffff, x + 0.2, 7.2, 2.4); }
  box(g, 0.6, 0.16, 0.1, 0x14161b, 0, 5.9, 2.32);
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) box(g, 0.04, 2.8, 0.04, 0x8a6a40, x, 2.1, z);
  box(g, 1.0, 0.7, 1.0, 0x9a6b3a, 0, 0.35, 0); box(g, 1.06, 0.08, 1.06, 0x6b4a28, 0, 0.72, 0);
  const flame = box(g, 0.25, 0.4, 0.25, 0xffa53a, 0, 3.2, 0, 0xff7a00);
  return { g, flame };
}

export function createFestival(city) {
  const group = new THREE.Group();
  city.root.add(group);
  const field = new THREE.Group();
  group.add(field);
  // the launch field: mown grass, a gravel ring, bunting poles, a ticket booth
  box(field, 30, 0.04, 22, 0x7cc35a, 0, 0.02, 0);
  for (let a = 0; a < 24; a++) { const r = 9, x = Math.cos((a / 24) * Math.PI * 2) * r, z = Math.sin((a / 24) * Math.PI * 2) * r * 0.7; box(field, 1, 0.05, 1, 0xd8c9a3, x, 0.04, z); }
  for (const [x, z] of [[-14, -10], [14, -10], [-14, 10], [14, 10]]) { box(field, 0.12, 3, 0.12, 0xf4f4f0, x, 1.5, z); }
  for (let i = 0; i < 14; i++) box(field, 0.35, 0.35, 0.05, STRIPES[i % 5][0], -13 + i * 2, 2.7, -10);
  box(field, 2.4, 1.8, 1.6, 0xf4f4f0, 11, 0.9, 7); box(field, 2.8, 0.2, 2, 0x0052ff, 11, 1.9, 7);

  // balloons: five striped and one Puff, each rising from its pad, drifting out over the city and coming back down
  const pads = [[-6, -3], [-2, 3], [3, -4], [7, 2], [-9, 4], [1, 0]];
  const balloons = pads.map(([x, z], i) => {
    const b = i === pads.length - 1 ? makePuffBalloon() : makeBalloon(i);
    group.add(b.g);
    return { ...b, pad: new THREE.Vector3(x, 0, z), off: i * 7.3, period: 46 + i * 5 };
  });

  // Puffs wandering the field
  const puffs = Array.from({ length: 8 }, (_, i) => {
    const p = makePuff(PUFF_COLORS[i % PUFF_COLORS.length]);
    p.g.scale.setScalar(1.1);
    field.add(p.g);
    return { ...p, at: new THREE.Vector3((Math.random() - 0.5) * 22, 0, (Math.random() - 0.5) * 16), to: new THREE.Vector3(), wait: Math.random() * 3, speed: 0.7 + Math.random() * 0.5 };
  });

  let placedFor = -1;
  function place() {
    const H = Math.max(2, city.land) * PITCH;
    field.position.set(H + 30, 0, -H * 0.4); // east of the city, out in the countryside
    placedFor = city.land;
  }

  const tmp = new THREE.Vector3();
  function update(t, dt) {
    if (city.land !== placedFor) place();
    const H = Math.max(2, city.land) * PITCH;
    for (const b of balloons) {
      const c = ((t + b.off) % b.period) / b.period; // 0..1: on the pad, up, drift over the city, back, down
      const up = Math.min(1, c / 0.15), down = Math.max(0, (c - 0.85) / 0.15);
      const alt = (c < 0.15 ? up * up : c > 0.85 ? (1 - down) ** 2 : 1) * (18 + (b.off % 7));
      const drift = Math.sin(Math.min(1, Math.max(0, (c - 0.15) / 0.7)) * Math.PI); // out and back
      tmp.copy(b.pad).add(field.position);
      b.g.position.set(tmp.x - drift * (H + 30) * 0.8, alt, tmp.z + drift * Math.sin(b.off) * H * 0.4);
      b.g.rotation.y = t * 0.05 + b.off;
      b.flame.visible = c < 0.85 && Math.sin(t * 3 + b.off * 5) > -0.2;
      b.flame.scale.y = 0.4 + Math.abs(Math.sin(t * 12 + b.off)) * 0.3;
    }
    for (const p of puffs) {
      if (p.wait > 0) { p.wait -= dt; p.body.position.y = Math.abs(Math.sin(t * 2 + p.speed * 9)) * 0.03; continue; }
      if (!p.to.lengthSq() || p.at.distanceTo(p.to) < 0.2) { p.to.set((Math.random() - 0.5) * 24, 0, (Math.random() - 0.5) * 16); p.wait = 1 + Math.random() * 3; continue; }
      const d = tmp.subVectors(p.to, p.at); const step = Math.min(d.length(), p.speed * dt);
      p.at.addScaledVector(d.normalize(), step);
      p.g.position.copy(p.at);
      p.g.rotation.y = Math.atan2(d.x, d.z);
      const hop = Math.abs(Math.sin(t * 9 + p.speed * 9)); // waddle and bounce
      p.body.position.y = hop * 0.12; p.body.rotation.z = Math.sin(t * 9 + p.speed) * 0.08;
      p.feet[0].position.z = 0.05 + Math.sin(t * 9) * 0.06; p.feet[1].position.z = 0.05 - Math.sin(t * 9) * 0.06;
    }
  }
  return { update };
}
