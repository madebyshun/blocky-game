import * as THREE from 'three';
import { hash, PITCH } from './sim.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const MATS = new Map();
const mat = (c, e) => {
  const key = `${c}|${e ?? ''}`;
  if (!MATS.has(key)) MATS.set(key, new THREE.MeshLambertMaterial({ color: c, emissive: e ?? 0x000000 }));
  return MATS.get(key);
};
function B(parent, w, h, d, color, x = 0, y = 0, z = 0, emissive) {
  const m = new THREE.Mesh(BOX, mat(color, emissive));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const PANTS = 0x34495e;
const BLOCK_COLORS = [0x0052ff, 0xf4c542, 0xe74c3c, 0x2ecc71, 0xf4f4f0, 0x9b59b6];

// Builders walk on the sidewalk edge of the roads (road centrelines sit at 8i + 4).
const road = (v) => Math.round((v - PITCH / 2) / PITCH) * PITCH + PITCH / 2 + 0.7;
const inLot = (v) => Math.abs(v - Math.round(v / PITCH) * PITCH) < 3.2;

function route(fx, fz, tx, tz) {
  const rx = road(fx), rz = road(tz);
  return [[rx, fz], [rx, rz], [tx, rz], [tx, tz]];
}

export class BuilderView {
  constructor(b, city, { arriving = false } = {}) {
    this.b = b;
    this.city = city;
    const g = (this.group = new THREE.Group());
    g.scale.setScalar(0.95);

    const leg = (x) => {
      const p = new THREE.Group();
      p.position.set(x, 0.38, 0);
      B(p, 0.18, 0.38, 0.22, PANTS, 0, -0.38);
      g.add(p);
      return p;
    };
    const arm = (x) => {
      const p = new THREE.Group();
      p.position.set(x, 0.78, 0);
      B(p, 0.13, 0.36, 0.16, b.shirt, 0, -0.36);
      B(p, 0.13, 0.1, 0.16, b.skin, 0, -0.46);
      g.add(p);
      return p;
    };
    this.legs = [leg(-0.11), leg(0.11)];
    B(g, 0.46, 0.42, 0.28, b.shirt, 0, 0.38);
    B(g, 0.48, 0.08, 0.3, 0xf39c12, 0, 0.62); // safety vest stripe
    this.arms = [arm(-0.3), arm(0.3)];
    B(g, 0.42, 0.42, 0.42, b.skin, 0, 0.8);
    B(g, 0.07, 0.09, 0.02, 0x111111, -0.1, 0.98, 0.215);
    B(g, 0.07, 0.09, 0.02, 0x111111, 0.1, 0.98, 0.215);
    // hard hat in the role colour
    B(g, 0.5, 0.16, 0.5, b.role.hat, 0, 1.2);
    B(g, 0.56, 0.04, 0.62, b.role.hat, 0, 1.2, 0.04);
    if (b.id === 1) B(g, 0.12, 0.12, 0.04, 0xf4c542, 0, 1.26, 0.27, 0xa07000); // founder badge

    this.carry = B(g, 0.38, 0.38, 0.38, BLOCK_COLORS[b.id % BLOCK_COLORS.length], 0, 0.55, 0.32);
    this.carry.visible = false;

    this.ring = B(g, 0.9, 0.04, 0.9, 0xffd23f, 0, 0.01, 0, 0x806000);
    this.ring.visible = false;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.9), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 0.8;
    hit.userData.builder = this;
    g.add(hit);
    this.hit = hit;

    this.speed = 2.2 + hash(b.id, 30) * 0.6;
    this.phase = hash(b.id, 31) * 10;
    this.step = 0;
    this.path = [];
    this.wait = 0;
    this.version = city.siteVersion;

    if (arriving) {
      g.position.set(city.helipad[0], 0, city.helipad[1]);
      this.go('toDepot');
    } else {
      // start somewhere along the loop so the crew is spread out on load
      const loaded = hash(b.id, 33) < 0.5;
      const [x, z] = loaded ? city.siteSpot(b.id * 97) : city.depotSpot(b.id);
      g.position.set(x, 0, z);
      this.go(loaded ? 'toDepot' : 'toSite');
      this.wait = hash(b.id, 34) * 2;
    }
    city.root.add(g);
  }

  get status() {
    return { toDepot: 'Fetching blocks', load: 'Loading blocks', toSite: 'Carrying blocks', place: 'Placing blocks', toBreak: 'Heading for coffee', break: 'Coffee break' }[this.mode];
  }

  go(mode) {
    const p = this.group.position, s = this.b.id * 1000 + this.step++;
    this.mode = mode;
    let target;
    if (mode === 'toDepot') target = this.city.depotSpot(s);
    else if (mode === 'toSite') target = this.city.siteSpot(s);
    else if (mode === 'toBreak') target = this.city.landmarkSpot('cafe', s);
    if (!target) return;
    this.path = route(p.x, p.z, target[0], target[1]);
    this.carry.visible = mode === 'toSite';
  }

  update(t, dt, onPlace) {
    const g = this.group, p = g.position;
    if (this.wait > 0) { this.wait -= dt; this.idle(t); return; }

    if (this.mode === 'toSite' && this.version !== this.city.siteVersion) {
      this.version = this.city.siteVersion; // the site moved on: re-route to the new one
      this.go('toSite');
    }

    if (this.mode === 'load') { this.go('toSite'); return; }
    if (this.mode === 'place') {
      onPlace?.(this);
      this.carry.visible = false;
      this.go(hash(this.b.id, this.step, 50) < 0.08 && this.city.landmarkSpot('cafe', 0) ? 'toBreak' : 'toDepot');
      return;
    }
    if (this.mode === 'break') { this.go('toDepot'); return; }

    const target = this.path[0];
    if (!target) {
      const next = { toDepot: 'load', toSite: 'place', toBreak: 'break' }[this.mode];
      this.mode = next;
      this.wait = next === 'break' ? 6 + hash(this.b.id, this.step, 51) * 8 : next === 'place' ? 0.9 : 0.6;
      return;
    }
    const dx = target[0] - p.x, dz = target[1] - p.z;
    const d = Math.hypot(dx, dz), v = this.speed * dt;
    if (d <= v) { p.x = target[0]; p.z = target[1]; this.path.shift(); }
    else { p.x += (dx / d) * v; p.z += (dz / d) * v; }
    if (d > 0.01) {
      let diff = Math.atan2(dx, dz) - g.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      g.rotation.y += diff * Math.min(1, dt * 10);
    }
    const ph = t * 10 + this.phase;
    const sw = Math.sin(ph) * 0.6;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    if (this.carry.visible) { this.arms[0].rotation.x = this.arms[1].rotation.x = -1.3; }
    else { this.arms[0].rotation.x = -sw; this.arms[1].rotation.x = sw; }
    p.y = (inLot(p.x) && inLot(p.z) ? 0.15 : 0) + Math.abs(Math.sin(ph)) * 0.05;
  }

  idle(t) {
    const ph = t * 8 + this.phase;
    this.legs[0].rotation.x = this.legs[1].rotation.x = 0;
    if (this.mode === 'place') {
      this.arms[0].rotation.x = -1.5 + Math.sin(ph) * 0.5;
      this.arms[1].rotation.x = -1.5 - Math.sin(ph) * 0.5;
    } else {
      this.arms[0].rotation.x = this.arms[1].rotation.x = this.carry.visible ? -1.3 : Math.sin(ph * 0.2) * 0.08;
    }
    const p = this.group.position;
    p.y = inLot(p.x) && inLot(p.z) ? 0.15 : 0;
  }

  setSelected(on) { this.ring.visible = on; }
}

// ---------- floating labels ----------

export class Floaters {
  constructor(parent) {
    this.parent = parent;
    this.items = [];
  }

  spawn(text, color, x, y, z, scale = 1) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 96;
    const ctx = cv.getContext('2d');
    ctx.font = '800 52px "Lilita One", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(text, 256, 50);
    ctx.fillStyle = color;
    ctx.fillText(text, 256, 50);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(4 * scale, 0.75 * scale, 1);
    sp.position.set(x, y, z);
    sp.renderOrder = 10;
    this.parent.add(sp);
    this.items.push({ sp, life: 0 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      it.sp.position.y += dt * 0.8;
      it.sp.material.opacity = Math.min(1, 3 * (2.2 - it.life));
      if (it.life > 2.2) {
        this.parent.remove(it.sp);
        it.sp.material.map.dispose();
        it.sp.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
