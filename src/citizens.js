import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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

// Builders walk on the sidewalk edge of the roads (road centrelines sit at 8i + 4),
// never along the rim of the land.
function road(v, land) {
  let r = Math.round((v - PITCH / 2) / PITCH) * PITCH + PITCH / 2 + 0.7;
  const lim = land * PITCH + 4 - 1.5;
  while (Math.abs(r) > lim) r -= Math.sign(r) * PITCH;
  return r;
}
const inLot = (v) => Math.abs(v - Math.round(v / PITCH) * PITCH) < 3.2;

function route(fx, fz, tx, tz, land) {
  const rx = road(fx, land), rz = road(tz, land);
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
  // white pixel face (black-on-white features like the 1-bit PFP), spiky hair, smoke with a blue tip
  pixelspike: {
    skin: 0xf4f4f0, shirt: 0x111111, pants: 0x111111,
    dress(g) {
      const white = 0xf4f4f0, ink = 0x111111;
      B(g, 0.46, 0.12, 0.46, white, 0, 1.18);
      for (const [x, z, h] of [[-0.16, 0.08, 0.2], [0, 0.12, 0.28], [0.15, 0.05, 0.22], [-0.08, -0.12, 0.24], [0.12, -0.14, 0.18], [0.22, 0.16, 0.14], [-0.22, -0.02, 0.16]]) B(g, 0.11, h, 0.11, white, x, 1.26, z);
      B(g, 0.32, 0.04, 0.02, ink, 0.02, 1.07, 0.215); // brow line
      B(g, 0.08, 0.07, 0.02, ink, -0.1, 0.98, 0.215); B(g, 0.08, 0.07, 0.02, ink, 0.1, 0.98, 0.215);
      B(g, 0.2, 0.1, 0.02, ink, 0, 0.84, 0.215); B(g, 0.08, 0.04, 0.025, white, 0, 0.87, 0.218); // open mouth, a tooth
      B(g, 0.26, 0.04, 0.04, white, 0.2, 0.84, 0.25); B(g, 0.05, 0.05, 0.05, 0x0052ff, 0.35, 0.835, 0.25, 0x0030ff);
      for (const [x, y] of [[-0.14, 0.62], [0, 0.62], [0.14, 0.62], [-0.07, 0.5], [0.07, 0.5]]) B(g, 0.06, 0.06, 0.02, white, x, y, 0.141); // pixel print
    },
  },
  // the goat-man: ram horns, messy dark hair, dark fur, and a kitten in a blue hard hat on the shoulder
  goat: {
    skin: 0xb9b2aa, shirt: 0x2f2b28, pants: 0x2a2623,
    dress(g, arms) {
      const hair = 0x18161a, horn = 0x5b4d3f;
      B(g, 0.48, 0.14, 0.48, hair, 0, 1.17, -0.02);
      for (const [x, z, sx] of [[-0.14, 0.2, 0.14], [0.06, 0.22, 0.16], [0.2, 0.18, 0.1]]) B(g, sx, 0.14, 0.06, hair, x, 1.08, z); // fringe
      B(g, 0.5, 0.3, 0.1, hair, 0, 0.92, -0.24);
      for (const s of [-1, 1]) { // horns: up, back and curling down
        B(g, 0.1, 0.16, 0.1, horn, s * 0.17, 1.28, 0.02);
        B(g, 0.1, 0.1, 0.18, horn, s * 0.2, 1.4, -0.08);
        B(g, 0.1, 0.18, 0.1, horn, s * 0.24, 1.3, -0.2);
        B(g, 0.09, 0.09, 0.12, horn, s * 0.27, 1.22, -0.12);
        B(g, 0.14, 0.06, 0.08, 0x8a8078, s * 0.27, 1.0, 0.02); // pointed ears
      }
      eyes(g);
      B(g, 0.1, 0.03, 0.02, 0x7a706a, 0, 0.86, 0.215);
      B(g, 0.5, 0.1, 0.32, 0x3d3833, 0, 0.7); // shaggy collar
      for (const a of arms) B(a, 0.15, 0.06, 0.18, 0x3d3833, 0, -0.04);
      // the kitten, riding the right shoulder
      const cat = 0xe2c08f;
      B(g, 0.22, 0.14, 0.14, cat, 0.32, 0.8, -0.02);
      B(g, 0.15, 0.14, 0.14, cat, 0.34, 0.92, 0.06);
      B(g, 0.04, 0.05, 0.03, cat, 0.29, 1.06, 0.06); B(g, 0.04, 0.05, 0.03, cat, 0.39, 1.06, 0.06);
      B(g, 0.18, 0.06, 0.18, 0x1f4fd1, 0.34, 1.06, 0.06); B(g, 0.14, 0.06, 0.14, 0x1f4fd1, 0.34, 1.1, 0.06); // blue hard hat
      B(g, 0.03, 0.03, 0.02, 0x111111, 0.31, 0.98, 0.135); B(g, 0.03, 0.03, 0.02, 0x111111, 0.37, 0.98, 0.135);
      B(g, 0.05, 0.05, 0.18, cat, 0.22, 0.82, -0.12); // tail
    },
  },
  // white pixel face under a fedora with a dotted band, smoke with a blue tip
  pixelhat: {
    skin: 0xf4f4f0, shirt: 0x111111, pants: 0x111111,
    dress(g) {
      const white = 0xf4f4f0, ink = 0x111111;
      B(g, 0.62, 0.05, 0.62, white, 0, 1.18); // brim
      B(g, 0.4, 0.2, 0.4, white, 0, 1.22);
      B(g, 0.2, 0.06, 0.4, white, 0, 1.42); // pinched crown
      for (let i = 0; i < 7; i++) B(g, 0.03, 0.03, 0.02, ink, -0.15 + i * 0.05, 1.27, 0.205); // dotted band
      B(g, 0.32, 0.04, 0.02, ink, 0, 1.08, 0.215);
      B(g, 0.08, 0.06, 0.02, ink, -0.1, 0.99, 0.215); B(g, 0.08, 0.06, 0.02, ink, 0.1, 0.99, 0.215);
      B(g, 0.12, 0.08, 0.02, ink, 0.02, 0.85, 0.215);
      B(g, 0.26, 0.04, 0.04, white, 0.2, 0.84, 0.25); B(g, 0.05, 0.05, 0.05, 0x0052ff, 0.35, 0.835, 0.25, 0x0030ff);
      for (const [x, y] of [[-0.14, 0.62], [0, 0.62], [0.14, 0.62], [-0.07, 0.5], [0.07, 0.5]]) B(g, 0.06, 0.06, 0.02, white, x, y, 0.141);
    },
  },
  // short dark hair, a warm smile, black crew-neck tee
  crewneck: {
    skin: 0xe9c6a8, shirt: 0x161616, pants: 0x2b2f36,
    dress(g) {
      const hair = 0x231c18;
      B(g, 0.44, 0.1, 0.44, hair, 0, 1.2, -0.01);
      B(g, 0.44, 0.06, 0.08, hair, 0, 1.15, 0.18);
      B(g, 0.44, 0.16, 0.08, hair, 0, 1.06, -0.19);
      B(g, 0.03, 0.1, 0.3, hair, -0.215, 1.06, -0.02); B(g, 0.03, 0.1, 0.3, hair, 0.215, 1.06, -0.02);
      eyes(g, 0x2b1d14);
      B(g, 0.1, 0.025, 0.02, hair, -0.1, 1.06, 0.216); B(g, 0.1, 0.025, 0.02, hair, 0.1, 1.06, 0.216);
      B(g, 0.18, 0.05, 0.02, 0xffffff, 0, 0.86, 0.216); B(g, 0.04, 0.03, 0.02, 0x9a5a4a, -0.11, 0.875, 0.216); B(g, 0.04, 0.03, 0.02, 0x9a5a4a, 0.11, 0.875, 0.216); // smile
      B(g, 0.2, 0.03, 0.02, 0x2a2a2a, 0, 0.78, 0.141); // collar
    },
  },
  // wavy swept-up hair, tortoiseshell glasses, stubble, white shirt under a green-grey blazer
  blazer: {
    skin: 0xefc9ad, shirt: 0x4b5b55, pants: 0x3a3f44,
    dress(g, arms) {
      const hair = 0x6b4a30, frame = 0x6a3d1f, stubble = 0xb98f72;
      B(g, 0.46, 0.14, 0.46, hair, 0, 1.18, -0.02);
      B(g, 0.4, 0.12, 0.16, hair, 0.04, 1.26, 0.1); B(g, 0.2, 0.08, 0.12, hair, 0.12, 1.36, 0.06); // swept-up wave
      B(g, 0.46, 0.24, 0.08, hair, 0, 0.98, -0.21);
      B(g, 0.04, 0.16, 0.24, hair, -0.215, 1.02, -0.04); B(g, 0.04, 0.16, 0.24, hair, 0.215, 1.02, -0.04);
      for (const x of [-0.1, 0.1]) { B(g, 0.15, 0.13, 0.02, frame, x, 0.92, 0.218); B(g, 0.1, 0.08, 0.025, 0xe8f2f7, x, 0.945, 0.219); B(g, 0.05, 0.05, 0.026, 0x3a2a1a, x, 0.955, 0.22); }
      B(g, 0.06, 0.03, 0.02, frame, 0, 0.98, 0.218);
      B(g, 0.36, 0.14, 0.02, stubble, 0, 0.8, 0.213); B(g, 0.03, 0.16, 0.28, stubble, -0.212, 0.8, 0.04); B(g, 0.03, 0.16, 0.28, stubble, 0.212, 0.8, 0.04);
      B(g, 0.14, 0.04, 0.02, 0xffffff, 0, 0.85, 0.216);
      B(g, 0.16, 0.42, 0.02, 0xf4f4f0, 0, 0.38, 0.141); // white shirt
      B(g, 0.06, 0.2, 0.025, 0x3e4c47, -0.1, 0.58, 0.142); B(g, 0.06, 0.2, 0.025, 0x3e4c47, 0.1, 0.58, 0.142); // lapels
      for (const a of arms) B(a, 0.135, 0.04, 0.165, 0xf4f4f0, 0, -0.38);
    },
  },
  // lavender hair, blue skin, eyes closed, a smoke, coffee to go, navy wave-print jacket over a cream tee
  kimono: {
    skin: 0x4f7a8f, shirt: 0x262c4a, pants: 0x1f2438,
    dress(g, arms) {
      const hair = 0xdcd6f2, shade = 0xb4acd8;
      B(g, 0.5, 0.16, 0.5, hair, 0, 1.16, -0.02);
      for (const [x, y, z, w] of [[-0.14, 1.04, 0.2, 0.16], [0.04, 1.02, 0.21, 0.14], [0.18, 1.06, 0.19, 0.1], [-0.24, 1.0, 0.04, 0.06], [0.24, 1.0, 0.04, 0.06]]) B(g, w, 0.16, 0.08, hair, x, y, z); // bangs
      for (const [x, z] of [[-0.12, -0.1], [0.1, 0.04], [0.22, -0.16], [-0.2, 0.1], [0, -0.22]]) B(g, 0.1, 0.12, 0.1, hair, x, 1.3, z);
      B(g, 0.5, 0.3, 0.1, shade, 0, 0.9, -0.23);
      B(g, 0.09, 0.025, 0.02, 0x1b2430, -0.1, 0.95, 0.215); B(g, 0.09, 0.025, 0.02, 0x1b2430, 0.1, 0.95, 0.215); // eyes closed
      B(g, 0.22, 0.03, 0.03, 0xf4f4f0, 0.12, 0.84, 0.24); B(g, 0.04, 0.035, 0.035, 0xff8a3d, 0.24, 0.84, 0.24, 0x802a00);
      B(g, 0.16, 0.42, 0.02, 0xf0e2c8, 0, 0.38, 0.141); // cream tee
      for (const [x, y] of [[-0.18, 0.44], [-0.14, 0.5], [-0.18, 0.56], [0.17, 0.48]]) B(g, 0.06, 0.03, 0.02, 0xc9a227, x, y, 0.142); // gold waves
      for (const a of arms) for (const y of [-0.12, -0.26]) B(a, 0.14, 0.03, 0.17, 0xc9a227, 0, y);
      B(arms[1], 0.14, 0.2, 0.14, 0xf4ece0, 0, -0.66, 0.1); B(arms[1], 0.16, 0.05, 0.16, 0xc0392b, 0, -0.47, 0.1); // coffee cup, red lid
      B(arms[1], 0.145, 0.06, 0.145, 0xc0392b, 0, -0.6, 0.1);
    },
  },
  // pixel frog: green head with eye bumps, salmon glasses, black tee with a skateboarding duck
  frog: {
    skin: 0x3ddc6a, shirt: 0x1e1e2a, pants: 0x1e1e2a,
    dress(g) {
      const green = 0x3ddc6a, dark = 0x1f8f45, glass = 0xf26b52;
      B(g, 0.5, 0.36, 0.46, green, 0, 0.8); // wider head
      B(g, 0.2, 0.14, 0.2, green, -0.13, 1.16, 0.04); B(g, 0.2, 0.14, 0.2, green, 0.13, 1.16, 0.04); // eye bumps
      B(g, 0.06, 0.06, 0.02, dark, -0.08, 1.05, 0.235); B(g, 0.05, 0.05, 0.02, dark, 0.2, 0.86, 0.235);
      for (const x of [-0.12, 0.12]) {
        B(g, 0.2, 0.17, 0.02, glass, x, 0.92, 0.235);
        B(g, 0.13, 0.11, 0.025, 0xffffff, x, 0.95, 0.236); B(g, 0.05, 0.11, 0.03, 0x111111, x + 0.03, 0.95, 0.237);
      }
      B(g, 0.06, 0.04, 0.02, glass, 0, 0.97, 0.235);
      B(g, 0.3, 0.03, 0.02, dark, 0, 0.84, 0.235); // mouth
      B(g, 0.12, 0.08, 0.02, 0xa4c639, 0, 0.46, 0.141); B(g, 0.03, 0.04, 0.02, 0xff8a3d, 0.02, 0.54, 0.142); // duck
      B(g, 0.02, 0.02, 0.025, 0x111111, -0.03, 0.49, 0.143); B(g, 0.2, 0.03, 0.02, 0x3b6bd6, 0, 0.42, 0.142); // its skateboard
    },
  },
  // doodle: grey round head, black cap, red headphones with a mic, a smoke, a wristwatch, all in black
  doodle: {
    skin: 0x9c9c9c, shirt: 0x1b1b1b, pants: 0x1b1b1b,
    dress(g, arms) {
      const cap = 0x2b2b2b, red = 0xe02424;
      B(g, 0.46, 0.14, 0.46, cap, 0, 1.18); B(g, 0.36, 0.04, 0.2, cap, 0, 1.2, 0.3); // cap
      B(g, 0.56, 0.05, 0.07, red, 0, 1.32, -0.02); B(g, 0.05, 0.4, 0.07, red, -0.27, 0.94, -0.02); B(g, 0.05, 0.4, 0.07, red, 0.27, 0.94, -0.02); // headband over the cap
      B(g, 0.08, 0.22, 0.22, red, -0.25, 0.86, 0); B(g, 0.08, 0.22, 0.22, red, 0.25, 0.86, 0); // ear cups
      B(g, 0.03, 0.34, 0.03, 0x111111, 0.3, 0.98, -0.06); // mic boom
      B(g, 0.05, 0.05, 0.02, 0x111111, 0.02, 0.98, 0.215); B(g, 0.05, 0.05, 0.02, 0x111111, 0.12, 0.98, 0.215); // dot eyes
      B(g, 0.24, 0.04, 0.04, 0xf4f4f0, 0.16, 0.86, 0.24);
      B(arms[1], 0.15, 0.06, 0.18, 0xf4f4f0, 0, -0.38); B(arms[1], 0.06, 0.06, 0.03, 0x9aa3ad, 0, -0.38, 0.1); // watch
    },
  },
  // anime-style: messy dark hair, big eyes, a calm smile, sky-blue tee
  skyblue: {
    skin: 0xf2cfa0, shirt: 0x2f7fd0, pants: 0x34495e,
    dress(g) {
      const hair = 0x3a2618;
      B(g, 0.48, 0.14, 0.48, hair, 0, 1.17, -0.02);
      for (const [x, z] of [[-0.16, 0.12], [0.02, 0.16], [0.18, 0.06], [-0.06, -0.12], [0.14, -0.16], [-0.22, -0.06]]) B(g, 0.12, 0.12, 0.12, hair, x, 1.27, z); // spiky
      B(g, 0.44, 0.08, 0.06, hair, 0, 1.1, 0.2); B(g, 0.08, 0.1, 0.06, hair, -0.08, 1.04, 0.2);
      B(g, 0.46, 0.3, 0.08, hair, 0, 0.92, -0.21);
      for (const x of [-0.1, 0.1]) { B(g, 0.09, 0.12, 0.02, 0x2b1d14, x, 0.95, 0.215); B(g, 0.03, 0.03, 0.025, 0xffffff, x + 0.02, 1.0, 0.217); B(g, 0.11, 0.03, 0.02, hair, x, 1.07, 0.216); }
      B(g, 0.14, 0.03, 0.02, 0x8a4a3a, 0, 0.86, 0.216); B(g, 0.03, 0.03, 0.02, 0x8a4a3a, -0.08, 0.875, 0.216); B(g, 0.03, 0.03, 0.02, 0x8a4a3a, 0.08, 0.875, 0.216);
    },
  },
  // a green penguin in a red HAM trucker cap and a bandana, riding a unicorn pool float
  floatie: {
    skin: 0x6f8f2a, shirt: 0x6f8f2a, pants: 0xf4f4f0,
    dress(g) {
      const white = 0xf4f4f0;
      B(g, 0.3, 0.3, 0.03, white, 0, 0.82, 0.21); // face patch
      B(g, 0.16, 0.12, 0.2, white, 0, 0.84, 0.3); B(g, 0.12, 0.06, 0.12, 0xd5d8dc, 0, 0.8, 0.36); // beak
      B(g, 0.05, 0.05, 0.02, 0x111111, -0.1, 1.0, 0.215); B(g, 0.05, 0.05, 0.02, 0x111111, 0.1, 1.0, 0.215);
      B(g, 0.46, 0.06, 0.46, 0x2e9a5a, 0, 1.08); B(g, 0.06, 0.16, 0.08, 0x2e9a5a, 0.06, 0.96, -0.25); // bandana + knot
      B(g, 0.46, 0.14, 0.46, 0xe0504a, 0, 1.14); B(g, 0.3, 0.12, 0.03, white, 0, 1.15, 0.225); // trucker cap
      B(g, 0.4, 0.04, 0.22, 0xe0504a, 0, 1.15, 0.32); B(g, 0.2, 0.05, 0.02, 0xe0504a, 0, 1.18, 0.24); // bill, HAM
      B(g, 0.3, 0.32, 0.02, white, 0, 0.42, 0.141); // white belly
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.11, 6, 16), mat(white));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.42;
      g.add(ring);
      B(g, 0.14, 0.4, 0.14, white, 0, 0.42, 0.42); B(g, 0.16, 0.14, 0.24, white, 0, 0.82, 0.48); // unicorn neck + head
      B(g, 0.05, 0.16, 0.05, 0xf4c542, 0, 0.96, 0.5); // horn
      [0xe74c3c, 0xf39c12, 0xf4c542, 0x2ecc71, 0x3498db, 0x9b59b6].forEach((c, i) => {
        B(g, 0.06, 0.08, 0.06, c, 0, 0.88 - i * 0.07, 0.36); // mane
        B(g, 0.08, 0.06, 0.08, c, 0, 0.4 + i * 0.05, -0.46 - i * 0.03); // tail
      });
    },
  },
  // pixel-art style: big messy dark hair, brown brows, an open grin, black jacket
  pixelpunk: {
    skin: 0xf3c4a0, shirt: 0x161616, pants: 0x2b2f36,
    dress(g) {
      const hair = 0x2e221a;
      B(g, 0.52, 0.18, 0.5, hair, 0, 1.16, -0.02);
      for (const [x, z] of [[-0.18, 0.06], [0.0, 0.1], [0.18, 0.04], [-0.1, -0.14], [0.12, -0.12]]) B(g, 0.14, 0.1, 0.14, hair, x, 1.32, z);
      B(g, 0.2, 0.14, 0.06, hair, -0.12, 1.06, 0.2); // fringe swept to one side
      B(g, 0.1, 0.42, 0.44, hair, -0.25, 0.74, -0.02); B(g, 0.08, 0.3, 0.4, hair, 0.24, 0.86, -0.04); // sides, longer on the left
      B(g, 0.52, 0.46, 0.1, hair, 0, 0.74, -0.24);
      B(g, 0.1, 0.03, 0.02, 0xa0603a, -0.09, 1.04, 0.215); B(g, 0.1, 0.03, 0.02, 0xa0603a, 0.11, 1.04, 0.215); // brows
      B(g, 0.05, 0.05, 0.02, 0x111111, -0.08, 0.98, 0.215); B(g, 0.05, 0.05, 0.02, 0x111111, 0.12, 0.98, 0.215);
      B(g, 0.08, 0.03, 0.02, 0x111111, 0.04, 0.91, 0.215); // nose
      B(g, 0.16, 0.08, 0.02, 0x111111, 0.02, 0.83, 0.215); B(g, 0.12, 0.04, 0.025, 0xffffff, 0.02, 0.85, 0.217); // open grin
      B(g, 0.12, 0.2, 0.02, 0x3a3a3a, -0.12, 0.6, 0.141); B(g, 0.12, 0.2, 0.02, 0x3a3a3a, 0.12, 0.6, 0.141); // collar
    },
  },
  // after the painted portrait: short dark hair, moustache, dark suit, striped shirt and tie
  dreamer: {
    skin: 0x6b4a3a, shirt: 0x262b36, pants: 0x262b36,
    dress(g) {
      const hair = 0x1b1b1b;
      B(g, 0.44, 0.08, 0.44, hair, 0, 1.2, -0.01);
      B(g, 0.44, 0.14, 0.06, hair, 0, 1.08, -0.2);
      B(g, 0.03, 0.12, 0.26, hair, -0.215, 1.08, -0.04); B(g, 0.03, 0.12, 0.26, hair, 0.215, 1.08, -0.04);
      eyes(g, 0x1b1410);
      B(g, 0.1, 0.025, 0.02, hair, -0.1, 1.06, 0.216); B(g, 0.1, 0.025, 0.02, hair, 0.1, 1.06, 0.216);
      B(g, 0.2, 0.04, 0.02, hair, 0, 0.87, 0.216); // moustache
      B(g, 0.12, 0.025, 0.02, 0x4a2e24, 0, 0.83, 0.216);
      B(g, 0.16, 0.42, 0.02, 0xdfe6ee, 0, 0.38, 0.141); // shirt
      for (let i = 0; i < 4; i++) B(g, 0.02, 0.42, 0.022, 0x9fb1c7, -0.06 + i * 0.04, 0.38, 0.142);
      B(g, 0.06, 0.34, 0.025, 0x1b1f2a, 0, 0.42, 0.145); // tie
      for (let i = 0; i < 4; i++) B(g, 0.065, 0.02, 0.027, 0x5a6a85, 0, 0.47 + i * 0.07, 0.146);
      B(g, 0.06, 0.24, 0.025, 0x1e222c, -0.11, 0.54, 0.143); B(g, 0.06, 0.24, 0.025, 0x1e222c, 0.11, 0.54, 0.143); // lapels
    },
  },
  // a black hooded armour bot: glowing red eyes, gold trim, a cigar
  hoodbot: {
    skin: 0x1c1c1e, shirt: 0x232326, pants: 0x1c1c1e,
    dress(g, arms) {
      const hood = 0x2a2a2c, gold = 0xc9a25a;
      B(g, 0.52, 0.5, 0.1, hood, 0, 0.78, -0.25);
      B(g, 0.07, 0.52, 0.48, hood, -0.25, 0.76, -0.02); B(g, 0.07, 0.52, 0.48, hood, 0.25, 0.76, -0.02);
      B(g, 0.54, 0.12, 0.5, hood, 0, 1.22, -0.02); B(g, 0.3, 0.1, 0.36, hood, 0, 1.33, -0.06);
      B(g, 0.03, 0.04, 0.4, gold, -0.24, 1.2, 0.0); B(g, 0.03, 0.04, 0.4, gold, 0.24, 1.2, 0.0); // gold stripes
      B(g, 0.12, 0.05, 0.02, 0xff2a2a, -0.1, 0.98, 0.215, 0xff0000); B(g, 0.12, 0.05, 0.02, 0xff2a2a, 0.1, 0.98, 0.215, 0xff0000); // red eyes
      B(g, 0.06, 0.02, 0.02, 0x4a4a4a, 0, 0.86, 0.215);
      B(g, 0.2, 0.05, 0.05, 0x7a4a2a, 0.12, 0.85, 0.24); B(g, 0.05, 0.05, 0.05, 0xff6a2a, 0.23, 0.85, 0.24, 0x802000); // cigar
      B(g, 0.5, 0.05, 0.3, gold, 0, 0.74); // gold collar
      B(g, 0.05, 0.05, 0.02, gold, -0.12, 0.52, 0.141); B(g, 0.05, 0.05, 0.02, gold, 0.12, 0.52, 0.141); // strap buckles
      B(g, 0.48, 0.05, 0.3, 0x111111, 0, 0.3); // belt
      for (const a of arms) { B(a, 0.15, 0.04, 0.18, gold, 0, -0.1); B(a, 0.15, 0.04, 0.18, gold, 0, -0.3); }
    },
  },
  // mutant ape: leopard ears, slime-green face dripping, a tan blindfold band, blonde crest, patchwork arms
  apeslime: {
    skin: 0xc8d98a, shirt: 0xc8783a, pants: 0x5a4a3a,
    dress(g, arms) {
      const slime = 0xa8c95a, leo = 0xe0a040, spot = 0x3a2a1a;
      for (const s of [-1, 1]) {
        B(g, 0.1, 0.2, 0.18, leo, s * 0.27, 0.86, 0); B(g, 0.03, 0.04, 0.04, spot, s * 0.32, 0.95, 0.04); B(g, 0.03, 0.04, 0.04, spot, s * 0.32, 0.9, -0.05);
      }
      for (const [x, z, h] of [[-0.08, 0.06, 0.16], [0.04, 0.02, 0.22], [0.14, -0.04, 0.16], [0, -0.12, 0.12]]) B(g, 0.1, h, 0.12, 0xf0e070, x, 1.22, z); // blonde crest
      B(g, 0.46, 0.1, 0.46, 0xd8b48a, 0, 0.94); // blindfold band
      B(g, 0.08, 0.04, 0.02, 0xd0307a, -0.1, 0.98, 0.232); B(g, 0.12, 0.03, 0.02, 0xd0307a, 0.1, 0.96, 0.232); B(g, 0.05, 0.05, 0.02, 0xf4c542, 0.08, 0.97, 0.233); // paint + one eye peeking
      B(g, 0.3, 0.2, 0.12, 0xf0a0b0, 0, 0.76, 0.24); B(g, 0.2, 0.03, 0.02, 0x7a2a3a, 0, 0.8, 0.301); // muzzle + mouth
      for (const [x, h] of [[-0.12, 0.14], [-0.04, 0.08], [0.06, 0.18], [0.13, 0.1]]) B(g, 0.05, h, 0.05, slime, x, 0.76 - h, 0.27); // drips
      B(g, 0.2, 0.08, 0.04, slime, -0.1, 1.04, 0.22);
      for (const [x, y] of [[-0.18, 0.5], [-0.14, 0.62], [0.16, 0.44]]) B(g, 0.05, 0.05, 0.02, spot, x, y, 0.141); // leopard spots
      for (const y of [-0.12, -0.24, -0.34]) B(arms[0], 0.14, 0.05, 0.17, 0x2f8f3a, 0, y); // green scales
      for (const y of [-0.1, -0.2, -0.3]) B(arms[1], 0.14, 0.04, 0.17, 0x1b1b1b, 0, y); // zebra stripes
    },
  },
  // brown ponytail, green-and-white striped shirt, a little white dragon with a teal mane around the shoulders
  dragonrider: {
    skin: 0xf2d2b0, shirt: 0x7cc08a, pants: 0xe8b0a0,
    dress(g, arms) {
      const hair = 0x5a3a22;
      B(g, 0.46, 0.12, 0.46, hair, 0, 1.18, -0.01);
      B(g, 0.44, 0.1, 0.06, hair, 0, 1.1, 0.2); B(g, 0.06, 0.26, 0.4, hair, -0.23, 0.92, -0.02); B(g, 0.06, 0.26, 0.4, hair, 0.23, 0.92, -0.02);
      B(g, 0.46, 0.36, 0.08, hair, 0, 0.86, -0.22); B(g, 0.14, 0.3, 0.12, hair, 0, 0.82, -0.32); // ponytail
      for (const x of [-0.1, 0.1]) { B(g, 0.09, 0.12, 0.02, 0x3a2416, x, 0.95, 0.215); B(g, 0.03, 0.03, 0.025, 0xffffff, x + 0.02, 0.99, 0.217); }
      B(g, 0.06, 0.025, 0.02, 0xb05a4a, 0, 0.85, 0.216);
      for (const y of [0.42, 0.52, 0.62, 0.72]) B(g, 0.47, 0.04, 0.29, 0xf4f4f0, 0, y); // white stripes
      for (const a of arms) B(a, 0.135, 0.04, 0.165, 0xf4f4f0, 0, -0.18);
      const white = 0xe8f2f2, mane = 0x3aa58a;
      [[-0.32, 0.7, 0.06], [-0.34, 0.8, -0.14], [-0.22, 0.88, -0.3], [0, 0.92, -0.36], [0.22, 0.88, -0.3], [0.34, 0.8, -0.14]].forEach(([x, y, z], i) => {
        B(g, 0.15, 0.15, 0.15, white, x, y, z); B(g, 0.08, 0.06, 0.08, mane, x, y + 0.15, z);
        if (i === 0) B(g, 0.1, 0.1, 0.1, white, x, y - 0.08, z + 0.12); // tail tip
      });
      B(g, 0.16, 0.14, 0.26, white, 0.36, 0.76, 0.12); B(g, 0.1, 0.06, 0.12, 0xdfe8ea, 0.36, 0.74, 0.28); // dragon head + snout
      B(g, 0.03, 0.03, 0.02, 0x2f6b8a, 0.44, 0.82, 0.18); B(g, 0.03, 0.12, 0.03, 0xf4f4e0, 0.32, 0.9, 0.06); B(g, 0.03, 0.12, 0.03, 0xf4f4e0, 0.4, 0.9, 0.06); // eye, horns
      B(g, 0.06, 0.1, 0.14, mane, 0.36, 0.9, 0.0);
    },
  },
  // grunge: trapper hat with ear flaps, white round shades with a ₿ on each lens, long blonde hair,
  // goatee, open mouth, leopard-print coat over a white tee
  trapper: {
    skin: 0xe6c7ae, shirt: 0xb48a5a, pants: 0x2b2f36,
    dress(g, arms) {
      const hat = 0x6a6a6a, fur = 0x9a9a9a, blonde = 0xd9c48e, spot = 0x3a2a1a;
      B(g, 0.08, 0.46, 0.34, blonde, -0.23, 0.6, -0.02); B(g, 0.08, 0.46, 0.34, blonde, 0.23, 0.6, -0.02); B(g, 0.46, 0.5, 0.08, blonde, 0, 0.62, -0.23);
      B(g, 0.5, 0.16, 0.5, hat, 0, 1.18); B(g, 0.52, 0.1, 0.06, fur, 0, 1.14, 0.23); // hat + folded-up brim
      B(g, 0.06, 0.38, 0.28, hat, -0.27, 0.8, -0.02); B(g, 0.06, 0.38, 0.28, hat, 0.27, 0.8, -0.02); // ear flaps
      for (const x of [-0.1, 0.1]) {
        B(g, 0.18, 0.15, 0.03, 0xffffff, x, 0.88, 0.22);
        B(g, 0.025, 0.1, 0.02, 0x111111, x - 0.02, 0.9, 0.236); B(g, 0.035, 0.035, 0.02, 0x111111, x + 0.015, 0.93, 0.236); B(g, 0.035, 0.035, 0.02, 0x111111, x + 0.015, 0.895, 0.236); // ₿
      }
      B(g, 0.05, 0.03, 0.03, 0xffffff, 0, 0.93, 0.22); // bridge
      B(g, 0.08, 0.06, 0.02, 0x3a2020, 0, 0.8, 0.216); // open mouth
      B(g, 0.1, 0.06, 0.02, 0x9a8460, 0, 0.75, 0.216); B(g, 0.3, 0.04, 0.02, 0xb8a080, 0, 0.84, 0.214); // goatee, stubble
      B(g, 0.14, 0.42, 0.02, 0xf4f4f0, 0, 0.38, 0.141); // white tee
      for (const [x, y] of [[-0.18, 0.66], [-0.15, 0.5], [0.17, 0.6], [0.15, 0.44], [-0.19, 0.4]]) B(g, 0.05, 0.04, 0.02, spot, x, y, 0.142);
      for (const a of arms) for (const y of [-0.08, -0.2, -0.3]) B(a, 0.14, 0.03, 0.04, spot, 0.02, y, 0.07);
    },
  },
  // magenta space buns, blue lips, a silver third-eye mark, planet earrings, a white one-shoulder drape
  starbuns: {
    skin: 0xc68c5a, shirt: 0xe4eaee, pants: 0xcfd6de,
    dress(g, arms) {
      const hair = 0xc23a6a, silver = 0xc7cfd8;
      B(g, 0.46, 0.1, 0.46, hair, 0, 1.17, -0.02); B(g, 0.44, 0.06, 0.06, hair, 0, 1.12, 0.2);
      B(g, 0.2, 0.2, 0.2, hair, -0.16, 1.24, -0.04); B(g, 0.2, 0.2, 0.2, hair, 0.16, 1.24, -0.04); // buns
      B(g, 0.06, 0.1, 0.02, silver, 0, 1.03, 0.216); // third-eye mark
      for (const x of [-0.1, 0.1]) { B(g, 0.08, 0.06, 0.02, 0x6a4ab0, x, 0.96, 0.215); B(g, 0.1, 0.025, 0.02, 0x111111, x, 1.02, 0.216); }
      B(g, 0.1, 0.045, 0.02, 0x2050e0, 0, 0.82, 0.216); // blue lips
      for (const [x, y] of [[-0.15, 0.88], [0.15, 0.9], [-0.12, 0.85]]) B(g, 0.025, 0.025, 0.02, silver, x, y, 0.216);
      B(g, 0.06, 0.06, 0.06, 0xf08a3a, -0.25, 0.76, 0.04); B(g, 0.06, 0.06, 0.06, 0x3a7ae0, 0.25, 0.76, 0.04); // planet earrings
      B(arms[0], 0.135, 0.16, 0.165, 0xc68c5a, 0, -0.16); // bare shoulder
      const drape = B(g, 0.14, 0.6, 0.31, 0xf4f6f8, 0.02, 0.3, 0);
      drape.rotation.z = 0.6;
      for (const [x, y, c] of [[-0.12, 0.42, 0xc8b8e8], [0.08, 0.56, 0xb8e0d0], [0.14, 0.4, 0xc8b8e8]]) B(g, 0.08, 0.03, 0.02, c, x, y, 0.142); // swirls
    },
  },
  // cartoon: straight brown bob with bangs, big black square shades with pink lenses, red lips
  bobshades: {
    skin: 0xb98a62, shirt: 0x2b2f36, pants: 0x34495e,
    dress(g) {
      const hair = 0x7a4f2e;
      B(g, 0.48, 0.14, 0.48, hair, 0, 1.16, -0.02); B(g, 0.12, 0.05, 0.14, 0xa0703f, 0.12, 1.29, 0.02); // shine
      B(g, 0.46, 0.13, 0.06, hair, 0, 1.04, 0.2); // bangs
      B(g, 0.07, 0.46, 0.44, hair, -0.245, 0.7, -0.02); B(g, 0.07, 0.46, 0.44, hair, 0.245, 0.7, -0.02);
      B(g, 0.48, 0.5, 0.08, hair, 0, 0.68, -0.24);
      B(g, 0.46, 0.17, 0.03, 0x111111, 0, 0.88, 0.22); // frames
      for (const x of [-0.1, 0.1]) { B(g, 0.17, 0.11, 0.02, 0xd070b0, x, 0.91, 0.236); B(g, 0.04, 0.09, 0.022, 0xf0b0dc, x - 0.04, 0.92, 0.237); }
      B(g, 0.08, 0.02, 0.02, 0x2b1d14, 0.02, 0.84, 0.215); B(g, 0.08, 0.025, 0.02, 0xe02a2a, 0, 0.79, 0.215); // smile, red lips
    },
  },
  // mint cap with a white "e", long dark hair with blonde ends, grey tee, a silver croc-print bag
  mintcap: {
    skin: 0xf2d4c4, shirt: 0x3a3d42, pants: 0x2b2f36,
    dress(g, arms) {
      const hair = 0x2a1d16, ends = 0xc9a46a, cap = 0x3cc8b4;
      B(g, 0.48, 0.5, 0.08, hair, 0, 0.62, -0.24); B(g, 0.48, 0.18, 0.08, ends, 0, 0.44, -0.24);
      for (const x of [-0.245, 0.245]) { B(g, 0.07, 0.4, 0.34, hair, x, 0.66, -0.02); B(g, 0.07, 0.2, 0.3, ends, x, 0.46, -0.02); }
      B(g, 0.48, 0.14, 0.48, cap, 0, 1.16); B(g, 0.4, 0.04, 0.24, cap, 0, 1.16, 0.32);
      B(g, 0.08, 0.08, 0.02, 0xffffff, 0, 1.2, 0.245); B(g, 0.03, 0.03, 0.025, cap, 0.01, 1.22, 0.247); B(g, 0.12, 0.02, 0.02, 0xffffff, -0.06, 1.25, 0.245); // the "e"
      for (const x of [-0.1, 0.1]) B(g, 0.07, 0.05, 0.02, 0x1b1410, x, 0.97, 0.215);
      B(g, 0.1, 0.025, 0.02, 0xc0706a, 0, 0.85, 0.216); B(g, 0.03, 0.03, 0.02, 0xc0706a, -0.06, 0.865, 0.216); B(g, 0.03, 0.03, 0.02, 0xc0706a, 0.06, 0.865, 0.216);
      B(arms[0], 0.06, 0.3, 0.26, 0xd8d8d0, 0.02, -0.82, 0.04); B(arms[0], 0.03, 0.12, 0.03, 0xb8b8b0, 0.02, -0.56, 0.04); // bag
      for (const [y, z] of [[-0.74, -0.02], [-0.68, 0.08], [-0.62, 0.0]]) B(arms[0], 0.065, 0.03, 0.05, 0xc0c0b8, 0.02, y, z);
    },
  },
};

