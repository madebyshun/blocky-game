// Dev tool: every building design side by side. Open /gallery.html while `npm run dev` runs.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CATALOG } from './sim.js';
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
const cols = 6, gap = 11;
const ground = new THREE.Mesh(new THREE.BoxGeometry(cols * gap + 4, 0.2, Math.ceil(items.length / cols) * gap + 4), new THREE.MeshLambertMaterial({ color: 0x6cc24a }));
ground.position.y = -0.1;
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

const aspect = innerWidth / innerHeight, s = 70;
const camera = new THREE.OrthographicCamera((-s * aspect) / 2, (s * aspect) / 2, s / 2, -s / 2, -300, 300);
camera.position.set(40, 40, 40);
const controls = new OrbitControls(camera, renderer.domElement);
const v = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  for (const [tag, pos] of tags) {
    v.copy(pos).project(camera);
    tag.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    tag.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  }
});
