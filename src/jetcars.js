// The Launch Pad: a stunt ramp past the edge of the city and three jet cars that use it. Each one
// rolls down the runway, rides up the curved ramp, leaves its lip, lights four thrusters and flies a
// lap over the city, then settles back on the runway. Render only (nothing here touches the sim).
// city.jetcars: the cars, for the film camera's jet cam (src/cinematic.js).
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

const WHITE = 0xf2f3f5, BASE = 0x0052ff, DARK = 0x16181d, GLASS = 0x1b2230, STEEL = 0x8f98a3, RED = 0xff2a2a;
const R = 7; // ramp radius
const ARC = (150 * Math.PI) / 180; // how far round the ramp goes
const LIP = 3; // straight run past the end of the arc
const RUNWAY = 26; // runway length before the ramp
const CYCLE = 30, CARS = 3;

// a low wedge sports car, nose toward -x: white body, dark glass, a Base-blue stripe, red tail bar,
// four thruster nozzles underneath (their plumes animate)
const PLUME = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.55, depthWrite: false });
const FLAME = new THREE.MeshBasicMaterial({ color: 0x8fc4ff, transparent: true, opacity: 0.9, depthWrite: false });
const PLUME_GEO = new THREE.ConeGeometry(0.22, 1, 10, 1, true).translate(0, -0.5, 0).rotateX(Math.PI); // tip up, opens downward
function makeJetcar() {
  const g = new THREE.Group(), body = new THREE.Group();
  g.add(body);
  box(body, 2.3, 0.28, 1.05, WHITE, 0, 0.32, 0); // floor pan
  box(body, 1.7, 0.2, 1.0, WHITE, 0.15, 0.52, 0); // body
  box(body, 0.6, 0.14, 0.98, WHITE, -0.95, 0.42, 0); // the wedge nose
  box(body, 0.95, 0.22, 0.86, GLASS, 0.05, 0.72, 0); // cabin glass
  box(body, 0.5, 0.12, 0.84, WHITE, 0.62, 0.68, 0); // rear deck
  box(body, 2.32, 0.05, 1.07, BASE, 0, 0.42, 0); // stripe
  box(body, 0.04, 0.06, 0.9, RED, 1.16, 0.56, 0, 0x990000); // tail light bar
  box(body, 0.04, 0.04, 0.8, 0xffffff, -1.26, 0.42, 0, 0x777777); // headlight strip
  for (const [x, z] of [[-0.75, 0.53], [-0.75, -0.53], [0.8, 0.53], [0.8, -0.53]]) box(body, 0.42, 0.42, 0.12, DARK, x, 0.24, z); // wheels
  const plumes = [];
  for (const [x, z] of [[-0.6, 0.3], [-0.6, -0.3], [0.6, 0.3], [0.6, -0.3]]) {
    box(body, 0.22, 0.06, 0.22, 0x3a4150, x, 0.16, z, 0x1b3a7a); // nozzle
    const flame = new THREE.Mesh(PLUME_GEO, FLAME); flame.position.set(x, 0.13, z); flame.scale.set(0.6, 0.5, 0.6);
    const plume = new THREE.Mesh(PLUME_GEO, PLUME); plume.position.set(x, 0.12, z);
    body.add(flame, plume);
    plumes.push({ plume, flame });
  }
  return { g, plumes };
}

