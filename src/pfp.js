import * as THREE from 'three';
import { buildBlocky } from './citizens.js';
import { hash } from './sim.js';

// Square voxel PFPs of any Blocky: head and shoulders, three-quarter view, on a soft gradient.
// One offscreen WebGL renderer draws them all; results are cached per Blocky and size.

const PALETTE = ['#0052ff', '#7c3aed', '#16a34a', '#e11d48', '#f59e0b', '#0ea5e9', '#14b8a6', '#f97316', '#db2777', '#4f46e5'];
const TIER_BG = { blocky: '#0ea5e9', base: '#0052ff', whale: '#f59e0b', founder: '#0052ff' };

const RARITY_BG = { uncommon: '#16a34a', rare: '#7c3aed', legendary: '#f59e0b' };
export function pfpColor(b) {
  if (b.legend?.bg) return b.legend.bg;
  if (RARITY_BG[b.rarity?.id]) return RARITY_BG[b.rarity.id];
  if (b.legendIdx >= 0) return PALETTE[b.legendIdx % PALETTE.length];
  if (b.id === 1) return TIER_BG.founder;
  return TIER_BG[b.tier?.id] || PALETTE[Math.floor(hash(b.id, 21) * PALETTE.length)];
}

let renderer, scene, camera;
function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8796ad, 2.3));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
  key.position.set(2.5, 3.5, 4);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 1.1);
  rim.position.set(-3, 2, -2);
  scene.add(key, rim);
  camera = new THREE.PerspectiveCamera(20, 1, 0.1, 50);
}

const cache = new Map();

// Returns a PNG data URL. `mark` adds a small BaseCity tag in the corner. `full`: head to toe instead of
// from the chest up; `transparent`: no background.
export function renderPfp(b, { size = 1024, mark = true, full = false, transparent = false } = {}) {
  const key = `${b.id}|${b.legendIdx ?? -1}|${size}|${mark}|${full}|${transparent}`;
  if (cache.has(key)) return cache.get(key);
  if (!renderer) setup();
  renderer.setSize(size, size, false);

  const { group } = buildBlocky(b);
  group.scale.setScalar(1);
  group.rotation.y = 0.42;
  scene.add(group);
  // frame from the chest (or the feet) up to the top of whatever the Blocky wears
  const box = new THREE.Box3().setFromObject(group);
  const top = box.max.y + 0.06, bottom = full ? box.min.y - 0.04 : 0.34;
  const span = (top - bottom) * (full ? 1.16 : 1.12), cy = (top + bottom) / 2 + 0.02;
  const dist = span / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(0, cy + dist * 0.12, dist);
  camera.lookAt(0, cy, 0);
  renderer.render(scene, camera);
  scene.remove(group);

  const out = document.createElement('canvas');
  out.width = out.height = size;
  const g = out.getContext('2d');
  if (!transparent) paintBackground(g, b, size);
  g.drawImage(renderer.domElement, 0, 0, size, size);
  if (mark) {
    const s = size / 1024;
    g.font = `800 ${28 * s}px Inter, system-ui, sans-serif`;
    const text = 'BaseCity', w = g.measureText(text).width;
    g.fillStyle = 'rgba(10, 14, 24, 0.45)';
    g.beginPath(); g.roundRect(size - w - 74 * s, size - 66 * s, w + 50 * s, 42 * s, 21 * s); g.fill();
    g.fillStyle = '#0052ff'; g.fillRect(size - w - 60 * s, size - 54 * s, 18 * s, 18 * s);
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText(text, size - w - 34 * s, size - 45 * s);
  }
  const url = out.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

// the Blocky's colour as a soft radial gradient with a faint voxel grid (w × h, any shape)
export function paintBackground(g, b, w, h = w) {
  const size = Math.max(w, h);
  const color = new THREE.Color(pfpColor(b));
  const light = color.clone().lerp(new THREE.Color('#ffffff'), 0.35), dark = color.clone().multiplyScalar(0.72);
  const grad = g.createRadialGradient(w * 0.5, h * 0.42, size * 0.05, w * 0.5, h * 0.5, size * 0.72);
  grad.addColorStop(0, `#${light.getHexString()}`);
  grad.addColorStop(1, `#${dark.getHexString()}`);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.08; // a faint voxel grid
  g.fillStyle = '#ffffff';
  const cell = Math.min(w, h) / 16;
  for (let i = 0; i * cell < w; i++) for (let j = 0; j * cell < h; j++) if ((i + j) % 2) g.fillRect(i * cell, j * cell, cell, cell);
  g.globalAlpha = 1;
}

export function downloadPfp(b, name) {
  const a = document.createElement('a');
  a.href = renderPfp(b, { size: 1024 });
  a.download = `basecity-${(name || b.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
