// The Launch Pad: a stunt ramp past the edge of the city and three jet cars that use it. Each one
// rolls down the runway, rides the ramp (a curve up, a tall vertical wall, then a curve back over
// into an overhanging lip), leaves the lip upside down, rights itself on its thrusters and flies a
// lap over the city, lands on the runway in a smoky burnout, then waits for its next run.
// Render only (nothing here touches the sim). city.jetcars: the cars, for the jet cam (src/cinematic.js).
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
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

const WHITE = 0xf2f3f5, BASE = 0x0052ff, DARK = 0x16181d, GLASS = 0x1b2230, STEEL = 0x8f98a3, RED = 0xff2a2a, CONCRETE = 0xd9d7d2;

// ---------- the ramp's profile, in the x-y plane, by distance s along its surface ----------
// a quarter circle up from the runway, a tall vertical wall, a curve back over the top, a straight lip
const R1 = 6, WALL = 6, R2 = 5.5, BACK = (75 * Math.PI) / 180, LIP = 6, WIDTH = 3.6; // a tall C, ~165 degrees round, and a long lip tilted slightly up
const L1 = (R1 * Math.PI) / 2, L2 = L1 + WALL, L3 = L2 + R2 * BACK, LTOTAL = L3 + LIP;
const C3 = new THREE.Vector2(R1 - R2, R1 + WALL); // centre of the top curve
function ramp(s) { // -> { x, y, phi } (phi: the surface's heading; 0 along +x, pi/2 straight up)
  if (s <= L1) { const phi = s / R1; return { x: R1 * Math.sin(phi), y: R1 - R1 * Math.cos(phi), phi }; }
  if (s <= L2) return { x: R1, y: R1 + (s - L1), phi: Math.PI / 2 };
  if (s <= L3) { const phi = Math.PI / 2 + (s - L2) / R2; return { x: C3.x + R2 * Math.sin(phi), y: C3.y - R2 * Math.cos(phi), phi }; }
  const e = ramp(L3), t = s - L3;
  return { x: e.x + Math.cos(e.phi) * t, y: e.y + Math.sin(e.phi) * t, phi: e.phi };
}
const RUNWAY = 26; // apron length before the ramp's foot
const SPOT = new THREE.Vector3(-RUNWAY / 2 - 2, 0, 3); // where they land, burn out, park and start the next run
const CYCLE = 30, CARS = 3;
const T_ROLL = 4, T_RAMP = 1.7, T_FLY = 16.5, T_BURN = 3.2; // then parked until the next run

// ---------- a low wedge sports car (our own design), nose toward -x ----------
const PLUME = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.55, depthWrite: false });
const FLAME = new THREE.MeshBasicMaterial({ color: 0x8fc4ff, transparent: true, opacity: 0.9, depthWrite: false });
const PLUME_GEO = new THREE.ConeGeometry(0.22, 1, 10, 1, true).translate(0, -0.5, 0); // narrow at the nozzle, opening along -y
const NOZZLE = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 12).rotateZ(Math.PI / 2);
function makeJetcar() {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  box(body, 2.3, 0.28, 1.05, WHITE, 0, 0.32, 0); // floor pan
  box(body, 1.7, 0.2, 1.0, WHITE, 0.15, 0.52, 0); // body
  box(body, 0.6, 0.14, 0.98, WHITE, -0.95, 0.42, 0); // the wedge nose
  box(body, 0.95, 0.22, 0.86, GLASS, 0.05, 0.72, 0); // cabin glass
  box(body, 0.5, 0.12, 0.84, WHITE, 0.62, 0.68, 0); // rear deck
  box(body, 2.32, 0.05, 1.07, BASE, 0, 0.42, 0); // stripe
  box(body, 0.06, 0.24, 1.02, DARK, 1.15, 0.33, 0); // dark rear diffuser
  box(body, 0.05, 0.05, 1.04, RED, 1.17, 0.56, 0, 0xcc0000); // full-width tail light bar
  box(body, 0.04, 0.04, 0.8, 0xffffff, -1.26, 0.42, 0, 0x777777); // headlight strip
  for (const [x, z] of [[-0.75, 0.53], [-0.75, -0.53], [0.8, 0.53], [0.8, -0.53]]) box(body, 0.42, 0.42, 0.12, DARK, x, 0.24, z); // wheels
  const plumes = [], rear = [];
  for (const [x, z] of [[-0.6, 0.3], [-0.6, -0.3], [0.6, 0.3], [0.6, -0.3]]) { // lift thrusters under the floor
    box(body, 0.22, 0.06, 0.22, 0x3a4150, x, 0.16, z, 0x1b3a7a);
    const flame = new THREE.Mesh(PLUME_GEO, FLAME); flame.position.set(x, 0.13, z); flame.scale.set(0.6, 0.5, 0.6);
    const plume = new THREE.Mesh(PLUME_GEO, PLUME); plume.position.set(x, 0.12, z);
    body.add(flame, plume);
    plumes.push({ plume, flame });
  }
  for (const z of [-0.36, -0.12, 0.12, 0.36]) { // four round outlets in the diffuser, the main thrust
    const n = new THREE.Mesh(NOZZLE, mat(0x2a2f3a, 0x10306a)); n.position.set(1.19, 0.3, z); body.add(n);
    const flame = new THREE.Mesh(PLUME_GEO, FLAME); flame.rotation.z = Math.PI / 2; flame.position.set(1.2, 0.3, z); flame.scale.set(0.4, 0.5, 0.4);
    body.add(flame);
    rear.push(flame);
  }
  return { g, plumes, rear };
}

