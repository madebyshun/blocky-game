import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash, riverCol, PITCH } from './sim.js';
import { GLOW_MAT } from './city.js';
import { makeService, flash } from './fleet.js';

// Cars and buses drive the paved road graph; boats idle on the river. Every finished service
// building sends its vehicles out on patrol: fire trucks, police cars, ambulances, garbage trucks.
const PATROL = { firestation: ['fire', 1, 4.5], police: ['police', 2, 5], hospital: ['ambulance', 1, 5], recycling: ['garbage', 1, 2.4] }; // vehicles per building, speed

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const BODY = new THREE.MeshLambertMaterial({ vertexColors: true });
const TAIL = new THREE.MeshLambertMaterial({ color: 0xff3b3b, emissive: 0x660000 });

function mesh(boxes, mat) {
  const geos = boxes.map(([w, h, d, x, y, z, color]) => {
    const g = UNIT.clone(); g.scale(w, h, d); g.translate(x, y + h / 2, z);
    if (color !== undefined) {
      const c = new THREE.Color(color), arr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), mat);
  m.castShadow = true;
  return m;
}

const CAR_COLORS = [0xe74c3c, 0x2e86de, 0xf1c40f, 0xf4f4f0, 0x2b2f36, 0x27ae60, 0x8e44ad, 0xe67e22];

function makeCar(seed) {
  const g = new THREE.Group();
  const bus = hash(seed, 1) < 0.15, taxi = !bus && hash(seed, 2) < 0.15;
  const color = bus ? 0x0052ff : taxi ? 0xf5c518 : CAR_COLORS[Math.floor(hash(seed, 3) * CAR_COLORS.length)];
  const L = bus ? 2.8 : 1.5;
  const boxes = [
    [L, 0.45, 0.8, 0, 0.18, 0, color],
    [bus ? L - 0.2 : 0.8, bus ? 0.5 : 0.38, 0.72, bus ? 0 : -0.1, 0.63, 0, bus ? color : 0x9fd8ff],
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [0.32, 0.32, 0.12, a * (L / 2 - 0.35), 0, b * 0.42, 0x1b1b1b]),
  ];
  if (bus) boxes.push([L - 0.4, 0.25, 0.74, 0, 0.75, 0, 0x9fd8ff]);
  if (taxi) boxes.push([0.3, 0.12, 0.2, -0.1, 1.01, 0, 0x2b2f36]);
  g.add(mesh(boxes, BODY));
  g.add(mesh([[0.06, 0.12, 0.16, L / 2, 0.35, -0.25], [0.06, 0.12, 0.16, L / 2, 0.35, 0.25]], GLOW_MAT));
  g.add(mesh([[0.06, 0.1, 0.14, -L / 2, 0.35, -0.25], [0.06, 0.1, 0.14, -L / 2, 0.35, 0.25]], TAIL));
  return g;
}

// Delivery Guy's van ($DGUY): navy with a blue stripe, DGUY on both sides, facing +x
const VAN_SIDE = (() => {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = '#121a33'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#2f7bff'; g.font = '900 54px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('DGUY', 128, 40);
  g.fillStyle = '#c8d3ea'; g.font = '700 17px Inter, system-ui, sans-serif'; g.fillText('OUT FOR DELIVERY', 128, 78);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: tex });
})();
function makeVan() {
  const g = new THREE.Group(), L = 1.9;
  g.add(mesh([
    [L, 0.85, 0.82, 0, 0.18, 0, 0x121a33],
    [L + 0.02, 0.13, 0.84, 0, 0.2, 0, 0x2f7bff],
    [0.06, 0.32, 0.68, L / 2, 0.6, 0, 0x9fd8ff],
    [0.4, 0.26, 0.84, L / 2 - 0.3, 0.62, 0, 0x9fd8ff],
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [0.34, 0.34, 0.12, a * (L / 2 - 0.4), 0, b * 0.42, 0x1b1b1b]),
  ], BODY));
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), VAN_SIDE);
    p.position.set(-0.3, 0.68, side * 0.415);
    if (side < 0) p.rotation.y = Math.PI;
    g.add(p);
  }
  g.add(mesh([[0.06, 0.12, 0.16, L / 2, 0.35, -0.26], [0.06, 0.12, 0.16, L / 2, 0.35, 0.26]], GLOW_MAT));
  g.add(mesh([[0.06, 0.1, 0.14, -L / 2, 0.35, -0.26], [0.06, 0.1, 0.14, -L / 2, 0.35, 0.26]], TAIL));
  return g;
}
// a parcel left at the roadside: drops off the van, sits a while, then it's picked up
const PARCEL = mesh([[0.34, 0.28, 0.3, 0, 0, 0, 0xc8a06a], [0.08, 0.29, 0.31, 0, 0, 0, 0x2f7bff]], BODY);

function makeBoat(seed) {
  const g = new THREE.Group();
  const sail = hash(seed, 4) < 0.5;
  const boxes = [
    [1.6, 0.3, 0.7, 0, 0, 0, 0xf4f4f0],
    [1.2, 0.12, 0.6, 0, 0.3, 0, 0xa67c52],
    [0.12, 0.08, 0.72, 0, 0.12, 0, hash(seed, 5) < 0.5 ? 0xe74c3c : 0x0052ff],
  ];
  if (sail) boxes.push([0.08, 1.6, 0.08, 0, 0.42, 0, 0x6e4b2a], [0.7, 1.2, 0.04, 0.35, 0.65, 0, 0xffffff]);
  else boxes.push([0.6, 0.35, 0.5, -0.2, 0.42, 0, 0xf4f4f0]);
  g.add(mesh(boxes, BODY));
  return g;
}