// the stunt ramp: a quarter-and-more circle on a steel frame, red light along its edges, its lip
// hanging out over the runway; local frame: runway along +x into the ramp's foot at x = 0
function rampPoint(phi) { return new THREE.Vector3(R * Math.sin(phi), R - R * Math.cos(phi), 0); }
function makeSite() {
  const site = new THREE.Group();
  // runway: dark tarmac, a red light line down each side, white dashes
  box(site, RUNWAY + 8, 0.04, 4.6, 0x23262d, -RUNWAY / 2 + 2, 0.02, 0);
  for (const z of [-2.2, 2.2]) box(site, RUNWAY + 8, 0.05, 0.08, RED, -RUNWAY / 2 + 2, 0.05, z, 0xaa0000);
  for (let x = -RUNWAY; x < 0; x += 3) box(site, 1.2, 0.05, 0.12, 0xffffff, x, 0.05, 0);
  // the ramp surface, in short slabs following the arc, then the lip
  const steps = 30;
  for (let i = 0; i < steps; i++) {
    const a = (ARC * (i + 0.5)) / steps, p = rampPoint(a), len = (R * ARC) / steps + 0.06;
    const s = box(site, len, 0.3, 4, 0xe9e7e1, p.x, p.y, 0);
    s.rotation.z = a;
    for (const z of [-2.05, 2.05]) { const e = box(site, len, 0.36, 0.1, RED, p.x, p.y, z, 0xaa0000); e.rotation.z = a; }
    if (i % 3 === 1) { const l = box(site, len * 0.6, 0.31, 0.06, 0xbfbab0, p.x, p.y, -0.7); l.rotation.z = a; const l2 = l.clone(); l2.position.z = 0.7; site.add(l2); }
  }
  const end = rampPoint(ARC), dir = new THREE.Vector3(Math.cos(ARC), Math.sin(ARC), 0);
  const lip = box(site, LIP, 0.3, 4, 0xe9e7e1, end.x + dir.x * LIP / 2, end.y + dir.y * LIP / 2, 0);
  lip.rotation.z = ARC;
  for (const z of [-2.05, 2.05]) { const e = box(site, LIP, 0.36, 0.1, RED, lip.position.x, lip.position.y, z, 0xaa0000); e.rotation.z = ARC; }
  // the steel frame: two towers behind the ramp, a gantry over the top, cross braces
  const top = R * 2 + 1.2, tx = R + 1.4;
  for (const z of [-2.6, 2.6]) {
    box(site, 0.35, top, 0.35, STEEL, tx, top / 2, z);
    box(site, 0.35, top, 0.35, STEEL, tx + 1.6, top / 2, z);
    for (let y = 1.5; y < top; y += 2) {
      const br = box(site, 2.3, 0.1, 0.1, STEEL, tx + 0.8, y, z); br.rotation.z = (y / 2) % 2 < 1 ? 0.75 : -0.75;
      box(site, 1.6, 0.12, 0.12, STEEL, tx + 0.8, y + 1, z);
    }
  }
  for (let x = end.x - 1; x < tx + 1.8; x += 1.2) box(site, 0.18, 0.18, 5.4, STEEL, x, top, 0); // gantry
  box(site, tx + 1.8 - end.x + 1, 0.22, 0.22, STEEL, (tx + 1.8 + end.x - 1) / 2, top, -2.6);
  box(site, tx + 1.8 - end.x + 1, 0.22, 0.22, STEEL, (tx + 1.8 + end.x - 1) / 2, top, 2.6);
  // floodlights on poles along the runway
  for (const x of [-RUNWAY + 2, -RUNWAY / 2, -3]) for (const z of [-3.6, 3.6]) {
    box(site, 0.12, 3, 0.12, 0x2b2f36, x, 1.5, z);
    box(site, 0.5, 0.3, 0.3, 0xffffff, x, 3.1, z * 0.92, 0xfff4cc);
  }
  return site;
}