// Tier uniforms for Blockies brought by big buys (see CONFIG.tiers), worn instead of the role outfit.
// base: Base-blue hard hat with the logo, navy jacket with a blue/white reflective vest, tool belt.
// whale: gold hard hat, navy suit, sunglasses and a gold chain with a little whale.
// star: a legend without a hand-made look.
function tierUniform(g, tier, hair, star) {
  const whale = tier === 'whale';
  const hat = whale ? 0xf4c542 : 0x0052ff;
  B(g, 0.44, 0.12, 0.1, hair, 0, 1.1, -0.17);
  B(g, 0.5, 0.16, 0.5, hat, 0, 1.2); B(g, 0.56, 0.04, 0.62, hat, 0, 1.2, 0.04); B(g, 0.08, 0.06, 0.5, whale ? 0xd9a520 : 0x1a3fb0, 0, 1.36);
  B(g, 0.14, 0.14, 0.03, 0xffffff, 0, 1.22, 0.255); B(g, 0.09, 0.03, 0.035, hat, 0.02, 1.27, 0.256); // the Base mark
  if (star) B(g, 0.1, 0.1, 0.03, 0xf4c542, 0, 1.38, 0.2, 0xa07000);
  if (whale) {
    B(g, 0.38, 0.08, 0.02, 0x111111, 0, 0.96, 0.218); // sunglasses
    B(g, 0.32, 0.04, 0.02, 0xf4c542, 0, 0.66, 0.142); B(g, 0.04, 0.12, 0.02, 0xf4c542, 0, 0.56, 0.142); // chain
    B(g, 0.12, 0.07, 0.03, 0x1f5fe0, 0, 0.5, 0.145); B(g, 0.04, 0.05, 0.03, 0x1f5fe0, -0.08, 0.53, 0.145); // whale pendant
    B(g, 0.12, 0.42, 0.02, 0xf4f4f0, 0, 0.38, 0.141); B(g, 0.05, 0.3, 0.025, 0xc0392b, 0, 0.4, 0.143); // shirt + tie
  } else {
    eyes(g);
    B(g, 0.48, 0.07, 0.3, 0x0052ff, 0, 0.6); B(g, 0.48, 0.03, 0.3, 0xffffff, 0, 0.52); // vest stripes
    B(g, 0.06, 0.34, 0.3, 0x0052ff, -0.13, 0.4); B(g, 0.06, 0.34, 0.3, 0x0052ff, 0.13, 0.4); // vest straps
    B(g, 0.48, 0.07, 0.3, 0x7a5230, 0, 0.36); B(g, 0.08, 0.07, 0.04, 0xf4c542, 0, 0.36, 0.15); // tool belt
    B(g, 0.08, 0.16, 0.1, 0x9aa3ad, 0.2, 0.22, 0.12); // wrench in the belt
  }
}

