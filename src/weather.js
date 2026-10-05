import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PITCH } from './sim.js';

// The city's weather follows $BLOCKY's 24h price change: storms when it dumps, sun when it pumps,
// fireworks on a bull run. Big buys get a fireworks burst over the Statue of Blockerty.

export const WEATHER = {
  storm: { icon: '⛈️', label: 'Storm', gloom: 0.85, rain: 1, lightning: true },
  rain: { icon: '🌧️', label: 'Rain', gloom: 0.55, rain: 0.55 },
  cloudy: { icon: '⛅', label: 'Cloudy', gloom: 0.28, rain: 0 },
  sunny: { icon: '☀️', label: 'Sunny', gloom: 0, rain: 0 },
  bull: { icon: '🎆', label: 'Bull run', gloom: 0, rain: 0, fireworks: true },
};

const forced = new URLSearchParams(location.search).get('weather'); // ?weather=storm for testing/recording

export function weatherFor(change24h) {
  if (forced && WEATHER[forced]) return forced;
  if (typeof change24h !== 'number' || Number.isNaN(change24h)) return 'sunny';
  if (change24h <= -15) return 'storm';
  if (change24h < -2) return 'rain';
  if (change24h < 2) return 'cloudy';
  if (change24h < 15) return 'sunny';
  return 'bull';
}

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const SPARK_COLORS = [0xffd23f, 0xff5c8a, 0x4dd0ff, 0x7cff6b, 0xffffff, 0x0052ff];

export function createWeather(city) {
  const env = city.env;
  env.gloom = 0;
  env.flash = 0;
  let kind = 'sunny';

  // rain: thin falling streaks over the whole land
  const RAIN = 900;
  const rain = new THREE.InstancedMesh(UNIT, new THREE.MeshBasicMaterial({ color: 0xb8d4ff, transparent: true, opacity: 0.55 }), RAIN);
  rain.frustumCulled = false;
  rain.count = 0;
  const drops = Array.from({ length: RAIN }, () => new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 26, Math.random() * 2 - 1));
  city.root.add(rain);

  // fireworks: voxel sparks with gravity
  const SPARKS = 600;
  const sparkMesh = new THREE.InstancedMesh(UNIT, new THREE.MeshBasicMaterial({ color: 0xffffff }), SPARKS);
  sparkMesh.frustumCulled = false;
  sparkMesh.count = 0;
  city.root.add(sparkMesh);
  const sparks = [];
  const color = new THREE.Color();

  function burst(x, y, z, n = 46) {
    const c = SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)];
    for (let i = 0; i < n && sparks.length < SPARKS; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(4 + Math.random() * 3);
      sparks.push({ p: new THREE.Vector3(x, y, z), v, life: 1.4 + Math.random() * 0.6, c });
    }
  }
  const statue = CONFIG.landmarks.find((l) => l.id === 'liberty')?.lot ?? [0, 0];
  function celebrate() { // a volley over the city icon
    for (let i = 0; i < 3; i++) setTimeout(() => burst(statue[0] * PITCH + (Math.random() - 0.5) * 6, 14 + Math.random() * 4, statue[1] * PITCH + (Math.random() - 0.5) * 6), i * 350);
  }

  let boltIn = 3, popIn = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), dropScale = new THREE.Vector3(0.04, 0.7, 0.04);

  function update(t, dt) {
    const w = WEATHER[kind];
    env.gloom += (w.gloom - env.gloom) * Math.min(1, dt * 0.8);
    env.flash = Math.max(0, env.flash - dt * 5);
    const H = Math.max(2, city.land) * PITCH + 4;

    // rain
    const want = Math.floor(RAIN * (w.rain || 0));
    rain.count += Math.sign(want - rain.count) * Math.min(Math.abs(want - rain.count), Math.ceil(RAIN * dt));
    for (let i = 0; i < rain.count; i++) {
      const d = drops[i];
      d.y -= dt * 30;
      if (d.y < 0) d.y += 26;
      m4.compose(sc.set(d.x * H, d.y, d.z * H), q, dropScale);
      rain.setMatrixAt(i, m4);
    }
    rain.instanceMatrix.needsUpdate = true;

    // lightning
    if (w.lightning && (boltIn -= dt) <= 0) { env.flash = 1; boltIn = 3 + Math.random() * 5; }

    // fireworks
    if (w.fireworks && (popIn -= dt) <= 0) {
      burst((Math.random() - 0.5) * H * 1.4, 13 + Math.random() * 6, (Math.random() - 0.5) * H * 1.4);
      popIn = 0.6 + Math.random() * 0.8;
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      s.v.y -= 5 * dt;
      s.v.multiplyScalar(1 - dt * 0.8);
      s.p.addScaledVector(s.v, dt);
    }
    sparkMesh.count = sparks.length;
    sparks.forEach((s, i) => {
      const k = Math.min(1, s.life) * 0.22;
      m4.compose(s.p, q, sc.set(k, k, k));
      sparkMesh.setMatrixAt(i, m4);
      sparkMesh.setColorAt(i, color.setHex(s.c));
    });
    sparkMesh.instanceMatrix.needsUpdate = true;
    if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
  }

  return {
    update,
    celebrate,
    setMarket(m) { kind = weatherFor(m?.change24h); },
    get kind() { return kind; },
  };
}
