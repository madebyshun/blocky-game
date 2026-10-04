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

const HAIR = [0x2b1d14, 0x5a3a1a, 0xd9a441, 0xa0522d, 0x1b1b1b, 0x9aa3ad];

// Hand-made looks for legendary Blockies (assigned in CONFIG.legends). Head: y 0.8-1.22, face at z 0.21.
const eyes = (g, c = 0x111111) => { B(g, 0.07, 0.09, 0.02, c, -0.1, 0.98, 0.215); B(g, 0.07, 0.09, 0.02, c, 0.1, 0.98, 0.215); };
export const LEGEND_LOOKS = {
  // the founder: dark shoulder-length hair with bangs, sleepy round eyes, moustache and beard,
  // an earring, a mint striped tee and a bracelet
  founder: {
    skin: 0xf6d5cf, shirt: 0x52c49a,
    dress(g, arms) {
      const hair = 0x2b2420, stripe = 0x9be6c8;
      B(g, 0.48, 0.14, 0.48, hair, 0, 1.18, -0.02); // top
      B(g, 0.44, 0.13, 0.05, hair, 0, 1.07, 0.215); // bangs
      B(g, 0.08, 0.52, 0.42, hair, -0.25, 0.68, -0.04); B(g, 0.08, 0.52, 0.42, hair, 0.25, 0.68, -0.04); // sides
      B(g, 0.5, 0.58, 0.08, hair, 0, 0.62, -0.24); // back
      B(g, 0.1, 0.07, 0.3, hair, -0.32, 0.64, -0.06); B(g, 0.1, 0.07, 0.3, hair, 0.32, 0.64, -0.06); // flicked ends
      for (const x of [-0.1, 0.1]) {
        B(g, 0.12, 0.12, 0.02, 0xffffff, x, 0.9, 0.215);
        B(g, 0.045, 0.045, 0.025, 0x111111, x, 0.92, 0.218);
        B(g, 0.13, 0.04, 0.025, 0xe0b3ab, x, 0.99, 0.219); // heavy lids
      }
      B(g, 0.06, 0.05, 0.03, 0xeec2ba, 0, 0.86, 0.225); // nose
      B(g, 0.22, 0.05, 0.025, hair, 0, 0.83, 0.218); // moustache
      B(g, 0.32, 0.1, 0.03, hair, 0.02, 0.76, 0.215); B(g, 0.03, 0.14, 0.3, hair, -0.215, 0.76, 0.06); B(g, 0.03, 0.14, 0.3, hair, 0.215, 0.76, 0.06); // beard
      B(g, 0.03, 0.07, 0.03, 0xd5d8dc, -0.225, 0.84, 0.04); // earring
      for (const y of [0.44, 0.54, 0.66, 0.74]) B(g, 0.47, 0.03, 0.29, stripe, 0, y); // striped tee
      for (const a of arms) B(a, 0.135, 0.03, 0.165, stripe, 0, -0.2);
      B(arms[1], 0.14, 0.035, 0.17, 0x2b2f36, 0, -0.39); // bracelet
    },
  },
  // blue hard hat, golden halo, purple ski goggles, party blower, white tee with a blue sash
  halo: {
    skin: 0xf3e3a6, shirt: 0xf4f4f0,
    dress(g) {
      B(g, 0.5, 0.16, 0.5, 0x1f4fd1, 0, 1.2); B(g, 0.56, 0.04, 0.62, 0x1f4fd1, 0, 1.2, 0.04); B(g, 0.08, 0.07, 0.5, 0x163ba3, 0, 1.36);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 6, 20), mat(0xf4c542, 0x8a6a00));
      halo.rotation.x = Math.PI / 2; halo.position.y = 1.58;
      g.add(halo);
      B(g, 0.46, 0.1, 0.46, 0x2b2f36, 0, 0.9); // goggle strap
      B(g, 0.38, 0.16, 0.05, 0xb06be0, 0, 0.89, 0.22, 0x3a1a55); // purple lens
      B(g, 0.38, 0.03, 0.06, 0x2b2f36, 0, 1.04, 0.22);
      [0xe74c3c, 0x2ecc71, 0xf4c542, 0xe74c3c].forEach((c, i) => B(g, 0.05, 0.05, 0.09, c, 0.03, 0.84, 0.25 + i * 0.09)); // party blower
      const sash = B(g, 0.14, 0.62, 0.32, 0x1f4fd1, 0.02, 0.32, 0);
      sash.rotation.z = -0.65;
    },
  },
  // wild blonde hair, eyeshadow, dark lips, a vape with a blue tip
  punk: {
    skin: 0xb08a63, shirt: 0x2b2f36,
    dress(g) {
      const blonde = 0xfff3a0;
      B(g, 0.6, 0.26, 0.56, blonde, 0, 1.14, -0.04);
      B(g, 0.14, 0.44, 0.5, blonde, -0.27, 0.76, -0.04); B(g, 0.14, 0.44, 0.5, blonde, 0.27, 0.76, -0.04);
      B(g, 0.52, 0.52, 0.14, blonde, 0, 0.7, -0.25);
      for (const [x, y, z, s] of [[-0.3, 1.34, 0, 0.18], [0.24, 1.38, -0.08, 0.2], [0, 1.42, 0.08, 0.16], [0.36, 1.18, 0.1, 0.16], [-0.38, 1.08, -0.12, 0.16], [0.1, 1.36, -0.24, 0.16]]) B(g, s, s, s, blonde, x, y, z);
      eyes(g);
      B(g, 0.1, 0.04, 0.02, 0x8b5a2b, -0.1, 1.05, 0.216); B(g, 0.1, 0.04, 0.02, 0x8b5a2b, 0.1, 1.05, 0.216);
      B(g, 0.12, 0.04, 0.02, 0x6b1a10, -0.02, 0.87, 0.216);
      B(g, 0.32, 0.05, 0.05, 0x555555, 0.16, 0.86, 0.25);
      B(g, 0.05, 0.05, 0.05, 0x0052ff, 0.34, 0.86, 0.25, 0x0030ff);
    },
  },
  // golden Spartan helmet, black crest, glowing X eyes, tongue out with a pill, Base-blue square logo tee
  spartan: {
    skin: 0x4a3a36, shirt: 0x2a2f38,
    dress(g) {
      const gold = 0xc9a227;
      B(g, 0.48, 0.46, 0.48, gold, 0, 0.79);
      B(g, 0.1, 0.24, 0.02, 0x0b0b10, 0, 0.8, 0.245); B(g, 0.34, 0.1, 0.02, 0x0b0b10, 0, 0.96, 0.245); // T visor
      B(g, 0.07, 0.07, 0.025, 0xff3ea5, -0.09, 0.975, 0.25, 0xa0105a); B(g, 0.07, 0.07, 0.025, 0x3ad6e8, 0.09, 0.975, 0.25, 0x0a7a8a);
      for (let i = 0; i < 6; i++) B(g, 0.1, 0.22 + (i % 2) * 0.06, 0.1, 0x2b1d14, 0, 1.25, -0.25 + i * 0.1); // crest
      for (const [x, y, z] of [[-0.3, 0.9, -0.2], [0.3, 0.95, -0.22], [-0.25, 1.15, -0.28], [0.22, 1.18, -0.3]]) B(g, 0.14, 0.14, 0.14, 0x2b1d14, x, y, z);
      B(g, 0.09, 0.08, 0.07, 0xff7aa8, 0, 0.8, 0.26); B(g, 0.06, 0.03, 0.05, 0xf4f4f0, 0, 0.88, 0.27); // tongue + pill
      B(g, 0.06, 0.18, 0.18, 0x3ad6e8, -0.27, 0.85, 0);
      B(g, 0.22, 0.22, 0.02, 0x2e5bff, 0, 0.45, 0.145); B(g, 0.1, 0.1, 0.025, 0x2a2f38, 0, 0.51, 0.146); // logo
    },
  },
  // blue robot with a gold crown, black glasses, silver ear, black suit and blue tie
  robo: {
    skin: 0xa9c4e8, shirt: 0x1b1b1b,
    dress(g) {
      B(g, 0.43, 0.1, 0.43, 0x8fb0d8, 0, 0.8); // jaw plate
      B(g, 0.17, 0.13, 0.03, 0x111111, -0.1, 0.95, 0.22); B(g, 0.17, 0.13, 0.03, 0x111111, 0.1, 0.95, 0.22);
      B(g, 0.11, 0.07, 0.035, 0xd6ecff, -0.1, 0.98, 0.222); B(g, 0.11, 0.07, 0.035, 0xd6ecff, 0.1, 0.98, 0.222);
      B(g, 0.06, 0.22, 0.22, 0xd5d8dc, -0.24, 0.88, -0.02); B(g, 0.07, 0.1, 0.1, 0x8a96a3, -0.26, 0.94, -0.02);
      const gold = 0xf4c542;
      B(g, 0.46, 0.12, 0.46, gold, 0, 1.22);
      for (const [x, z] of [[-0.19, 0.19], [0, 0.19], [0.19, 0.19], [-0.19, -0.19], [0.19, -0.19]]) { B(g, 0.07, 0.14, 0.07, gold, x, 1.34, z); B(g, 0.08, 0.08, 0.08, gold, x, 1.48, z, 0x6a5000); }
      B(g, 0.14, 0.42, 0.02, 0xf4f4f0, 0, 0.38, 0.141); B(g, 0.07, 0.34, 0.025, 0x1f4fd1, 0, 0.42, 0.146); // shirt + tie
      B(g, 0.05, 0.05, 0.02, gold, 0.15, 0.68, 0.142);
    },
  },
  // grey hoodie pulled up, 3D glasses
  hoodie: {
    skin: 0xd9a978, shirt: 0x4a4a4a,
    dress(g) {
      const hood = 0x4a4a4a;
      B(g, 0.5, 0.5, 0.1, hood, 0, 0.78, -0.25);
      B(g, 0.06, 0.5, 0.46, hood, -0.24, 0.78, -0.02); B(g, 0.06, 0.5, 0.46, hood, 0.24, 0.78, -0.02);
      B(g, 0.52, 0.1, 0.5, hood, 0, 1.22, -0.02); B(g, 0.22, 0.1, 0.3, hood, 0, 1.32, -0.06);
      B(g, 0.44, 0.14, 0.03, 0xf4f4f0, 0, 0.92, 0.225);
      B(g, 0.14, 0.09, 0.035, 0x2e86de, -0.1, 0.945, 0.23); B(g, 0.14, 0.09, 0.035, 0xe74c3c, 0.1, 0.945, 0.23);
      B(g, 0.1, 0.03, 0.02, 0x5a3a1a, 0.02, 0.85, 0.216);
    },
  },
};

