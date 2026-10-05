import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash, PITCH, riverCol } from './sim.js';

// Clouds drifting past the city and flocks of birds circling it (birds sleep at night).

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const CLOUD_MAT = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xb8c4d6, transparent: true, opacity: 0.85 });
const DAY_CLOUD = new THREE.Color(0xffffff), NIGHT_CLOUD = new THREE.Color(0x5b6a8f);
const DAY_GLOW = new THREE.Color(0xb8c4d6), NIGHT_GLOW = new THREE.Color(0x1a2033), STORM_CLOUD = new THREE.Color(0x7d8796);

function cloud(seed) {
  const geos = [];
  const n = 4 + Math.floor(hash(seed, 1) * 4);
  for (let i = 0; i < n; i++) {
    const w = 2 + hash(seed, i, 2) * 3, h = 0.9 + hash(seed, i, 3) * 1.1, d = 1.6 + hash(seed, i, 4) * 2;
    const g = UNIT.clone();
    g.scale(w, h, d);
    g.translate((i - n / 2) * 1.6 + hash(seed, i, 5), h / 2 + (i % 2) * 0.5, hash(seed, i, 6) * 2 - 1);
    geos.push(g);
  }
  return new THREE.Mesh(mergeGeometries(geos), CLOUD_MAT.clone()); // own material: each fades on its own
}

const BIRD_MAT = { dark: new THREE.MeshLambertMaterial({ color: 0x2b2f36 }), white: new THREE.MeshLambertMaterial({ color: 0xf4f4f0 }) };
const BEAK = new THREE.MeshLambertMaterial({ color: 0xf39c12 });

function bird(kind) {
  const g = new THREE.Group();
  const m = BIRD_MAT[kind];
  const body = new THREE.Mesh(UNIT, m); body.scale.set(0.22, 0.14, 0.5); g.add(body);
  const beak = new THREE.Mesh(UNIT, BEAK); beak.scale.set(0.06, 0.05, 0.12); beak.position.set(0, 0, 0.3); g.add(beak);
  const wing = (side) => {
    const p = new THREE.Group();
    p.position.x = side * 0.1;
    const w = new THREE.Mesh(UNIT, m); w.scale.set(0.5, 0.04, 0.22); w.position.x = side * 0.25;
    p.add(w); g.add(p);
    return p;
  };
  g.userData.wings = [wing(-1), wing(1)];
  return g;
}

// camera: clouds only show on the far side of the city, so they never hide the streets
export function createSky(city, camera) {
  const group = new THREE.Group();
  city.root.add(group);
  const clouds = [];
  const flocks = [];
  let builtFor = -1;

  function build() {
    builtFor = city.land;
    group.clear();
    clouds.length = 0;
    flocks.length = 0;
    const R = city.land * PITCH + 4;

    // clouds drift high over the countryside around the city, never over the streets
    const n = 8 + city.land * 2;
    for (let i = 0; i < n; i++) {
      const c = cloud(i + 1);
      c.userData = { a: (i / n) * Math.PI * 2 + hash(i, 8), r: R * (1.3 + hash(i, 7) * 0.9), y: 15 + hash(i, 9) * 8, speed: 0.015 + hash(i, 10) * 0.015 };
      group.add(c);
      clouds.push(c);
    }

    // flocks: V formations circling the city; gulls follow the river
    const nFlocks = 2 + Math.min(3, city.land - 1);
    for (let f = 0; f < nFlocks; f++) {
      const gull = f === 0;
      const size = gull ? 3 : 4 + Math.floor(hash(f, 11) * 3);
      const birds = [];
      for (let i = 0; i < size; i++) { const b = bird(gull ? 'white' : 'dark'); group.add(b); birds.push(b); }
      flocks.push({
        birds, gull,
        r: gull ? 0 : R * (0.5 + hash(f, 12) * 0.6),
        h: gull ? 5 : 11 + hash(f, 13) * 6,
        w: (gull ? 0.12 : 0.08 + hash(f, 14) * 0.06) * (f % 2 ? 1 : -1),
        a: hash(f, 15) * Math.PI * 2,
        cx: (hash(f, 16) - 0.5) * R * 0.4, cz: (hash(f, 17) - 0.5) * R * 0.4,
      });
    }
  }

  const pos = new THREE.Vector3(), ahead = new THREE.Vector3(), view = new THREE.Vector3();
  function flockPoint(fl, a, out) {
    if (fl.gull) { // glide up and down the river
      const j = Math.sin(a) * city.land;
      return out.set(riverCol(Math.round(j)) * PITCH + Math.sin(a * 3) * 2, fl.h + Math.sin(a * 2) * 0.6, j * PITCH);
    }
    return out.set(fl.cx + Math.cos(a) * fl.r, fl.h + Math.sin(a * 3) * 0.8, fl.cz + Math.sin(a) * fl.r);
  }

  function update(t, dt) {
    if (city.land !== builtFor && city.land > 0) build();
    const dl = city.env.daylight;
    const gloom = city.env.gloom || 0; // rain clouds turn grey
    CLOUD_MAT.color.copy(NIGHT_CLOUD).lerp(DAY_CLOUD, dl).lerp(STORM_CLOUD, gloom * 0.7);
    CLOUD_MAT.emissive.copy(NIGHT_GLOW).lerp(DAY_GLOW, dl).multiplyScalar(1 - gloom * 0.6);
    if (camera) camera.getWorldDirection(view).setY(0).normalize();
    for (const c of clouds) {
      const u = c.userData;
      u.a += u.speed * dt;
      c.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
      // fade in behind the city (seen from the camera), out as they drift round to the front
      const behind = camera ? (c.position.x * view.x + c.position.z * view.z) / u.r : 1;
      const m = c.material;
      m.opacity = 0.85 * THREE.MathUtils.smoothstep(behind, 0.15, 0.6);
      c.visible = m.opacity > 0.01;
      m.color.copy(CLOUD_MAT.color); m.emissive.copy(CLOUD_MAT.emissive);
    }
    const awake = dl > 0.25 && (city.env.gloom || 0) < 0.5; // birds sleep at night and shelter from the rain
    for (const fl of flocks) {
      fl.a += fl.w * dt;
      flockPoint(fl, fl.a, pos);
      flockPoint(fl, fl.a + Math.sign(fl.w) * 0.02, ahead);
      const dir = ahead.clone().sub(pos).normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      fl.birds.forEach((b, i) => {
        b.visible = awake;
        if (!awake) return;
        const row = Math.ceil(i / 2), s = i % 2 ? 1 : -1;
        b.position.copy(pos).addScaledVector(dir, -row * 0.9).addScaledVector(side, i ? s * row * 0.8 : 0);
        b.position.y += Math.sin(t * 2 + i) * 0.1;
        b.rotation.y = Math.atan2(dir.x, dir.z);
        const flap = Math.sin(t * (fl.gull ? 6 : 12) + i * 0.7) * 0.6;
        b.userData.wings[0].rotation.z = flap; b.userData.wings[1].rotation.z = -flap;
      });
    }
  }

  return { update };
}