export function createTraffic(city) {
  const group = new THREE.Group();
  city.root.add(group);
  const cars = [];
  const boats = [];
  let boatLand = -1;

  function edges() { let n = 0; for (const a of city.graph.adj.values()) n += a.length; return n / 2; }

  function nextNode(car) {
    const opts = city.graph.adj.get(car.to) || [];
    const fwd = opts.filter((o) => o !== car.from);
    const list = fwd.length ? fwd : opts;
    return list[Math.floor(Math.random() * list.length)];
  }

  function spawnCar(seed, kind, speed) {
    const keys = [...city.graph.adj.keys()].filter((k) => city.graph.adj.get(k).length);
    if (!keys.length) return false;
    const from = keys[Math.floor(hash(seed, 9) * keys.length)];
    const adj = city.graph.adj.get(from);
    const car = { mesh: kind === 'dguy' ? makeVan() : kind ? makeService(kind) : makeCar(seed), kind, from, to: adj[Math.floor(hash(seed, 10) * adj.length)], t: hash(seed, 11), speed: speed ?? 3.5 + hash(seed, 12) * 2 };
    group.add(car.mesh);
    cars.push(car);
    return true;
  }
  function syncPatrols() {
    for (const [type, [kind, per, speed]] of Object.entries(PATROL)) {
      const want = Math.min(4, (city.counts[type] || 0) * per);
      let have = cars.filter((c) => c.kind === kind).length;
      while (have < want && spawnCar(have * 13 + kind.length * 101, kind, speed)) have++;
    }
  }

  // Delivery Guy's vans go out once its depot on Base Avenue is built; they stop now and then to drop a
  // parcel at the roadside. city.vans: for the film camera's van cam (src/cinematic.js)
  const vans = [], parcels = [];
  city.vans = vans;
  function syncVans() {
    const want = city.counts['hq-dguy'] ? 3 : 0;
    while (vans.length < want && spawnCar(vans.length * 31 + 7, 'dguy', 4.2)) vans.push(cars.at(-1));
  }
  function dropParcel(car, t) {
    const m = PARCEL.clone(), r = car.mesh.rotation.y;
    m.position.copy(car.mesh.position).add(new THREE.Vector3(Math.sin(r), 0, Math.cos(r)).multiplyScalar(0.75)); // the kerb on its side of the road
    m.rotation.y = r + (Math.random() - 0.5);
    group.add(m);
    parcels.push({ m, t0: t });
  }

  function syncBoats() {
    if (city.land === boatLand) return;
    boatLand = city.land;
    for (const b of boats) group.remove(b.mesh);
    boats.length = 0;
    const L = city.land;
    for (let j = -L; j <= L; j += 2) {
      if (hash(j, 77) < 0.35) continue;
      const i = riverCol(j);
      if (Math.abs(i) > L) continue;
      const b = { mesh: makeBoat(j), x: i * PITCH, z: j * PITCH, phase: hash(j, 78) * 6 };
      group.add(b.mesh);
      boats.push(b);
    }
  }

  const A = new THREE.Vector3(), B = new THREE.Vector3();
  function update(t, dt) {
    syncBoats();
    const want = Math.min(24, Math.floor(edges() / 2));
    for (let n = cars.filter((c) => !c.kind).length; n < want && spawnCar(cars.length * 7 + 3); n++);
    syncPatrols();
    syncVans();
    flash(t);
    for (let i = parcels.length - 1; i >= 0; i--) { // a parcel falls off the van, then waits for its owner
      const p = parcels[i], age = t - p.t0;
      p.m.position.y = 0.05 + Math.max(0, 0.9 - age * 3) * Math.max(0, 0.9 - age * 3);
      if (age > 8) { group.remove(p.m); parcels.splice(i, 1); }
    }
    for (const car of cars) {
      if (car.wait > 0) { car.wait -= dt; continue; } // stopped for a delivery
      const a = city.graph.nodes.get(car.from), b = city.graph.nodes.get(car.to);
      if (!a || !b) { car.mesh.visible = false; continue; }
      car.mesh.visible = true;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      car.t += (car.speed * dt) / len;
      if (car.t >= 1) {
        car.t = 0; const n = nextNode(car); car.from = car.to; car.to = n ?? car.from;
        if (car.kind === 'dguy' && Math.random() < 0.3) car.stopAt = 0.3 + Math.random() * 0.4; // a delivery on this street
        continue;
      }
      if (car.stopAt && car.t >= car.stopAt) { car.stopAt = 0; car.wait = 2.2; dropParcel(car, t); }
      A.set(a[0], 0, a[1]); B.set(b[0], 0, b[1]);
      const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
      car.mesh.position.lerpVectors(A, B, car.t);
      car.mesh.position.x += -dz * 0.5; // keep right
      car.mesh.position.z += dx * 0.5;
      car.mesh.position.y = 0.05;
      car.mesh.rotation.y = Math.atan2(-dz, dx);
    }
    for (const b of boats) { // slow drift up and down its stretch of river
      const s = Math.sin(t * 0.25 + b.phase);
      b.mesh.position.set(b.x + Math.cos(b.phase) * 0.8, -0.2, b.z + s * 2);
      b.mesh.rotation.y = Math.PI / 2 + (Math.cos(t * 0.25 + b.phase) > 0 ? 0 : Math.PI);
    }
  }

  return { update };
}