// ---------- rare traits (CONFIG.rarity), drawn over whatever the Blocky wears ----------
const GLASS = new THREE.MeshLambertMaterial({ color: 0xcfefff, transparent: true, opacity: 0.35, depthWrite: false });
const DIAMOND = new THREE.MeshPhongMaterial({ color: 0xc8f6ff, emissive: 0x3ab8d8, emissiveIntensity: 0.35, shininess: 120, specular: 0xffffff });
const GOLD = new THREE.MeshPhongMaterial({ color: 0xffc21a, emissive: 0x8a5a00, emissiveIntensity: 0.55, shininess: 90, specular: 0xfff2b0 });
const shiny = (g, material, w, h, d, x, y, z) => { const m = new THREE.Mesh(BOX, material); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); m.castShadow = true; g.add(m); return m; };
function applyTrait(g, arms, b, skin) {
  const top = new THREE.Box3().setFromObject(g).max.y / g.scale.y; // top of the hat or hair
  switch (b.trait) {
    case 'shades':
      B(g, 0.44, 0.1, 0.03, 0x111111, 0, 0.93, 0.225); B(g, 0.08, 0.03, 0.035, 0xffffff, -0.13, 0.98, 0.23);
      break;
    case 'basecap':
      B(g, 0.53, 0.15, 0.53, 0x0052ff, 0, 1.19); B(g, 0.42, 0.04, 0.26, 0x0052ff, 0, 1.19, 0.34);
      B(g, 0.13, 0.13, 0.02, 0xffffff, 0, 1.21, 0.27); B(g, 0.08, 0.03, 0.025, 0x0052ff, 0.01, 1.255, 0.272);
      break;
    case 'goldhat': // polished gold, a ridge and a blue gem: not the everyday yellow hard hat
      shiny(g, GOLD, 0.56, 0.2, 0.56, 0, 1.18, 0); shiny(g, GOLD, 0.62, 0.04, 0.7, 0, 1.18, 0.04); shiny(g, GOLD, 0.1, 0.1, 0.58, 0, 1.38, 0);
      B(g, 0.12, 0.12, 0.03, 0x2e7bff, 0, 1.24, 0.29, 0x0040ff); B(g, 0.05, 0.12, 0.02, 0xffffff, -0.18, 1.24, 0.285, 0xffffff);
      break;
    case 'lasereyes':
      for (const x of [-0.1, 0.1]) { B(g, 0.1, 0.1, 0.03, 0xff2020, x, 0.94, 0.225, 0xff0000); B(g, 0.025, 0.025, 0.55, 0xff5050, x, 0.975, 0.5, 0xff0000); }
      break;
    case 'astronaut': {
      const helmet = new THREE.Mesh(BOX, GLASS);
      helmet.scale.set(0.62, 0.62, 0.62); helmet.position.set(0, 1.02, 0);
      g.add(helmet);
      B(g, 0.52, 0.09, 0.36, 0xe8e8e8, 0, 0.72); // collar ring
      B(g, 0.4, 0.46, 0.2, 0xe0e0e0, 0, 0.3, -0.22); B(g, 0.12, 0.12, 0.02, 0x0052ff, 0.13, 0.5, 0.142); // life support, patch
      break;
    }
    case 'diamond':
      g.traverse((o) => { if (o.isMesh && o.material?.color?.getHex?.() === skin) o.material = DIAMOND; });
      for (const [x, y] of [[-0.12, 1.08], [0.15, 0.86], [0.2, 1.12]]) B(g, 0.05, 0.05, 0.03, 0xffffff, x, y, 0.215, 0xffffff); // sparkles
      break;
    case 'crown':
      B(g, 0.46, 0.1, 0.46, 0xf4c542, 0, top - 0.02, 0, 0x6a5000);
      for (const [x, z] of [[-0.18, 0.18], [0, 0.18], [0.18, 0.18], [-0.18, -0.18], [0.18, -0.18]]) B(g, 0.07, 0.14, 0.07, 0xf4c542, x, top + 0.08, z, 0x6a5000);
      B(g, 0.08, 0.08, 0.03, 0xe0302a, 0, top + 0.02, 0.235, 0x600000);
      B(g, 0.46, 0.56, 0.05, 0xc0392b, 0, 0.18, -0.17); // cape
      break;
  }
}