// One Blocky: a little builder in a safety vest, dressed for its role.
// Returns the group plus the parts that animate (legs, arms) and the block it carries.
export function buildBlocky(b) {
  const g = new THREE.Group();
  g.scale.setScalar(0.95);
  const role = b.role.id;
  const look = b.legend ? LEGEND_LOOKS[b.legend.look] : null;
  const hair = HAIR[Math.floor(hash(b.id, 17) * HAIR.length)];
  const shirt = look ? look.shirt : role === 'research' ? 0xf4f4f0 : role === 'contracts' ? 0x3b4252 : b.shirt;
  const skin = look ? look.skin : b.skin;

  const leg = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 0.38, 0);
    B(p, 0.18, 0.38, 0.22, PANTS, 0, -0.38);
    B(p, 0.19, 0.08, 0.26, 0x2b2f36, 0, -0.38, 0.02); // shoes
    g.add(p);
    return p;
  };
  const arm = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 0.78, 0);
    B(p, 0.13, 0.36, 0.16, shirt, 0, -0.36);
    B(p, 0.13, 0.1, 0.16, skin, 0, -0.46);
    g.add(p);
    return p;
  };
  const legs = [leg(-0.11), leg(0.11)];
  B(g, 0.46, 0.42, 0.28, shirt, 0, 0.38);
  if (!look) B(g, 0.48, 0.08, 0.3, 0xf39c12, 0, 0.62); // safety vest stripe
  const arms = [arm(-0.3), arm(0.3)];
  B(g, 0.42, 0.42, 0.42, skin, 0, 0.8);
  if (look) {
    look.dress(g, arms);
    const carry = B(g, 0.38, 0.38, 0.38, BLOCK_COLORS[b.id % BLOCK_COLORS.length], 0, 0.55, 0.32);
    carry.visible = false;
    return { group: g, legs, arms, carry };
  }
  B(g, 0.07, 0.09, 0.02, 0x111111, -0.1, 0.98, 0.215);
  B(g, 0.07, 0.09, 0.02, 0x111111, 0.1, 0.98, 0.215);
  B(g, 0.44, 0.12, 0.1, hair, 0, 1.1, -0.17); // hair at the back

  const hardHat = (c) => { B(g, 0.5, 0.16, 0.5, c, 0, 1.2); B(g, 0.56, 0.04, 0.62, c, 0, 1.2, 0.04); };
  const cap = (c, back = false) => { B(g, 0.46, 0.13, 0.46, c, 0, 1.2); B(g, 0.4, 0.04, 0.24, c, 0, 1.2, back ? -0.32 : 0.32); };
  switch (role) {
    case 'founder':
      cap(b.role.hat);
      B(g, 0.12, 0.12, 0.04, 0xf4c542, 0, 1.24, 0.24, 0xa07000);
      B(g, 0.1, 0.1, 0.03, 0xf4c542, -0.12, 0.5, 0.15, 0xa07000); // badge
      break;
    case 'contracts':
      hardHat(b.role.hat);
      B(g, 0.46, 0.3, 0.12, shirt, 0, 0.8, -0.25); // hood
      B(g, 0.36, 0.42, 0.18, 0x2e86de, 0, 0.32, -0.23); // backpack
      break;
    case 'frontend':
      B(g, 0.44, 0.1, 0.44, hair, 0, 1.2); // hair on top
      B(g, 0.5, 0.07, 0.1, 0x2b2f36, 0, 1.28, 0);
      B(g, 0.08, 0.2, 0.2, b.role.hat, -0.25, 0.92, 0); B(g, 0.08, 0.2, 0.2, b.role.hat, 0.25, 0.92, 0);
      break;
    case 'designer':
      B(g, 0.52, 0.1, 0.5, b.role.hat, 0.04, 1.2); B(g, 0.08, 0.08, 0.08, b.role.hat, 0.04, 1.3, 0);
      B(g, 0.48, 0.08, 0.32, 0xff6b9d, 0, 0.74); B(g, 0.1, 0.22, 0.04, 0xff6b9d, 0.12, 0.54, 0.16); // scarf
      break;
    case 'community':
      cap(b.role.hat, true);
      B(arms[1], 0.12, 0.12, 0.26, 0xf4f4f0, 0, -0.56, 0.12); B(arms[1], 0.18, 0.18, 0.08, 0xe74c3c, 0, -0.59, 0.27); // megaphone
      break;
    case 'research':
      B(g, 0.44, 0.1, 0.44, hair, 0, 1.2);
      B(g, 0.15, 0.12, 0.02, 0x111111, -0.1, 0.94, 0.225); B(g, 0.15, 0.12, 0.02, 0x111111, 0.1, 0.94, 0.225); // glasses
      B(g, 0.06, 0.03, 0.02, 0x111111, 0, 0.99, 0.225);
      B(g, 0.08, 0.3, 0.02, b.role.hat, 0, 0.42, 0.15); // tie
      B(arms[0], 0.04, 0.32, 0.24, 0x8b5a2b, 0.08, -0.6, 0.1); B(arms[0], 0.03, 0.26, 0.2, 0xf4f4f0, 0.1, -0.57, 0.1); // clipboard
      break;
  }

  const carry = B(g, 0.38, 0.38, 0.38, BLOCK_COLORS[b.id % BLOCK_COLORS.length], 0, 0.55, 0.32);
  carry.visible = false;
  return { group: g, legs, arms, carry };
}

