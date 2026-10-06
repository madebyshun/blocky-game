// Blockies that move: a 3D stage for one Blocky (drag to turn it) and its moves (BaseCity's own: gm,
// Build, Diamond Hands, To the Moon, Bot Mode, Based),
// posed on the rig buildBlocky makes (body, two arms from the shoulders, two legs from the hips).
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

// BaseCity's own moves, 7 of them.
export const MOVES = {
  idle: { label: 'Idle', period: 4, pose(r, t) {
    const a = (t / 4) * TAU;
    r.root.position.y = Math.abs(s(a * 2)) * 0.008;
    r.body.rotation.y = s(a) * 0.18;
    arm(r, 0, s(a * 2) * 0.05, 0.06); arm(r, 1, -s(a * 2) * 0.05, 0.06);
  } },
  // gm: both hands up, waving in turn, swaying side to side
  gm: { label: 'gm 👋', period: 1.6, pose(r, t) {
    const a = (t / 1.6) * TAU;
    arm(r, 1, -0.2, 2.5 + s(a * 2) * 0.4);
    arm(r, 0, -0.2, 2.5 - s(a * 2) * 0.4);
    r.body.rotation.z = s(a) * 0.08;
    r.root.position.x = s(a) * 0.04;
    r.root.position.y = Math.abs(s(a * 2)) * 0.03;
  } },
  // Build: lift a block overhead, slam it down, a little hop
  build: { label: 'Build 🧱', period: 1.4, pose(r, t) {
    const f = t / 1.4;
    const lift = f < 0.55 ? Math.sin((f / 0.55) * (Math.PI / 2)) : Math.max(0, 1 - ((f - 0.55) / 0.12)); // up slowly, down fast
    r.carry.visible = true;
    r.carry.position.set(0, 0.62 + lift * 0.95, 0.34 - lift * 0.22);
    arm(r, 0, -1.2 - lift * 1.6, 0.18); arm(r, 1, -1.2 - lift * 1.6, 0.18);
    const slam = f > 0.67 && f < 0.85 ? s(((f - 0.67) / 0.18) * Math.PI) : 0;
    r.root.position.y = slam * 0.08 - (1 - lift) * 0.02;
    r.body.rotation.x = 0.12 - lift * 0.18;
    leg(r, 0, -slam * 0.25, 0.05); leg(r, 1, -slam * 0.25, 0.05);
  } },
  // Diamond Hands: hands together around a glowing diamond, nodding to the beat
  diamond: { label: 'Diamond Hands 💎', period: 2, pose(r, t) {
    const b = (t / 2) * 4 * TAU;
    r.gem.visible = true;
    r.gem.rotation.y = (t / 2) * TAU;
    r.gem.position.y = 0.66 + Math.abs(s(b / 2)) * 0.03;
    arm(r, 0, -1.25 + Math.abs(s(b / 2)) * 0.1, -0.38); arm(r, 1, -1.25 + Math.abs(s(b / 2)) * 0.1, -0.38);
    r.body.rotation.x = Math.abs(s(b / 2)) * 0.1;
    r.body.rotation.z = s(b / 4) * 0.07;
    r.root.position.y = Math.abs(s(b / 2)) * 0.02;
  } },
  // To the Moon: crouch, jump, each one higher, hands to the sky
  moon: { label: 'To the Moon 🚀', period: 2.4, pose(r, t) {
    const i = Math.floor(t / 0.8), f = (t % 0.8) / 0.8, h = [0.1, 0.17, 0.26][i];
    const air = f > 0.3 ? s(((f - 0.3) / 0.7) * Math.PI) : 0, crouch = f < 0.3 ? s((f / 0.3) * Math.PI) : 0;
    r.root.position.y = air * h - crouch * 0.05;
    arm(r, 0, -0.15, 0.6 + air * 2.3); arm(r, 1, -0.15, 0.6 + air * 2.3);
    leg(r, 0, -air * 0.35 + crouch * 0.2, 0.06); leg(r, 1, air * 0.25 + crouch * 0.2, 0.06);
    r.body.rotation.x = crouch * 0.2;
    r.root.rotation.y = i === 2 ? air * TAU : 0; // the last one spins
  } },
  // Bot Mode: robotic, in frozen steps, like an AI agent booting up
  bot: { label: 'Bot Mode 🤖', period: 2, pose(r, t) {
    const k = Math.floor((t / 2) * 8); // 8 frozen poses
    const P = [[0, 0, 0, 0, 0], [-1.57, 0, 0, 0, 0.3], [-1.57, -1.57, 0, 0, -0.3], [0, -1.57, 1.57, 0, 0], [0, 0, 1.57, 1.57, 0], [-0.8, 0, 0, 1.57, 0.5], [-0.8, -0.8, 0, 0, -0.5], [0, 0, 0, 0, 0]];
    const [rx, lx, rz, lz, turn] = P[k];
    arm(r, 1, rx, rz); arm(r, 0, lx, lz);
    r.body.rotation.y = turn;
    r.root.position.y = k % 2 ? 0.02 : 0;
    leg(r, k % 4 === 1 ? 0 : 1, k % 2 ? -0.2 : 0);
  } },
  // Based: a full spin, then arms crossed and a slow nod
  based: { label: 'Based 😎', period: 2.4, pose(r, t) {
    const f = t / 2.4;
    if (f < 0.4) {
      const u = f / 0.4, e = u * u * (3 - 2 * u);
      r.root.rotation.y = e * TAU;
      r.root.position.y = s(u * Math.PI) * 0.1;
      arm(r, 0, 0, 0.5 + s(u * Math.PI) * 0.6); arm(r, 1, 0, 0.5 + s(u * Math.PI) * 0.6);
    } else {
      const u = (f - 0.4) / 0.6, cross = Math.min(1, u * 4);
      arm(r, 0, -1.3 * cross, -0.55 * cross); arm(r, 1, -1.1 * cross, -0.55 * cross);
      r.body.rotation.x = s(u * TAU * 2) * 0.06;
      r.body.rotation.y = -0.15 * cross;
      leg(r, 1, 0, 0.12 * cross);
    }
  } },
};

// A Base Builder's signature move, by their job on the City Council
const SIGNATURE = {
  mayor: 'gm', speaker: 'gm', tourism: 'gm', governor: 'based', founder: 'build', ventures: 'based',
  ai: 'bot', cto: 'bot', robotics: 'bot', treasurer: 'diamond', markets: 'diamond', mint: 'diamond',
  events: 'moon', culture: 'moon', arts: 'moon', night: 'moon',
};
export const signatureMove = (b) => SIGNATURE[b.office?.id] || (b.kind === 'founder' ? 'build' : 'build');

function rigOf(b) {
  const { group, legs, arms, carry } = buildBlocky(b);
  group.scale.setScalar(1);
  const root = new THREE.Group();
  root.add(group);
  // the diamond of Diamond Hands, between the hands
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshLambertMaterial({ color: 0x8fe9ff, emissive: 0x2ab7e0, emissiveIntensity: 0.9 }));
  gem.position.set(0, 0.66, 0.5);
  gem.visible = false;
  root.add(gem);
  return { root, body: group, legs, arms, carry, gem, carryAt: carry.position.clone() };
}
function rest(r) {
  r.root.position.set(0, 0, 0); r.root.rotation.set(0, 0, 0);
  r.body.rotation.set(0, 0, 0);
  for (const p of [...r.legs, ...r.arms]) p.rotation.set(0, 0, 0);
  r.gem.visible = false;
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