// ---------- the site: runway, ramp, steel frame on one side, floodlights ----------
function makeSite() {
  const site = new THREE.Group();
  // the apron: a wide dark lot with long thin white lines crossing it, a pale concrete pad at the ramp's foot
  const AW = RUNWAY + 14, AD = 30, ax = -RUNWAY / 2 - 2;
  box(site, AW, 0.04, AD, 0x1f2227, ax, 0.02, 0);
  box(site, 6, 0.05, WIDTH + 1.6, 0xcfccc6, -2.2, 0.03, 0); // approach pad
  box(site, AW, 0.05, 0.1, 0xe8e8e8, ax, 0.05, 0); // centre line into the ramp
  for (const a of [0.42, -0.42]) { const l = box(site, AW * 1.05, 0.05, 0.08, 0xe8e8e8, ax - 4, 0.05, 0); l.rotation.y = a; } // the crossing lines
  // the barrier down the far side: a low wall with a red light strip, white dots, red glow on the ground,
  // and banks of white floodlights along it
  const bz = -AD / 2 + 1.5;
  box(site, AW, 0.5, 0.25, 0x2b2f36, ax, 0.25, bz);
  box(site, AW, 0.08, 0.27, RED, ax, 0.52, bz, 0xff1a1a);
  box(site, AW, 0.02, 2.4, 0x5a1414, ax, 0.045, bz + 1.4, 0x3a0606); // the glow it throws on the ground
  for (let x = ax - AW / 2 + 1; x < ax + AW / 2; x += 1.2) box(site, 0.1, 0.1, 0.1, 0xffffff, x, 0.62, bz, 0xffffff);
  for (const x of [ax - AW / 3, ax, ax + AW / 3]) {
    box(site, 0.2, 1.6, 0.2, 0x2b2f36, x, 0.8, bz - 0.5);
    box(site, 2.4, 0.5, 0.3, 0xffffff, x, 1.7, bz - 0.4, 0xffffff);
  }
  for (const z of [-3.2, 3.2]) box(site, 0.6, 0.35, 0.3, 0xffffff, -1, 0.3, z, 0xfff4cc); // lights at the ramp's foot
  // the ramp surface, slab by slab along the profile; red light on both edges, two white lane lines
  const N = 64, len = LTOTAL / N;
  for (let i = 0; i < N; i++) {
    const r = ramp((i + 0.5) * len);
    const at = (w, h, d, color, z, emissive) => { const m = box(site, w, h, d, color, r.x, r.y, z, emissive); m.rotation.z = r.phi; return m; };
    at(len + 0.05, 0.3, WIDTH, CONCRETE, 0);
    for (const z of [-WIDTH / 2 - 0.04, WIDTH / 2 + 0.04]) at(len + 0.05, 0.34, 0.08, RED, z, 0xcc0000);
    for (const z of [-0.45, 0.45]) at(len + 0.05, 0.31, 0.07, 0xffffff, z);
  }
  // the steel frame: one tower behind the wall, braced, and a gantry over the top curve
  const top = ramp(LTOTAL).y + 0.6, tx = R1 + 1.1;
  for (const dx of [0, 1.4]) for (const z of [-1.4, 1.4]) box(site, 0.28, top, 0.28, STEEL, tx + dx, top / 2, z);
  for (let y = 1; y < top - 0.5; y += 1.6) {
    for (const z of [-1.4, 1.4]) { const br = box(site, 2, 0.09, 0.09, STEEL, tx + 0.7, y + 0.8, z); br.rotation.z = (Math.floor(y / 1.6) % 2 ? 1 : -1) * 0.85; }
    box(site, 0.09, 0.09, 2.8, STEEL, tx + 0.7, y, 0);
  }
  const gx0 = ramp(LTOTAL).x - 0.5;
  for (const z of [-1.4, 1.4]) box(site, tx + 1.4 - gx0, 0.24, 0.24, STEEL, (tx + 1.4 + gx0) / 2, top, z);
  for (let x = gx0; x < tx + 1.4; x += 1) box(site, 0.12, 0.12, 2.8, STEEL, x, top, 0);
  return site;
}

