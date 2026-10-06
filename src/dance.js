// Blockies that move: a 3D stage for one Blocky (drag to turn it) and its moves, from idle to Thriller,
// posed on the rig buildBlocky makes (body, two arms from the shoulders, two legs from the hips).
// Every move loops over `period` seconds, so one period is a seamless GIF.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { buildBlocky } from './citizens.js';
import { paintBackground } from './pfp.js';

const TAU = Math.PI * 2;
const s = Math.sin, c = Math.cos;
// arms: [left, right] (x = -0.3, +0.3); rotation.x < 0 swings an arm forward, rotation.z raises it
// sideways (+ for the right arm, − for the left). Legs: rotation.x < 0 kicks forward.
const arm = (rig, i, x, z = 0, y = 0) => { rig.arms[i].rotation.set(x, y, i ? z : -z); };
const leg = (rig, i, x, z = 0) => { rig.legs[i].rotation.set(x, 0, i ? z : -z); };
const walkLegs = (rig, a, k) => { leg(rig, 0, s(a) * k); leg(rig, 1, -s(a) * k); };

export const MOVES = {
  idle: { label: 'Idle', period: 4, pose(r, t) {
    const a = (t / 4) * TAU;
    r.root.position.y = Math.abs(s(a * 2)) * 0.008;
    r.body.rotation.y = s(a) * 0.18;
    arm(r, 0, s(a * 2) * 0.05, 0.06); arm(r, 1, -s(a * 2) * 0.05, 0.06);
  } },
  walk: { label: 'Walk', period: 1, pose(r, t) {
    const a = t * TAU;
    walkLegs(r, a, 0.6);
    arm(r, 0, -s(a) * 0.55); arm(r, 1, s(a) * 0.55);
    r.root.position.y = Math.abs(c(a)) * 0.035;
  } },
  run: { label: 'Run', period: 0.6, pose(r, t) {
    const a = (t / 0.6) * TAU;
    walkLegs(r, a, 1.05);
    arm(r, 0, -s(a) * 1.1 - 0.2); arm(r, 1, s(a) * 1.1 - 0.2);
    r.body.rotation.x = 0.16;
    r.root.position.y = Math.abs(c(a)) * 0.09;
  } },
  wave: { label: 'Wave', period: 1, pose(r, t) {
    const a = t * TAU;
    arm(r, 1, 0, 2.6 + s(a * 2) * 0.35);
    arm(r, 0, 0, 0.08);
    r.body.rotation.z = s(a) * 0.04;
    r.root.position.y = Math.abs(s(a)) * 0.015;
  } },
  thumbs: { label: 'Thumbs up', period: 1.6, pose(r, t) {
    const a = (t / 1.6) * TAU;
    arm(r, 1, -1.5 + s(a * 2) * 0.08, 0.1);
    arm(r, 0, 0, 0.06);
    r.thumb.visible = true;
    r.body.rotation.y = 0.15 + s(a) * 0.06;
    r.root.position.y = Math.abs(s(a)) * 0.02;
  } },
  hiphop: { label: 'Hip hop', period: 2, pose(r, t) {
    const b = (t / 2) * 4 * TAU; // four beats
    r.root.position.y = -Math.abs(s(b / 2)) * 0.06 + 0.06;
    r.body.rotation.y = s(b / 4) * 0.35;
    r.body.rotation.x = Math.abs(s(b / 2)) * 0.12;
    arm(r, 0, -0.9 - s(b / 2) * 0.6, 0.35); arm(r, 1, -0.9 + s(b / 2) * 0.6, 0.35);
    leg(r, 0, -Math.abs(s(b / 2)) * 0.25, 0.08); leg(r, 1, -Math.abs(s(b / 2)) * 0.25, 0.08);
  } },
  shuffle: { label: 'Shuffle', period: 1, pose(r, t) {
    const a = t * TAU;
    leg(r, 0, s(a * 2) > 0 ? -s(a * 2) * 0.8 : 0, 0.12); leg(r, 1, s(a * 2) < 0 ? s(a * 2) * 0.8 : 0, 0.12);
    r.root.position.x = s(a) * 0.12;
    r.root.position.y = Math.abs(s(a * 2)) * 0.05;
    arm(r, 0, s(a * 2) * 0.7, 0.3); arm(r, 1, -s(a * 2) * 0.7, 0.3);
    r.body.rotation.z = -s(a) * 0.06;
  } },
  gangnam: { label: 'Gangnam', period: 2, pose(r, t) {
    const b = (t / 2) * 4 * TAU;
    const lasso = t % 2 > 1; // two bars riding, then the lasso
    r.root.position.y = Math.abs(s(b)) * 0.1;
    leg(r, 0, -Math.max(0, s(b)) * 0.6, 0.1); leg(r, 1, -Math.max(0, -s(b)) * 0.6, 0.1);
    if (lasso) { arm(r, 1, 0, 2.9, 0); r.arms[1].rotation.y = b; arm(r, 0, -1.3, -0.35); }
    else { arm(r, 0, -1.25 + s(b) * 0.12, -0.45); arm(r, 1, -1.25 + s(b) * 0.12, -0.45); }
    r.body.rotation.x = 0.08;
  } },
  macarena: { label: 'Macarena', period: 4, pose(r, t) {
    const beat = Math.floor((t / 4) * 8), f = ((t / 4) * 8) % 1, ease = Math.min(1, f * 3);
    // 8 beats: right arm out, left arm out, right to shoulder, left to shoulder, hands up, up, hips, hips
    const R = [[-1.5, 0], [-1.5, 0], [-2.5, -0.9], [-2.5, -0.9], [-3, 0.3], [-3, 0.3], [0.2, 0.5], [0.2, 0.5]];
    const L = [[0, 0], [-1.5, 0], [-1.5, 0], [-2.5, -0.9], [-2.5, -0.9], [-3, 0.3], [0.2, 0.5], [0.2, 0.5]];
    const prev = (A) => A[(beat + 7) % 8], cur = (A) => A[beat];
    const mix = (A, k) => prev(A)[k] + (cur(A)[k] - prev(A)[k]) * ease;
    arm(r, 1, mix(R, 0), mix(R, 1)); arm(r, 0, mix(L, 0), mix(L, 1));
    r.root.position.x = beat >= 6 ? s(f * TAU) * 0.07 : 0;
    r.body.rotation.z = beat >= 6 ? s(f * TAU) * 0.1 : 0;
    r.root.position.y = beat === 7 && f > 0.6 ? s((f - 0.6) / 0.4 * Math.PI) * 0.12 : 0;
    r.root.rotation.y = beat === 7 && f > 0.6 ? ((f - 0.6) / 0.4) * (Math.PI / 2) : 0;
  } },
  salsa: { label: 'Salsa', period: 2, pose(r, t) {
    const b = (t / 2) * TAU;
    leg(r, 0, s(b * 2) * 0.35); leg(r, 1, -s(b * 2) * 0.35);
    r.root.position.z = s(b * 2) * 0.05;
    r.root.position.x = s(b) * 0.05;
    r.body.rotation.z = s(b * 2) * 0.09;
    r.body.rotation.y = s(b) * 0.4;
    arm(r, 0, -0.4, 1.2 + s(b * 2) * 0.25); arm(r, 1, -0.4, 1.2 - s(b * 2) * 0.25);
  } },
  thriller: { label: 'Thriller', period: 2, pose(r, t) {
    const b = (t / 2) * TAU;
    const step = s(b * 2);
    arm(r, 0, -1.45 + s(b * 4) * 0.08, 0.15 + step * 0.1); arm(r, 1, -1.45 - s(b * 4) * 0.08, 0.15 - step * 0.1);
    leg(r, 0, -Math.max(0, step) * 0.35, 0.05); leg(r, 1, -Math.max(0, -step) * 0.35, 0.05);
    r.root.position.x = s(b) * 0.1;
    r.body.rotation.z = 0.14 + step * 0.06;
    r.body.rotation.x = 0.12;
    r.root.position.y = Math.abs(step) * 0.03;
  } },
};

function rigOf(b) {
  const { group, legs, arms } = buildBlocky(b);
  group.scale.setScalar(1);
  const root = new THREE.Group();
  root.add(group);
  // a thumb for Thumbs up: on the right hand, pointing up once the arm is forward
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.14), new THREE.MeshLambertMaterial({ color: b.skin ?? 0xe0ac69 }));
  thumb.position.set(-0.05, -0.46, 0.13);
  thumb.visible = false;
  arms[1].add(thumb);
  return { root, body: group, legs, arms, thumb };
}
function rest(r) {
  r.root.position.set(0, 0, 0); r.root.rotation.set(0, 0, 0);
  r.body.rotation.set(0, 0, 0);
  for (const p of [...r.legs, ...r.arms]) p.rotation.set(0, 0, 0);
  r.thumb.visible = false;
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
  const home = new THREE.Vector3(1.45, 1.25, 3.9);
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
    pose((performance.now() - start) / 1000);
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

  return {
    canvas: renderer.domElement,
    set blocky(b) {
      if (rig) scene.remove(rig.root);
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