export function createJetcars(city) {
  const group = new THREE.Group();
  city.root.add(group);
  const site = makeSite();
  group.add(site);
  const cars = Array.from({ length: CARS }, (_, i) => {
    const { g, plumes } = makeJetcar();
    group.add(g);
    return { mesh: g, plumes, off: (i * CYCLE) / CARS, pos: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), flying: false };
  });
  city.jetcars = cars;

  // smoke puffs left behind by the thrusters
  const PUFF = new THREE.SphereGeometry(0.5, 8, 6);
  const puffs = Array.from({ length: 60 }, () => {
    const m = new THREE.Mesh(PUFF, new THREE.MeshLambertMaterial({ color: 0xe9eef5, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false; group.add(m);
    return { m, life: 0 };
  });
  let puffAt = 0;
  const puff = (p) => { const q = puffs[puffAt++ % puffs.length]; q.m.position.copy(p); q.life = 1; q.m.visible = true; };

  // where the site sits: west of the city, past its edge; moved out as the land grows
  let placedFor = -1, flight = null;
  const W = new THREE.Vector3();
  const toWorld = (v) => W.copy(v).add(site.position);
  function place() {
    const H = Math.max(2, city.land) * PITCH;
    site.position.set(-(H + R + 14), 0, 0);
    placedFor = city.land;
    // the lap over the city, in world space: from the lip, up and round over the city, back down to the runway's start
    const s = site.position, end = rampPoint(ARC), d = new THREE.Vector3(Math.cos(ARC), Math.sin(ARC), 0);
    const lipEnd = end.clone().addScaledVector(d, LIP).add(s), alt = 16 + H * 0.12;
    flight = new THREE.CatmullRomCurve3([
      lipEnd,
      lipEnd.clone().add(new THREE.Vector3(-5, 4, 0)),
      s.clone().add(new THREE.Vector3(-4, alt - 2, 14)),
      new THREE.Vector3(-H * 0.4, alt, H * 0.75),
      new THREE.Vector3(H * 0.7, alt + 2, 0),
      new THREE.Vector3(-H * 0.4, alt, -H * 0.75),
      s.clone().add(new THREE.Vector3(-RUNWAY - 6, 7, -10)),
      s.clone().add(new THREE.Vector3(-RUNWAY - 2, 1.2, 0)),
      s.clone().add(new THREE.Vector3(-RUNWAY, 0, 0)),
    ], false, 'centripetal', 0.5);
  }

  // a car's place at phase c (seconds into its cycle): position, heading and the "up" it keeps
  const P = new THREE.Vector3(), UP = new THREE.Vector3(), tmp = new THREE.Vector3();
  function at(c) {
    if (c < 4) { // roll down the runway, speeding up
      const u = c / 4;
      P.set(-RUNWAY + RUNWAY * u * u, 0, 0).add(site.position); UP.set(0, 1, 0);
      return { stage: 'roll', thrust: 0.15 * u };
    }
    if (c < 5.4) { // up the ramp
      const u = (c - 4) / 1.4, phi = ARC * u;
      P.copy(rampPoint(phi)).add(site.position);
      UP.set(-Math.sin(phi), Math.cos(phi), 0);
      return { stage: 'ramp', thrust: 0.3 };
    }
    if (c < 5.8) { // along the lip
      const u = (c - 5.4) / 0.4, d = tmp.set(Math.cos(ARC), Math.sin(ARC), 0);
      P.copy(rampPoint(ARC)).addScaledVector(d, LIP * u).add(site.position);
      UP.set(-Math.sin(ARC), Math.cos(ARC), 0);
      return { stage: 'ramp', thrust: 0.6 };
    }
    if (c < 26) { // flight: thrusters on, eased so it slows to land
      const u = (c - 5.8) / 20.2, e = u < 0.85 ? u : 0.85 + (1 - (1 - (u - 0.85) / 0.15) ** 2) * 0.15;
      P.copy(flight.getPointAt(Math.min(1, e)));
      const roll = Math.min(1, u * 6); // right itself after leaving the lip upside down
      UP.set(-Math.sin(ARC) * (1 - roll), Math.cos(ARC) * (1 - roll) + roll, 0).normalize();
      return { stage: 'fly', thrust: u > 0.92 ? 0.6 : 1 };
    }
    P.copy(site.position).add(tmp.set(-RUNWAY, 0, 0)); UP.set(0, 1, 0); // parked at the start
    return { stage: 'park', thrust: 0 };
  }

  const M = new THREE.Matrix4(), NEXT = new THREE.Vector3(), CUR = new THREE.Vector3(), LOOK = new THREE.Vector3();
  function update(t, dt) {
    if (city.land !== placedFor) place();
    for (const car of cars) {
      const c = (t + car.off) % CYCLE;
      const now = at(c); CUR.copy(P); const up = UP.clone();
      at(Math.min(CYCLE - 0.001, c + 0.05)); NEXT.copy(P);
      if (now.stage === 'park') NEXT.copy(CUR).add(tmp.set(1, 0, 0));
      if (NEXT.distanceToSquared(CUR) < 1e-8) NEXT.copy(CUR).add(car.dir);
      car.dir.subVectors(NEXT, CUR).normalize();
      car.pos.copy(CUR);
      car.flying = now.stage === 'fly';
      // the model's nose is -x: a frame with +z along the travel and "up" kept, then turn -x onto +z
      LOOK.copy(CUR).sub(car.dir);
      M.lookAt(CUR, LOOK, up);
      car.mesh.quaternion.setFromRotationMatrix(M);
      car.mesh.rotateY(Math.PI / 2);
      car.mesh.position.copy(CUR);
      const flick = 0.85 + Math.sin(t * 40 + car.off * 7) * 0.15;
      for (const { plume, flame } of car.plumes) {
        const on = now.thrust;
        plume.visible = flame.visible = on > 0.05;
        plume.scale.set(0.9 + on * 0.6, (0.6 + on * 3.2) * flick, 0.9 + on * 0.6);
        flame.scale.set(0.55, (0.3 + on * 0.9) * flick, 0.55);
      }
      if (now.thrust > 0.5 && Math.random() < dt * 18) puff(tmp.copy(CUR).addScaledVector(up, -0.6).addScaledVector(car.dir, 0.8));
    }
    for (const q of puffs) {
      if (!q.life) continue;
      q.life = Math.max(0, q.life - dt * 0.45);
      q.m.position.y -= dt * 0.6;
      q.m.scale.setScalar(0.5 + (1 - q.life) * 2.2);
      q.m.material.opacity = q.life * 0.45;
      q.m.visible = q.life > 0;
    }
  }
  return { update };
}
