// Dev tool: every building design side by side. Open /gallery.html while `npm run dev` runs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOG, ROLES, makeBuilder } from './sim.js';
import { buildBlocky } from './citizens.js';
import { CONFIG } from './config.js';
import { buildingGroup } from './city.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd3ff);
scene.add(new THREE.HemisphereLight(0xdff1ff, 0x7a6a55, 1.8));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 200 });
scene.add(sun);

const items = [
  ...Object.entries(CATALOG).map(([type, t], k) => {
    const mid = (r) => Math.round((r[0] + r[1]) / 2);
    return { label: t.label, p: { k: k + 3, kind: 'building', type, w: t.size[0][1], d: t.size[1][1], h: mid(t.size[2]), color: 0xe8dcc8 } };
  }),
  ...CONFIG.landmarks.map((l) => ({ label: l.label, p: { k: 0, kind: 'landmark', type: l.id } })),
];
// ?only=liberty,coaster shows just those designs, up close
const only = new URLSearchParams(location.search).get('only')?.split(',');
const showBlockies = !only || only.includes('blockies') || only.includes('legends');
const legendsOnly = only?.includes('legends') && !only.includes('blockies');
if (only) items.splice(0, items.length, ...items.filter((it) => only.includes(it.p.type)));
const cols = only ? Math.max(1, Math.min(3, items.length)) : 6, gap = 11;
const rows = Math.ceil(items.length / cols);
const ground = new THREE.Mesh(new THREE.BoxGeometry(Math.max(cols * gap + 4, 64), 0.2, rows * gap + 4 + 14), new THREE.MeshLambertMaterial({ color: 0x6cc24a }));
ground.position.set(0, -0.1, 7);
ground.receiveShadow = true;
scene.add(ground);
const tags = [];
items.forEach((it, n) => {
  const g = buildingGroup(it.p);
  g.position.set(((n % cols) - (cols - 1) / 2) * gap, 0, (Math.floor(n / cols) - (Math.ceil(items.length / cols) - 1) / 2) * gap);
  scene.add(g);
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = it.label;
  document.body.appendChild(tag);
  tags.push([tag, g.position.clone().add(new THREE.Vector3(0, 0, 4))]);
});

// ----- the Blockies: one per role, plus one walking and one carrying a block -----
const crew = [];
if (showBlockies) {
  const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xf5d0a9];
  const SHIRT = [0x3fa34d, 0x2e86de, 0xe67e22, 0x9b59b6, 0xe74c3c, 0x1abc9c];
  const roles = CONFIG.legends?.[1] ? ROLES.filter((r) => r.id !== 'founder') : ROLES; // the founder is a legend
  const people = roles.map((role, i) => ({ id: i + 1, role, skin: SKIN[i], shirt: SHIRT[i], label: role.label, pose: 'stand' }));
  people.push({ id: 7, role: ROLES[1], skin: SKIN[4], shirt: SHIRT[2], label: 'Walking', pose: 'walk' });
  people.push({ id: 8, role: ROLES[2], skin: SKIN[2], shirt: SHIRT[5], label: 'Carrying a block', pose: 'carry' });
  const rowZ = items.length ? (Math.ceil(items.length / cols) / 2) * gap + 4 : 0;
  const scale = items.length ? 2.6 : 3.2, step = items.length ? 7 : 3.4;
  // a second row behind: the founder and the legendary Blockies
  const legends = Object.entries(CONFIG.legends || {}).map(([id]) => { const b = makeBuilder(Number(id), 0); return { ...b, label: `★ ${b.legend.label}`, pose: 'stand', row: 1 }; });
  if (legendsOnly) people.length = 0;
  people.push(...legends);
  people.forEach((b, i) => {
    const m = buildBlocky(b);
    const inRow = b.row ? legends.indexOf(b) : i, rowLen = b.row ? legends.length : people.length - legends.length;
    const back = b.row && !legendsOnly ? step * 2.4 : 0; // legends stand in their own row behind the crew
    m.group.scale.setScalar(scale);
    m.group.position.set((inRow - (rowLen - 1) / 2) * step, 0, rowZ - back);
    m.carry.visible = b.pose === 'carry';
    scene.add(m.group);
    crew.push({ ...m, pose: b.pose, phase: i });
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = b.label;
    document.body.appendChild(tag);
    tags.push([tag, m.group.position.clone().add(new THREE.Vector3(0, 0, 1.6))]);
  });
}

const span = items.length ? 16 + 6 * Math.ceil(items.length / 3) : 14;
const aspect = innerWidth / innerHeight, s = only ? Math.max(span, (items.length ? 0 : 32) / aspect) : 82;
const camera = new THREE.OrthographicCamera((-s * aspect) / 2, (s * aspect) / 2, s / 2, -s / 2, -300, 300);
camera.position.set(40, 40, 40);
const controls = new OrbitControls(camera, renderer.domElement);
const animated = [];
scene.traverse((o) => { if (o.userData.animate) animated.push(o); });
const clock = new THREE.Timer();
const v = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  clock.update();
  const t = clock.getElapsed();
  for (const o of animated) o.userData.animate(t, Math.min(clock.getDelta(), 0.1));
  for (const c of crew) { // walk cycle, arms up when carrying
    if (c.pose === 'stand') continue;
    const sw = Math.sin(t * 6 + c.phase) * 0.6;
    c.legs[0].rotation.x = sw; c.legs[1].rotation.x = -sw;
    if (c.pose === 'carry') c.arms[0].rotation.x = c.arms[1].rotation.x = -1.3;
    else { c.arms[0].rotation.x = -sw; c.arms[1].rotation.x = sw; }
  }
  controls.update();
  renderer.render(scene, camera);
  for (const [tag, pos] of tags) {
    v.copy(pos).project(camera);
    tag.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    tag.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  }
});
