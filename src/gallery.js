// Dev tool: every building design side by side. Open /gallery.html while `npm run dev` runs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOG, ROLES, cityCrew, makeBlocky, rarityOf, TRAIT_LABEL } from './sim.js';
import { blockySvg } from './voxel-svg.js';
import { buildBlocky } from './citizens.js';
import { CONFIG } from './config.js';
import { buildingGroup, ruinGroup, adWall, updateBoards, kitFor, reserveLot } from './city.js';
import { dronesSample } from './agents.js';
import { FLEET, makeService, flash } from './fleet.js';
import { metroSample } from './metro.js';

// the service vehicles side by side on a stretch of road, light bars flashing
function fleetShowcase() {
  const g = new THREE.Group();
  const road = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.15, 6.4), new THREE.MeshLambertMaterial({ color: 0x3b4048 }));
  road.position.y = 0.075;
  road.receiveShadow = true;
  g.add(road);
  FLEET.forEach((kind, i) => {
    const v = makeService(kind);
    v.position.set(0, 0.15, -2.25 + i * 1.5);
    g.add(v);
  });
  g.userData.animate = (t) => flash(t);
  return g;
}

// the NFT portraits (src/voxel-svg.js, the image of every BaseCity Blockies token) in frames
function nftWall() {
  const g = new THREE.Group();
  const trait = (t) => { for (let n = 2; n < 5000; n++) if (rarityOf(n).trait === t) return makeBlocky(n, 0, '0x1'); };
  const [founder, jesse] = cityCrew(0);
  const picks = [makeBlocky(2, 0, '0x1'), trait('shades'), trait('lasereyes'), trait('crown'), founder, jesse];
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x1b2440 });
  picks.forEach((b, i) => {
    const tex = new THREE.Texture();
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => { tex.image = img; tex.needsUpdate = true; };
    img.src = URL.createObjectURL(new Blob([blockySvg(b, { size: 512 })], { type: 'image/svg+xml' }));
    const x = ((i % 3) - 1) * 2.9, y = i < 3 ? 4.5 : 1.6;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.7, 2.7, 0.2), frameMat);
    frame.position.set(x, y, -0.12);
    frame.castShadow = true;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: tex }));
    pic.position.set(x, y, 0);
    g.add(frame, pic);
  });
  for (const x of [-4.4, 4.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 6, 0.25), frameMat);
    post.position.set(x, 3, -0.2);
    g.add(post);
  }
  return g;
}

// sample quotes so the exchange boards have something to show (the city shows live ones)
updateBoards({ market: { priceUsd: 0.0000301, change24h: 4.2, volume24h: 1240, stocks: [{ symbol: 'NVDAc', priceUsd: 182.4 }] }, population: 19 });

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
  { label: 'Billboards', p: { type: 'billboards' }, make: adWall },
  { label: 'Service vehicles', p: { type: 'vehicles' }, make: fleetShowcase },
  { label: 'BaseCity Metro', p: { type: 'metro' }, make: metroSample },
  { label: 'AI agent drones', p: { type: 'drones' }, make: dronesSample },
  { label: 'Whale Fountain ($1k+ buy)', p: { k: 0, kind: 'wonder', type: 'wonder', whale: { from: '0x1234567890abcdef1234567890abcdef12345678', usd: 1500 } } },
  { label: 'NFT portraits (BaseCity Blockies)', p: { type: 'nft' }, make: nftWall },
  { label: 'Abandoned after a big exit', p: { type: 'ruin' }, make: () => ruinGroup({ k: 7, kind: 'building', type: 'apartment', w: 6, d: 5, h: 6, color: 0xe2c9a5 }) },
  { label: 'Abandoned shop', p: { type: 'ruin' }, make: () => ruinGroup({ k: 4, kind: 'building', type: 'shop', w: 5, d: 4, h: 2, color: 0xfff1e0 }) },
  { label: 'Woods the city keeps', p: { type: 'reserve' }, make: () => kitFor((k) => reserveLot(k, -8, 2)) },
  { label: 'Woods with a pond', p: { type: 'reserve' }, make: () => kitFor((k) => reserveLot(k, -8, 3)) },
];
// ?only=liberty,coaster shows just those designs, up close
// ?only=legends, ?only=blockies, or legend names: ?only=Jesse,Ahaan Raizada shows just those, up close
const only = new URLSearchParams(location.search).get('only')?.split(',').map((x) => x.trim());
const legendNames = new Set([CONFIG.founder?.name, ...(CONFIG.legends || []).map((l) => l.name)].filter(Boolean).map((n) => n.toLowerCase()));
const pickedLegends = only?.filter((x) => legendNames.has(x.toLowerCase())).map((x) => x.toLowerCase()) ?? [];
const showRare = !only || only.includes('rare') || only.includes('blockies');
const showBlockies = !only || only.includes('blockies') || only.includes('legends') || only.includes('rare') || pickedLegends.length > 0;
const legendsOnly = (only?.includes('legends') || pickedLegends.length > 0) && !only.includes('blockies');
if (only) items.splice(0, items.length, ...items.filter((it) => only.includes(it.p.type)));
const cols = only ? Math.max(1, Math.min(3, items.length)) : 6, gap = 11;
const rows = Math.ceil(items.length / cols);
const tags = [];
items.forEach((it, n) => {
  const g = it.make ? it.make() : buildingGroup(it.p);
  g.position.set(((n % cols) - (cols - 1) / 2) * gap, 0, (Math.floor(n / cols) - (Math.ceil(items.length / cols) - 1) / 2) * gap);
  scene.add(g);
  const tag = document.createElement('div');
  tag.className = 'tag';
  tag.textContent = it.label;
  document.body.appendChild(tag);
  tags.push([tag, g.position.clone().add(new THREE.Vector3(0, 0, 4))]);
});

