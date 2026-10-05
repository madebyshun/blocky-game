import * as THREE from 'three';
import { PITCH } from './sim.js';
import { kitFor, C, GLOW_MAT } from './city.js';

// BaseCity Metro: an elevated loop over the ring road between the two outer rings of lots, on
// pillars that stand in the middle of the road (cars pass on either side). Built as one project;
// while it is under construction the pillars and deck rise around the loop. The train stops at a
// station on every side, and the loop grows with the land.

const DECK = 4.2; // deck height
const R = 1.5; // corner radius (keeps the deck off the corner lots)
const CARS = 3, CAR_LEN = 2.5, GAP = 0.2;

// Rounded square of half-size H, travelled clockwise seen from the camera: +x along z = +H first.
export function loopPath(H) {
  const S = 2 * (H - R), side = S + (Math.PI * R) / 2, P = 4 * side;
  function at(s) {
    s = ((s % P) + P) % P;
    const k = Math.floor(s / side), u = s - k * side;
    let x, z, dx, dz;
    if (u < S) { x = -H + R + u; z = H; dx = 1; dz = 0; }
    else { const a = (u - S) / R; x = H - R + Math.sin(a) * R; z = H - R + Math.cos(a) * R; dx = Math.cos(a); dz = -Math.sin(a); }
    const c = Math.cos((k * Math.PI) / 2), n = Math.sin((k * Math.PI) / 2); // turn the side into place
    return { x: x * c + z * n, z: -x * n + z * c, yaw: Math.atan2(-(-dx * n + dz * c), dx * c + dz * n) };
  }
  const stations = [0, 1, 2, 3].map((k) => k * side + S / 2);
  return { at, P, S, side, stations };
}

function deckPiece(k, a, b) {
  k.beam([a.x, DECK, a.z], [b.x, DECK, b.z], 1.3, 0.35, 0xc9ccd1);
  for (const off of [-0.32, 0.32]) {
    const nx = Math.sin(a.yaw) * off, nz = Math.cos(a.yaw) * off; // sideways from the heading
    k.beam([a.x + nx, DECK + 0.22, a.z + nz], [b.x + nx, DECK + 0.22, b.z + nz], 0.07, 0.08, 0x8a939e);
  }
}
function pillar(k, x, z, yaw) {
  k.box(0.45, DECK - 0.17, 0.45, 0xb9bec5, x, 0, z);
  k.boxR(0.6, 0.3, 1.4, 0xa3a9b0, x, DECK - 0.45, z, yaw);
}
// a platform on the outer side with a canopy, a stair tower down to the street and an "M" sign
function station(k, p, out) {
  const ox = Math.sin(p.yaw) * out, oz = Math.cos(p.yaw) * out;
  const along = (d) => [Math.cos(p.yaw) * d, -Math.sin(p.yaw) * d];
  const [ax, az] = along(3);
  k.beam([p.x + ox - ax, DECK + 0.05, p.z + oz - az], [p.x + ox + ax, DECK + 0.05, p.z + oz + az], 0.65, 0.3, 0xe9eef5);
  k.beam([p.x + ox * 1.1 - ax, DECK + 1.6, p.z + oz * 1.1 - az], [p.x + ox * 1.1 + ax, DECK + 1.6, p.z + oz * 1.1 + az], 1.0, 0.12, C.base);
  for (const d of [-2.6, 2.6]) { const [bx, bz] = along(d); k.box(0.1, 1.4, 0.1, C.dark, p.x + ox * 1.2 + bx, DECK + 0.2, p.z + oz * 1.2 + bz); }
  for (const d of [-1.5, 0, 1.5]) { const [bx, bz] = along(d); k.win(0.4, 0.06, 0.4, p.x + ox * 1.1 + bx, DECK + 1.54, p.z + oz * 1.1 + bz); }
  const [sx, sz] = along(3.4);
  k.box(0.9, DECK + 0.35, 0.9, 0xdfe6ee, p.x + ox + sx, 0, p.z + oz + sz); // stairs / lift
  k.box(0.7, 0.7, 0.7, C.base, p.x + ox + sx, DECK + 0.35, p.z + oz + sz);
  k.box(0.74, 0.12, 0.74, C.white, p.x + ox + sx, DECK + 0.55, p.z + oz + sz);
}

