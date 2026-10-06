// Blockies that move: a 3D stage for one Blocky (drag to turn it) and its moves (walking, carrying,
// building like in the city, and a few dances), posed on the rig buildBlocky makes (body, two arms from the shoulders, two legs from the hips).
// Every move loops over `period` seconds, so one period is a seamless GIF.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { buildBlocky } from './citizens.js';
import { paintBackground } from './pfp.js';

const TAU = Math.PI * 2;
const s = Math.sin;
// arms: [left, right] (x = -0.3, +0.3); rotation.x < 0 swings an arm forward, rotation.z raises it
// sideways (+ for the right arm, − for the left). Legs: rotation.x < 0 kicks forward.
const arm = (rig, i, x, z = 0, y = 0) => { rig.arms[i].rotation.set(x, y, i ? z : -z); };
const leg = (rig, i, x, z = 0) => { rig.legs[i].rotation.set(x, 0, i ? z : -z); };

const walkLegs = (r, a, k) => { leg(r, 0, s(a) * k); leg(r, 1, -s(a) * k); };

// What Blockies do in the city (the same motions as src/citizens.js), then a few dances.
export const MOVES = {
  idle: { label: 'Idle', group: 'city', period: 4, pose(r, t) {
    const a = (t / 4) * TAU;
    r.root.position.y = Math.abs(s(a * 2)) * 0.008;
    r.body.rotation.y = s(a) * 0.18;
    arm(r, 0, s(a * 2) * 0.05, 0.06); arm(r, 1, -s(a * 2) * 0.05, 0.06);
  } },
  walk: { label: 'Walk', group: 'city', period: 0.64, pose(r, t) {
    const a = (t / 0.64) * TAU;
    walkLegs(r, a, 0.6);
    arm(r, 0, -s(a) * 0.6); arm(r, 1, s(a) * 0.6);
    r.root.position.y = Math.abs(s(a)) * 0.05;
  } },
  run: { label: 'Run', group: 'city', period: 0.44, pose(r, t) {
    const a = (t / 0.44) * TAU;
    walkLegs(r, a, 1);
    arm(r, 0, -s(a) * 1.1 - 0.25); arm(r, 1, s(a) * 1.1 - 0.25);
    r.body.rotation.x = 0.15;
    r.root.position.y = Math.abs(s(a)) * 0.1;
  } },
  carry: { label: 'Carry a block', group: 'city', period: 0.64, pose(r, t) {
    const a = (t / 0.64) * TAU;
    walkLegs(r, a, 0.6);
    arm(r, 0, -1.3); arm(r, 1, -1.3);
    r.carry.visible = true;
    r.root.position.y = Math.abs(s(a)) * 0.05;
  } },
  build: { label: 'Build', group: 'city', period: 0.8, pose(r, t) {
    const a = (t / 0.8) * TAU;
    arm(r, 0, -1.5 + s(a) * 0.5); arm(r, 1, -1.5 - s(a) * 0.5);
    r.carry.visible = true; // the block it's setting, in front of its feet
    r.carry.position.set(0, 0.19, 0.62);
    r.body.rotation.x = 0.12 + Math.abs(s(a)) * 0.05;
  } },
  wave: { label: 'Wave', group: 'city', period: 1, pose(r, t) {
    const a = t * TAU;
    arm(r, 1, -0.15, 2.6 + s(a * 2) * 0.35);
    arm(r, 0, 0, 0.08);
    r.body.rotation.z = s(a) * 0.04;
  } },
  bounce: { label: 'Bounce', group: 'dance', period: 1, pose(r, t) {
    const a = t * TAU;
    r.root.position.y = Math.abs(s(a * 2)) * 0.07;
    arm(r, 0, -0.6 - s(a * 2) * 0.5, 0.25); arm(r, 1, -0.6 + s(a * 2) * 0.5, 0.25);
    r.body.rotation.y = s(a) * 0.2;
  } },
  sway: { label: 'Sway', group: 'dance', period: 2, pose(r, t) {
    const a = (t / 2) * TAU;
    r.root.position.x = s(a) * 0.08;
    r.body.rotation.z = -s(a) * 0.1;
    leg(r, 0, 0, Math.max(0, s(a)) * 0.2); leg(r, 1, 0, Math.max(0, -s(a)) * 0.2);
    arm(r, 0, 0, 0.5 + s(a) * 0.4); arm(r, 1, 0, 0.5 - s(a) * 0.4);
  } },
  spin: { label: 'Spin', group: 'dance', period: 1.6, pose(r, t) {
    const u = t / 1.6, e = u * u * (3 - 2 * u);
    r.root.rotation.y = e * TAU;
    arm(r, 0, 0, 1.3); arm(r, 1, 0, 1.3);
    r.root.position.y = s(u * Math.PI) * 0.05;
  } },
  cheer: { label: 'Cheer', group: 'dance', period: 0.8, pose(r, t) {
    const a = (t / 0.8) * TAU, air = Math.max(0, s(a));
    r.root.position.y = air * 0.16;
    arm(r, 0, -0.2, 2.4 + air * 0.4); arm(r, 1, -0.2, 2.4 + air * 0.4);
    leg(r, 0, -air * 0.3, 0.08); leg(r, 1, air * 0.2, 0.08);
  } },
};