export function createJetcars(city) {
  const group = new THREE.Group();
  city.root.add(group);
  const site = makeSite();
  group.add(site);
  const cars = Array.from({ length: CARS }, (_, i) => {
    const { g, plumes, rear } = makeJetcar();
    group.add(g);
    return { mesh: g, plumes, rear, off: (i * CYCLE) / CARS, pos: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), flying: false, stage: 'park', c: 0 };
  });
  city.jetcars = cars;

  // smoke: puffs left behind by the thrusters, and the burnout's clouds
  const PUFF = new THREE.SphereGeometry(0.5, 8, 6);
  const puffs = Array.from({ length: 140 }, () => {
    const m = new THREE.Mesh(PUFF, new THREE.MeshLambertMaterial({ color: 0xeef2f7, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; group.add(m);
    return { m, life: 0, grow: 1.4, rise: -0.6, fade: 0.45 };
  });
  let puffAt = 0;
  const puff = (p, big = false) => {
    const q = puffs[puffAt++ % puffs.length];
    q.m.position.copy(p); q.life = 1; q.m.visible = true;
    q.grow = big ? 3.4 : 1.4; q.rise = big ? 0.35 : -0.6; q.fade = big ? 0.32 : 0.45;
  };

  // where the site sits: west of the city, past its edge; moved out as the land grows
  let placedFor = -1, flight = null;
  function place() {
    const H = Math.max(2, city.land) * PITCH;
    site.position.set(-(H + R1 + 16), 0, 0);
    placedFor = city.land;
    const s = site.position, lip = ramp(LTOTAL), alt = 16 + H * 0.12;
    const out = new THREE.Vector3(Math.cos(lip.phi), Math.sin(lip.phi), 0);
    const p0 = new THREE.Vector3(lip.x, lip.y, 0).add(s);
    flight = new THREE.CatmullRomCurve3([
      p0,
      p0.clone().addScaledVector(out, 4).add(new THREE.Vector3(0, -1, 0)),
      s.clone().add(new THREE.Vector3(-8, alt - 4, 12)),
      new THREE.Vector3(-H * 0.4, alt, H * 0.75),
      new THREE.Vector3(H * 0.7, alt + 2, 0),
      new THREE.Vector3(-H * 0.4, alt, -H * 0.75),
      s.clone().add(new THREE.Vector3(-RUNWAY - 8, 7, -10)),
      s.clone().add(new THREE.Vector3(-RUNWAY / 2 - 6, 1.2, 6)),
      s.clone().add(SPOT),
    ], false, 'centripetal', 0.5);
  }

  // a car at c seconds into its cycle: P (position), UP (its roof), and stage / thrust / yaw (burnout)
  const P = new THREE.Vector3(), UP = new THREE.Vector3();
  const t1 = T_ROLL, t2 = t1 + T_RAMP, t3 = t2 + T_FLY, t4 = t3 + T_BURN;
  function at(c) {
    if (c < t1) { // down the runway, speeding up
      const u = c / t1;
      P.copy(SPOT).lerp(tmp.set(0, 0, 0), u * u).add(site.position); UP.set(0, 1, 0);
      return { stage: 'roll', thrust: 0.2 * u };
    }
    if (c < t2) { // up the ramp, over the top, along the lip
      const u = (c - t1) / T_RAMP, r = ramp(LTOTAL * (u * 0.85 + u * u * 0.15));
      P.set(r.x, r.y, 0).add(site.position); UP.set(-Math.sin(r.phi), Math.cos(r.phi), 0);
      return { stage: 'ramp', thrust: 0.35 + 0.5 * u };
    }
    if (c < t3) { // flying: right itself, a lap over the city, slow down to land
      const u = (c - t2) / T_FLY, e = u < 0.85 ? u : 0.85 + (1 - (1 - (u - 0.85) / 0.15) ** 2) * 0.15;
      P.copy(flight.getPointAt(Math.min(1, e)));
      const lip = ramp(LTOTAL).phi, roll = Math.min(1, u * 7);
      UP.set(-Math.sin(lip) * (1 - roll), Math.cos(lip) * (1 - roll) + roll, 0.3 * Math.sin(roll * Math.PI)).normalize();
      return { stage: 'fly', thrust: u > 0.93 ? 0.6 : 1 };
    }
    UP.set(0, 1, 0);
    P.copy(SPOT).add(site.position); // where it landed, until its next run
    if (c < t4) { // burnout: two smoky turns where it landed
      const u = (c - t3) / T_BURN;
      return { stage: 'burn', thrust: 0, yaw: Math.PI * 4 * (1 - (1 - u) ** 2) };
    }
    return { stage: 'park', thrust: 0, yaw: 0 };
  }

  const M = new THREE.Matrix4(), NEXT = new THREE.Vector3(), CUR = new THREE.Vector3(), LOOK = new THREE.Vector3(), tmp = new THREE.Vector3();
  function update(t, dt) {
    if (city.land !== placedFor) place();
    for (const car of cars) {
      const c = (t + car.off) % CYCLE;
      const now = at(c); CUR.copy(P); const up = UP.clone();
      if (now.yaw !== undefined) car.dir.set(Math.cos(now.yaw), 0, -Math.sin(now.yaw)); // on the spot: its heading is the spin
      else {
        at(Math.min(CYCLE - 0.001, c + 0.05)); NEXT.copy(P);
        if (NEXT.distanceToSquared(CUR) > 1e-8) car.dir.subVectors(NEXT, CUR).normalize();
      }
      car.pos.copy(CUR);
      car.flying = now.stage === 'fly'; car.stage = now.stage; car.c = c;
      // the model's nose is -x: a frame with +z along the travel and "up" kept, then turn -x onto +z
      LOOK.copy(CUR).sub(car.dir);
      M.lookAt(CUR, LOOK, up);
      car.mesh.quaternion.setFromRotationMatrix(M);
      car.mesh.rotateY(Math.PI / 2);
      car.mesh.position.copy(CUR);
      const flick = 0.85 + Math.sin(t * 40 + car.off * 7) * 0.15, on = now.thrust, lift = now.stage === 'fly' ? on : 0;
      for (const { plume, flame } of car.plumes) {
        plume.visible = flame.visible = lift > 0.05;
        plume.scale.set(0.9 + lift * 0.6, (0.6 + lift * 3.2) * flick, 0.9 + lift * 0.6);
        flame.scale.set(0.55, (0.3 + lift * 0.9) * flick, 0.55);
      }
      for (const f of car.rear) { f.visible = on > 0.05; f.scale.set(0.45, (0.3 + on * 1.6) * flick, 0.45); }
      if (on > 0.5 && Math.random() < dt * 18) puff(tmp.copy(CUR).addScaledVector(up, -0.6).addScaledVector(car.dir, 0.8));
      if (now.stage === 'burn' && Math.random() < dt * 30) puff(tmp.copy(CUR).addScaledVector(car.dir, 1.1).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3, (Math.random() - 0.5) * 0.8)), true);
    }
    for (const q of puffs) {
      if (!q.life) continue;
      q.life = Math.max(0, q.life - dt * q.fade);
      q.m.position.y += dt * q.rise;
      q.m.scale.setScalar(0.4 + (1 - q.life) * q.grow);
      q.m.material.opacity = q.life * 0.5;
      q.m.visible = q.life > 0;
    }
  }
  return { update };
}
