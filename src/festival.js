// Balloon Festival (demo, only with ?festival): a launch field east of the city with hot-air balloons
// rising and drifting over the city. One plain cream balloon with a "?" and a banner keep the spot open
// for a partner's mascot (added only with their design and their ok). Render only (nothing touches the sim).
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
// the open spot: a plain cream balloon with a big "?" on each side, waiting for a partner's mascot
function makeOpenBalloon() {
  const { g, flame } = makeBalloon(0);
  g.clear();
  const rings = [[1.2, 0], [1.9, 0.6], [2.3, 1.3], [2.4, 2.1], [2.3, 2.9], [2.0, 3.6], [1.5, 4.2], [0.8, 4.6]];
  for (const [r, y] of rings) box(g, r * 2, 0.75, r * 2, 0xf3ead8, 0, 3.4 + y, 0);
  for (const z of [-2.45, 2.45]) { // the "?" in voxels
    for (const [x, y] of [[-0.4, 7.4], [0, 7.6], [0.4, 7.4], [0.5, 7.0], [0.2, 6.6], [0, 6.2], [0, 5.4]]) box(g, 0.4, 0.4, 0.1, 0x0052ff, x, y, z);
  }
  for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) box(g, 0.04, 2.6, 0.04, 0x8a6a40, x, 2.1, z);
  box(g, 1.0, 0.7, 1.0, 0x9a6b3a, 0, 0.35, 0); box(g, 1.06, 0.08, 1.06, 0x6b4a28, 0, 0.72, 0);
  g.add(flame);
  return { g, flame };
}
const BANNER = (() => {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const c = cv.getContext('2d');
  c.fillStyle = '#0052ff'; c.fillRect(0, 0, 512, 96); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '800 46px Inter, system-ui, sans-serif'; c.fillText('YOUR MASCOT HERE', 256, 50);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide });
})();

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

  // the banner by the gate
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), BANNER); banner.position.set(0, 3.4, -10.1); field.add(banner);
  for (const x of [-4.2, 4.2]) box(field, 0.15, 4.2, 0.15, 0xf4f4f0, x, 2.1, -10.1);
  // balloons: five striped and the open one, each rising from its pad, drifting out over the city and coming back down
  const pads = [[-6, -3], [-2, 3], [3, -4], [7, 2], [-9, 4], [1, 0]];
  const balloons = pads.map(([x, z], i) => {
    const b = i === pads.length - 1 ? makeOpenBalloon() : makeBalloon(i);
    group.add(b.g);
    return { ...b, pad: new THREE.Vector3(x, 0, z), off: i * 7.3, period: 46 + i * 5 };
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
  }
  return { update };
}