function rigOf(b) {
  const { group, legs, arms, carry } = buildBlocky(b);
  group.scale.setScalar(1);
  const root = new THREE.Group();
  root.add(group);
  return { root, body: group, legs, arms, carry, carryAt: carry.position.clone() };
}
function rest(r) {
  r.root.position.set(0, 0, 0); r.root.rotation.set(0, 0, 0);
  r.body.rotation.set(0, 0, 0);
  for (const p of [...r.legs, ...r.arms]) p.rotation.set(0, 0, 0);
  r.carry.visible = false;
  r.carry.position.copy(r.carryAt);
}

// A stage in `el`: the Blocky turning on its own unless dragged, playing `move`.
export function createStage(el) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8796ad, 2.3));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.2); key.position.set(2.5, 3.5, 4);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 1.1); rim.position.set(-3, 2, -2);
  scene.add(key, rim);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
  shadow.position.y = 0.002;
  scene.add(shadow);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  const home = new THREE.Vector3(1.6, 1.35, 4.3);
  camera.position.copy(home);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enablePan: false, enableDamping: true, minDistance: 2.6, maxDistance: 7, minPolarAngle: 0.5, maxPolarAngle: 1.75 });
  controls.target.set(0, 0.72, 0);
  controls.update();

  let rig = null, move = MOVES.idle, start = performance.now(), bgTex = null;
  const size = () => { const w = el.clientWidth; renderer.setSize(w, w, false); };
  new ResizeObserver(size).observe(el);
  size();
  function pose(t) { if (!rig) return; rest(rig); move.pose(rig, t % move.period); }
  (function loop() {
    if (el.offsetWidth) { // not while hidden (a closed dialog)
      pose((performance.now() - start) / 1000);
      controls.update();
      renderer.render(scene, camera);
    }
    requestAnimationFrame(loop);
  })();

  return {
    canvas: renderer.domElement,
    set blocky(b) {
      if (rig) scene.remove(rig.root);
      camera.position.copy(home); // a new Blocky: the camera back where it starts
      controls.target.set(0, 0.72, 0);
      controls.update();
      rig = rigOf(b);
      scene.add(rig.root);
      const cv = Object.assign(document.createElement('canvas'), { width: 512, height: 512 });
      paintBackground(cv.getContext('2d'), b, 512);
      bgTex?.dispose();
      bgTex = new THREE.CanvasTexture(cv);
      bgTex.colorSpace = THREE.SRGBColorSpace;
      scene.background = bgTex;
    },
    set move(id) { move = MOVES[id] || MOVES.idle; start = performance.now(); },
    // one loop of the move as a GIF (Uint8Array), from the front three-quarter view, `px` square
    gif({ px = 480, fps = 20 } = {}) {
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1);
      r.setSize(px, px, false);
      const cam = camera.clone();
      cam.position.copy(home); cam.lookAt(0, 0.72, 0); cam.aspect = 1; cam.updateProjectionMatrix();
      const cv = Object.assign(document.createElement('canvas'), { width: px, height: px });
      const g = cv.getContext('2d', { willReadFrequently: true });
      const gif = GIFEncoder();
      const frames = Math.max(8, Math.round(move.period * fps));
      let palette = null;
      for (let i = 0; i < frames; i++) {
        pose((i / frames) * move.period);
        r.render(scene, cam);
        g.drawImage(r.domElement, 0, 0);
        const { data } = g.getImageData(0, 0, px, px);
        palette ||= quantize(data, 256);
        gif.writeFrame(applyPalette(data, palette), px, px, { palette: i ? undefined : palette, delay: Math.round(1000 / fps) });
      }
      gif.finish();
      r.dispose();
      start = performance.now();
      return gif.bytes();
    },
  };
}