// ----- the Blockies: one per role, the tier uniforms, a walker and a carrier; then the legends -----
const crew = [];
if (showBlockies) {
  const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xf5d0a9];
  const SHIRT = [0x3fa34d, 0x2e86de, 0xe67e22, 0x9b59b6, 0xe74c3c, 0x1abc9c];
  const tier0 = { id: 'blocky', label: 'Blocky' };
  const people = ROLES.filter((r) => r.id !== 'founder') // the founder is a legend
    .map((role, i) => ({ id: i + 2, role, tier: tier0, skin: SKIN[i], shirt: SHIRT[i], label: role.label, pose: 'stand' }));
  // a Base Builder without a hand-made look wears the uniform with a gold star
  people.push({ id: 21, role: ROLES[3], tier: { id: 'base', label: 'Base Builder', pro: true }, legend: { name: 'Base Builder' }, skin: SKIN[1], shirt: SHIRT[1], label: '🔷 Base Builder uniform', pose: 'stand' });
  people.push({ id: 7, role: ROLES[1], tier: tier0, skin: SKIN[4], shirt: SHIRT[2], label: 'Walking', pose: 'walk' });
  people.push({ id: 8, role: ROLES[2], tier: tier0, skin: SKIN[2], shirt: SHIRT[5], label: 'Carrying a block', pose: 'carry' });
  // the founder and every legend (real Base builders), in even rows in front of the crew
  const legends = cityCrew(0).map((b) => ({ ...b, label: `★ ${b.name}`, pose: 'stand' }))
    .filter((b) => !pickedLegends.length || pickedLegends.includes(b.name.toLowerCase()));
  // one Blocky per rare trait, labelled with its odds
  const rares = CONFIG.rarity.flatMap((r) => r.traits.map((trait, i) => ({
    id: 40 + i, role: ROLES[1 + (i % 5)], tier: tier0, skin: SKIN[(i + 2) % 6], shirt: SHIRT[(i + 3) % 6], rarity: r, trait, pose: 'stand',
    label: `${r.label} · ${TRAIT_LABEL[trait]} (${+(r.chance * 100).toFixed(1)}%)`,
  })));
  const lines = [];
  const rareOnly = only?.includes('rare') && !only.includes('blockies');
  if (!legendsOnly && !rareOnly) lines.push(people);
  if (showRare && !legendsOnly) lines.push(rares);
  if (rareOnly) legends.length = 0;
  const perRow = Math.ceil(legends.length / Math.ceil(legends.length / 8)); // even rows of up to 8
  for (let i = 0; i < legends.length; i += perRow) lines.push(legends.slice(i, i + perRow));
  const rowZ = items.length ? (rows / 2) * gap + 4 : 0;
  const scale = items.length ? 2.6 : 3.2, step = items.length ? 7 : 3.4, rowGap = items.length ? 8 : step * 2.6;
  lines.forEach((row, r) => row.forEach((b, i) => {
    const m = buildBlocky(b);
    m.group.scale.setScalar(scale);
    m.group.position.set((i - (row.length - 1) / 2) * step, 0, rowZ + r * rowGap);
    m.carry.visible = b.pose === 'carry';
    scene.add(m.group);
    crew.push({ ...m, pose: b.pose, phase: i });
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = b.label;
    document.body.appendChild(tag);
    tags.push([tag, m.group.position.clone().add(new THREE.Vector3(0, 0, 1.6))]);
  }));
}

// a lawn under everything, then frame it all from the city's isometric angle
const box = new THREE.Box3();
for (const o of scene.children) if (!o.isLight) box.expandByObject(o);
const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
const ground = new THREE.Mesh(new THREE.BoxGeometry(size.x + 8, 0.2, size.z + 8), new THREE.MeshLambertMaterial({ color: 0x6cc24a }));
ground.position.set(center.x, -0.1, center.z);
ground.receiveShadow = true;
scene.add(ground);
Object.assign(sun.shadow.camera, { left: -size.x, right: size.x, top: size.z, bottom: -size.z });
sun.position.set(center.x + 30, 50, center.z + 20);
sun.target.position.copy(center);
scene.add(sun.target);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 300);
camera.position.copy(center).add(new THREE.Vector3(40, 40, 40));
camera.lookAt(center);
camera.updateMatrixWorld();
const view = new THREE.Box3();
for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) view.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
const aspect = innerWidth / innerHeight;
const fitH = Math.max(view.max.y - view.min.y, (view.max.x - view.min.x) / aspect) * 1.08 + 3;
Object.assign(camera, { left: (-fitH * aspect) / 2, right: (fitH * aspect) / 2, top: fitH / 2, bottom: -fitH / 2 });
camera.updateProjectionMatrix();
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(center);
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