function buildTrack(path, frac) {
  return kitFor((k) => {
    const step = 1, n = Math.floor((path.P * frac) / step);
    for (let i = 0; i < n; i++) deckPiece(k, path.at(i * step), path.at((i + 1) * step));
    for (let s = 2; s < path.P * frac; s += 4) { const p = path.at(s); pillar(k, p.x, p.z, p.yaw); }
    if (frac >= 1) for (const s of path.stations) station(k, path.at(s), 1.0);
  });
}

function makeCar(lead) {
  return kitFor((k) => {
    k.box(CAR_LEN, 0.95, 1.0, C.white, 0, 0, 0);
    k.box(CAR_LEN + 0.02, 0.14, 1.02, C.base, 0, 0.2, 0);
    k.box(CAR_LEN - 0.3, 0.1, 0.8, 0xb9bec5, 0, 0.95, 0);
    for (const z of [-0.51, 0.51]) k.win(CAR_LEN - 0.5, 0.32, 0.03, 0, 0.5, z);
    if (lead) { k.box(0.35, 0.7, 0.9, C.white, CAR_LEN / 2 + 0.17, 0.05, 0); k.win(0.04, 0.3, 0.7, CAR_LEN / 2 + 0.35, 0.45, 0); }
    k.box(0.3, 0.2, 0.9, 0x2b2f36, -CAR_LEN / 2 + 0.4, -0.2, 0); k.box(0.3, 0.2, 0.9, 0x2b2f36, CAR_LEN / 2 - 0.4, -0.2, 0);
  });
}
function makeTrain() {
  const cars = [];
  for (let i = 0; i < CARS; i++) cars.push(makeCar(i === 0));
  return cars;
}

export function createMetro(city) {
  const group = new THREE.Group();
  city.root.add(group);
  const train = makeTrain();
  for (const c of train) { c.visible = false; group.add(c); }
  let track = null, key = '', path = null, open = false;
  let s = 0, dwell = 0, vel = 0;

  function sync(sim) {
    const L = Math.max(2, city.land), H = PITCH * (L - 1) + PITCH / 2;
    open = !!sim.metroBuilt;
    const building = sim.next?.kind === 'metro';
    const steps = open ? 24 : building ? Math.floor((sim.placed / sim.next.cost) * 24) : 0;
    const k = `${H}|${steps}`;
    if (k === key) return;
    key = k;
    if (track) group.remove(track);
    path = loopPath(H);
    track = steps ? buildTrack(path, steps / 24) : null;
    if (track) group.add(track);
    for (const c of train) c.visible = open;
  }

  function update(t, dt) {
    if (!open || !path) return;
    if (dwell > 0) dwell -= dt;
    else {
      // pull away, cruise, brake into the next station and wait there
      let next = Infinity;
      for (const st of path.stations) { let d = (((st - s) % path.P) + path.P) % path.P; if (d < 0.01) d += path.P; next = Math.min(next, d); }
      vel = Math.min(vel + 3 * dt, 7, Math.max(0.8, Math.sqrt(5 * next)));
      if (next <= vel * dt) { s = (s + next) % path.P; dwell = 2.5; vel = 0; } else s = (s + vel * dt) % path.P;
    }
    train.forEach((c, i) => {
      const p = path.at(s - i * (CAR_LEN + GAP));
      c.position.set(p.x, DECK + 0.45, p.z);
      c.rotation.y = p.yaw;
    });
  }

  return { sync, update, group };
}

// For the gallery: a straight stretch with a station and the train at the platform.
export function metroSample() {
  const g = new THREE.Group();
  const path = { at: (s) => ({ x: s - 5, z: 0, yaw: 0 }), P: 10, stations: [] };
  g.add(kitFor((k) => {
    k.box(10.4, 0.15, 3, C.road, 0, 0, 0);
    for (let s = 0; s < 10; s += 1.5) deckPiece(k, path.at(s), path.at(Math.min(10, s + 1.5)));
    for (let s = 1; s < 10; s += 4) pillar(k, s - 5, 0, 0);
    station(k, path.at(5), -1.0);
  }));
  makeTrain().forEach((c, i) => { c.position.set(2 - i * (CAR_LEN + GAP), DECK + 0.45, 0); g.add(c); });
  return g;
}