export class BuilderView {
  constructor(b, city, { arriving = false } = {}) {
    this.b = b;
    this.city = city;
    const { group: g, legs, arms, carry } = buildBlocky(b);
    this.group = g;
    this.legs = legs;
    this.arms = arms;
    this.carry = carry;

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
    if (this.city.waiting && (this.mode === 'toBreak' || this.mode === 'break')) return 'Waiting for more Blockies';
    return { toDepot: 'Fetching blocks', load: 'Loading blocks', toSite: 'Carrying blocks', place: 'Placing blocks', toBreak: 'Taking a break', break: 'Taking a break' }[this.mode];
  }

  go(mode) {
    const p = this.group.position, s = this.b.id * 1000 + this.step++;
    if (this.city.waiting && (mode === 'toSite' || mode === 'toDepot')) mode = 'toBreak'; // land is full: chill until it can expand
    this.mode = mode;
    const target = mode === 'toDepot' ? this.city.depotSpot(s) : mode === 'toSite' ? this.city.siteSpot(s) : this.city.chillSpot(s);
    this.path = route(p.x, p.z, target[0], target[1]);
    this.carry.visible = mode === 'toSite';
  }

  update(t, dt) {
    const g = this.group, p = g.position;
    if (this.wait > 0) { this.wait -= dt; this.idle(t); return; }

    if (this.mode === 'toSite' && this.version !== this.city.siteVersion) {
      this.version = this.city.siteVersion; // the site moved on: re-route to the new one
      this.go('toSite');
    }

    if (this.mode === 'load') { this.go('toSite'); return; }
    if (this.mode === 'place') {
      this.carry.visible = false;
      this.go(hash(this.b.id, this.step, 50) < 0.06 ? 'toBreak' : 'toDepot');
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
