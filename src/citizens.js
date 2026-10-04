import * as THREE from 'three';
import { B, SITES } from './world.js';
import { hash } from './sim.js';

const PANTS = 0x34495e;

// Local work spots per site (door side = +z). Falls back to the site's front.
const WORK = {
  farm: [[-1.5, -1.2], [-0.5, 0.2], [0.5, -0.7], [1.5, 0.8], [-1, 1.2]],
  mine: [[0, 2.1], [-0.9, 2.4], [0.9, 2.2]],
  market: [[-1.8, 1.3], [0, 1.3], [1.8, 1.3], [0.8, 2]],
  sawmill: [[0.3, 2.1], [-1.2, 1.9], [1.6, 2.2]],
  crane: [[1.2, 2.8], [0, 2.6], [-0.6, 1.4]],
  tower: [[0, 2.2], [0.8, 2.4]],
};

function toWorld(site, lx, lz) {
  const c = Math.cos(site.rot), s = Math.sin(site.rot);
  return [site.x + lx * c + lz * s, site.z - lx * s + lz * c];
}

function plazaSpot(seed) {
  const a = hash(seed, 1) * Math.PI * 2;
  const r = 2.4 + hash(seed, 2) * 0.8;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

function hat(g, job) {
  const y = 1.2;
  switch (job.id) {
    case 'miner':
      B(g, 0.5, 0.18, 0.5, 0xf5c518, 0, y);
      B(g, 0.14, 0.12, 0.06, 0xfff7b0, 0, y + 0.02, 0.26, { emissive: 0xffd000, shadow: false });
      break;
    case 'farmer':
      B(g, 0.8, 0.06, 0.8, 0xe8c547, 0, y);
      B(g, 0.42, 0.18, 0.42, 0xe8c547, 0, y + 0.06);
      break;
    case 'lumberjack':
      B(g, 0.46, 0.2, 0.46, 0xc0392b, 0, y - 0.04);
      B(g, 0.14, 0.12, 0.14, 0xf4f4f0, 0, y + 0.16);
      break;
    case 'builder':
      B(g, 0.5, 0.16, 0.5, 0xf39c12, 0, y);
      B(g, 0.56, 0.04, 0.6, 0xf39c12, 0, y, 0.04);
      break;
    default:
      B(g, 0.5, 0.04, 0.5, 0x1b2a49, 0, y);
      B(g, 0.34, 0.34, 0.34, 0x1b2a49, 0, y + 0.04);
      B(g, 0.35, 0.06, 0.35, job.hat, 0, y + 0.08);
  }
}

export class CitizenView {
  constructor(c, world, { arriving = false } = {}) {
    this.c = c;
    this.world = world;
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
      B(p, 0.13, 0.36, 0.16, c.shirt, 0, -0.36);
      B(p, 0.13, 0.1, 0.16, c.skin, 0, -0.46);
      g.add(p);
      return p;
    };
    this.legs = [leg(-0.11), leg(0.11)];
    B(g, 0.46, 0.42, 0.28, c.shirt, 0, 0.38);
    this.arms = [arm(-0.3), arm(0.3)];
    B(g, 0.42, 0.42, 0.42, c.skin, 0, 0.8);
    B(g, 0.07, 0.09, 0.02, 0x111111, -0.1, 0.98, 0.215, { shadow: false });
    B(g, 0.07, 0.09, 0.02, 0x111111, 0.1, 0.98, 0.215, { shadow: false });
    hat(g, c.job);

    this.ring = B(g, 0.9, 0.04, 0.9, 0xffd23f, 0, 0.01, 0, { emissive: 0x806000, shadow: false });
    this.ring.visible = false;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.9), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 0.8;
    hit.userData.citizen = this;
    g.add(hit);
    this.hit = hit;

    this.speed = 1.3 + hash(c.id, 30) * 0.5;
    this.phase = hash(c.id, 31) * 10;
    this.step = 0;
    this.path = [];
    this.wait = 0;
    this.mode = 'idle';
    this.site = null;

    if (arriving) {
      g.position.set(13.2, 0, 0.4);
      this.site = 'dock';
      this.path = [[SITES.dock.front[0], SITES.dock.front[1]]];
      this.mode = 'walk';
    } else {
      const [x, z, site] = this.pickTarget(true);
      g.position.set(x + hash(c.id, 32) - 0.5, 0, z + hash(c.id, 33) - 0.5);
      this.site = site;
      this.wait = hash(c.id, 34) * 4;
    }
    world.root.add(g);
  }

  pickTarget(initial = false) {
    const id = this.c.id, n = this.step++;
    const roll = hash(id, n, 40);
    const station = this.c.job.station;
    const unlocked = (s) => this.world.buildings[s]?.visible;
    let site;
    if (roll < 0.6 && unlocked(station)) site = station;
    else if (roll < 0.78 && unlocked('market')) site = 'market';
    else site = 'core';
    if (initial && site === 'core' && unlocked('hut') && roll > 0.9) site = 'hut';
    if (site === 'core') {
      const [x, z] = plazaSpot(id * 1000 + n);
      return [x, z, 'core'];
    }
    const s = SITES[site];
    const spots = WORK[site];
    if (!spots) return [s.front[0], s.front[1], site];
    const [lx, lz] = spots[Math.floor(hash(id, n, 41) * spots.length)];
    const [x, z] = toWorld(s, lx + (hash(id, n, 42) - 0.5) * 0.5, lz + (hash(id, n, 43) - 0.5) * 0.5);
    return [x, z, site];
  }

  // Walk along the star-shaped path network: site front -> plaza ring -> site front.
  planRoute(x, z, site) {
    const route = [];
    const p = this.group.position;
    if (site !== this.site) {
      const from = SITES[this.site] || SITES.core;
      const to = SITES[site];
      if (this.site && this.site !== 'core') route.push(from.front);
      const ring = (s) => { const a = Math.atan2(s.front[1], s.front[0]); return [Math.cos(a) * 2.8, Math.sin(a) * 2.8]; };
      if (from !== SITES.core) route.push(ring(from));
      if (to !== SITES.core) { route.push(ring(to)); route.push(to.front); }
    }
    route.push([x, z]);
    this.path = route.filter((q, i) => i > 0 || Math.hypot(q[0] - p.x, q[1] - p.z) > 0.2);
    this.site = site;
  }

  update(t, dt) {
    const g = this.group;
    const p = g.position;
    if (this.mode === 'walk') {
      const target = this.path[0];
      if (!target) {
        this.mode = this.site === 'core' ? 'idle' : 'work';
        this.wait = (this.mode === 'work' ? 5 : 3) + hash(this.c.id, this.step, 44) * 5;
      } else {
        const dx = target[0] - p.x, dz = target[1] - p.z;
        const d = Math.hypot(dx, dz);
        const v = this.speed * dt;
        if (d <= v) { p.x = target[0]; p.z = target[1]; this.path.shift(); }
        else { p.x += (dx / d) * v; p.z += (dz / d) * v; }
        const want = Math.atan2(dx, dz);
        let diff = want - g.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        g.rotation.y += diff * Math.min(1, dt * 10);
      }
    } else {
      this.wait -= dt;
      if (this.wait <= 0) {
        const [x, z, site] = this.pickTarget();
        this.planRoute(x, z, site);
        this.mode = 'walk';
      }
    }
    // dock planks are slightly raised
    p.y = p.x > 9.9 && Math.abs(p.z) < 1.15 ? 0.2 : 0;

    const ph = t * 9 + this.phase;
    if (this.mode === 'walk') {
      const s = Math.sin(ph) * 0.6;
      this.legs[0].rotation.x = s; this.legs[1].rotation.x = -s;
      this.arms[0].rotation.x = -s; this.arms[1].rotation.x = s;
      p.y += Math.abs(Math.sin(ph)) * 0.05;
    } else if (this.mode === 'work') {
      this.legs[0].rotation.x = this.legs[1].rotation.x = 0;
      this.arms[0].rotation.x = -1.2 + Math.sin(ph * 0.8) * 0.8;
      this.arms[1].rotation.x = -0.3;
    } else {
      this.legs[0].rotation.x = this.legs[1].rotation.x = 0;
      this.arms[0].rotation.x = this.arms[1].rotation.x = Math.sin(ph * 0.2) * 0.08;
    }
  }

  setSelected(on) { this.ring.visible = on; }
}

// ---------- floating "+$0.12" labels ----------

export class Floaters {
  constructor(parent) {
    this.parent = parent;
    this.items = [];
  }

  spawn(text, color, x, y, z) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.font = '800 40px "Lilita One", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(text, 128, 34);
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(2.4, 0.6, 1);
    sp.position.set(x, y, z);
    sp.renderOrder = 10;
    this.parent.add(sp);
    this.items.push({ sp, life: 0 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life += dt;
      it.sp.position.y += dt * 0.7;
      it.sp.material.opacity = Math.min(1, 3 * (1.8 - it.life));
      if (it.life > 1.8) {
        this.parent.remove(it.sp);
        it.sp.material.map.dispose();
        it.sp.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