// Merge a part's boxes into as few meshes as possible (one vertex-coloured mesh for the plain
// colours, one per special material), so a Blocky costs a handful of draw calls instead of dozens.
const BODY = new THREE.MeshLambertMaterial({ vertexColors: true });
function mergeParts(parent) {
  const plain = [], special = new Map();
  for (const o of parent.children) {
    if (!o.isMesh || o.children.length) continue;
    const m = o.material;
    if (m.isMeshLambertMaterial && !m.transparent && !m.vertexColors && m.emissive.getHex() === 0) plain.push(o);
    else { if (!special.has(m)) special.set(m, []); special.get(m).push(o); }
  }
  const bake = (list, material, colored) => {
    const geos = list.map((o) => {
      o.updateMatrix();
      const g = o.geometry.clone().applyMatrix4(o.matrix);
      if (colored) {
        const c = o.material.color, n = g.attributes.position.count, arr = new Float32Array(n * 3);
        for (let i = 0; i < n * 3; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      }
      return g;
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos), material);
    geos.forEach((g) => g.dispose());
    mesh.castShadow = true;
    for (const o of list) parent.remove(o);
    parent.add(mesh);
  };
  if (plain.length > 1) bake(plain, BODY, true);
  for (const [m, list] of special) if (list.length > 1) bake(list, m, false);
}
function finish(g, legs, arms) { mergeParts(g); for (const p of [...legs, ...arms]) mergeParts(p); }

// One Blocky: a little builder in a safety vest, dressed for its role.
// Returns the group plus the parts that animate (legs, arms) and the block it carries.
// merge: false keeps every box separate (the SVG renderer reads them one by one).
export function buildBlocky(b, { merge = true } = {}) {
  const g = new THREE.Group();
  g.scale.setScalar(0.95);
  const role = b.role.id;
  const look = b.legend ? LEGEND_LOOKS[b.legend.look] : null;
  const tier = b.tier?.id;
  const uniform = !look && (tier === 'base' || tier === 'whale' || b.legend);
  const hair = HAIR[Math.floor(hash(b.id, 17) * HAIR.length)];
  let shirt = look ? look.shirt : uniform ? (tier === 'whale' ? 0x14213d : 0x1b2a4a) : role === 'research' ? 0xf4f4f0 : role === 'contracts' ? 0x3b4252 : b.shirt;
  if (b.trait === 'astronaut') shirt = 0xf2f2f2; // space suit
  const skin = look ? look.skin : b.skin;
  const pants = look?.pants ?? (tier === 'whale' ? 0x14213d : PANTS);

  const leg = (x) => {
    const p = new THREE.Group();
    p.position.set(x, 0.38, 0);
    B(p, 0.18, 0.38, 0.22, pants, 0, -0.38);
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
  if (!look && !uniform) B(g, 0.48, 0.08, 0.3, 0xf39c12, 0, 0.62); // safety vest stripe
  const arms = [arm(-0.3), arm(0.3)];
  B(g, 0.42, 0.42, 0.42, skin, 0, 0.8);
  if (look || uniform) {
    if (look) look.dress(g, arms); else tierUniform(g, tier === 'whale' ? 'whale' : 'base', hair, !!b.legend);
    if (b.trait) applyTrait(g, arms, b, skin);
    if (merge) finish(g, legs, arms);
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

  if (b.trait) applyTrait(g, arms, b, skin);
  if (merge) finish(g, legs, arms);
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
    hit.visible = false; // still hit by the raycaster, never drawn
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
    this.path = route(p.x, p.z, target[0], target[1], Math.max(2, this.city.land));
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
