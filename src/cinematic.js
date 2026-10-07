// Cinematic mode: a film camera for BaseCity. A perspective lens and slow camera moves (a Blocky up
// close, tracking one through the streets, the construction site, the skyline from the edge of town, a
// drone flyover, a crane shot up the tallest building, the river), a real sky, bloom and depth of
// field, light presets, frames for every social format, and one-tap photos and 10-second clips with
// the BaseCity watermark, ready to share. Only this visitor's view changes: the city keeps building.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from './config.js';
import { PITCH, isWater, TRAIT_LABEL } from './sim.js';

const FORMATS = [
  { label: '2.39:1', ratio: 2.39, name: 'cinema' },
  { label: '16:9', ratio: 16 / 9, name: 'wide' },
  { label: '1:1', ratio: 1, name: 'square' },
  { label: '9:16', ratio: 9 / 16, name: 'story' },
];
const LIGHTS = [
  { label: '☀️ Live', phase: null, warm: 0 },
  { label: '🌅 Golden hour', phase: 0.485, warm: 1 },
  { label: '🌙 Night', phase: 0.78, warm: 0 },
  { label: '🌤 Noon', phase: 0.25, warm: 0 },
];
const CLIPS = [10, 30, 60]; // clip lengths, in seconds
const ease = (u) => u * u * (3 - 2 * u);
const v3 = () => new THREE.Vector3();
const angleTo = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// a gradient sky around the camera with the sun (and the moon at night) in it
const SKY = {
  vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float day;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      vec3 c = mix(bottom, top, smoothstep(-0.02, 0.55, d.y));
      float s = max(dot(d, sunDir), 0.0), m = max(dot(d, -sunDir), 0.0);
      c += sunColor * (smoothstep(0.9993, 0.9997, s) * 1.6 + pow(s, 14.0) * 0.28) * day;
      c += vec3(0.85, 0.88, 1.0) * smoothstep(0.9995, 0.9998, m) * (1.0 - day);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// Each shot frames the city for `dur` seconds: start(s) picks what it films (false: can't now), and
// frame(s, u, o) places the camera for u in 0..1. o.focus: depth of field on the subject.
function shots(city, sim) {
  const tallest = () => city.built.reduce((best, b) => (!best || b.h > best.h ? b : best), null);
  // the work cams: cameras around town that watch the Blockies at work, like a site's CCTV
  const siteNow = (s) => { // one of the construction sites on a lot (not the land's border or the metro), at random
    const list = (sim()?.sites || []).filter((x) => x.p?.lot && x.p.kind !== 'expand' && x.p.kind !== 'metro');
    if (!list.length) return false;
    s.site = list[Math.floor(Math.random() * list.length)];
    s.c = new THREE.Vector3(s.site.p.lot[0] * PITCH, 0, s.site.p.lot[1] * PITCH);
    s.a0 = Math.random() * Math.PI * 2;
    return true;
  };
  const siteUp = (s) => Math.min(1, s.site.placed / s.site.p.cost) * (s.site.p.h || 2); // how high it stands
  const siteCaption = (label) => (s) => [`📹 ${label}`, `${s.site.p.name} · ${Math.min(99, Math.floor((s.site.placed / s.site.p.cost) * 100))}% built`];
  const workerCaption = (label) => (s, v) => [v.b.name, `📹 ${label} · ${v.status}`];
  const sway = (u) => Math.sin(u * Math.PI * 2) * 0.06; // a fixed camera's slow pan
  return [
    { id: 'sitecam', label: 'Site cam', dur: 12, cam: true, caption: siteCaption('Site cam'), // up a pole down the street, looking at the site's front
      start: (s) => {
        if (!siteNow(s)) return false;
        const a = Math.floor(Math.random() * 4) * (Math.PI / 2), side = Math.random() < 0.5 ? -1 : 1;
        s.dir = v3().set(Math.cos(a), 0, Math.sin(a)); s.along = v3().set(-Math.sin(a) * side, 0, Math.cos(a) * side);
        const road = PITCH / 2; // lots are 6 wide with a road of 2 between them: the road's middle, clear of houses and trees
        s.pole = v3().copy(s.c).addScaledVector(s.dir, road).addScaledVector(s.along, 11);
        s.edge = v3().copy(s.c).addScaledVector(s.dir, road).setY(2.5);
        return true;
      },
      frame: (s, u, o) => {
        const up = siteUp(s);
        o.pos.copy(s.pole).setY(7 + up * 0.3); // above the houses along the street
        o.look.copy(s.c).addScaledVector(s.dir, 2).addScaledVector(s.along, sway(u) * 4).setY(1 + up * 0.25);
        o.pivot = s.edge; o.fov = 50; o.focus = false;
      } },
    { id: 'pilecam', label: 'Block pile cam', dur: 10, cam: true, caption: siteCaption('Block pile cam'), // the crew loading blocks at the pile by the site
      start: (s) => {
        if (!siteNow(s)) return false;
        s.d = v3().set(s.c.x + (s.c.x > 0 ? -1 : 1) * (PITCH / 2), 1, s.c.z + (s.c.z > 0 ? -1 : 1) * (PITCH / 2));
        s.out = v3().subVectors(s.d, s.c).setY(0).normalize();
        s.side = v3().set(-s.out.z, 0, s.out.x).multiplyScalar(Math.random() < 0.5 ? -2 : 2);
        return true;
      },
      frame: (s, u, o) => {
        o.pos.copy(s.d).addScaledVector(s.out, 5.5).add(s.side).setY(3.2);
        o.look.lerpVectors(s.d, s.c, 0.4).setY(0.8 + sway(u) * 4);
        o.pivot = s.d; o.fov = 46; o.focus = false;
      } },
    { id: 'cranecam', label: 'Crane cam', dur: 12, cam: true, caption: siteCaption('Crane cam'), // looking down from the crane: the crew like ants
      start: (s) => siteNow(s),
      frame: (s, u, o) => {
        const a = s.a0 + u * 0.4;
        o.pos.set(s.c.x + Math.cos(a) * 4, 11 + siteUp(s) * 1.1, s.c.z + Math.sin(a) * 4);
        o.look.set(s.c.x, 0, s.c.z);
        o.pivot = null; o.fov = 48; o.focus = false;
      } },
    { id: 'carrycam', label: 'Delivery cam', dur: 10, subject: true, cam: true, caption: workerCaption('Delivery cam'), // walking alongside one carrying blocks
      pick: (v) => v.mode === 'toSite',
      start: (s) => { s.side = Math.random() < 0.5 ? -1 : 1; [s.off, s.free] = s.clearAngle(s.side * 2.3, 6, 3.4); return s.free >= 4; },
      frame: (s, u, o) => {
        const a = s.face + s.off, r = Math.min(s.free, 6);
        o.pos.set(s.sp.x + Math.sin(a) * r, 3.4, s.sp.z + Math.cos(a) * r);
        o.look.set(s.sp.x + Math.sin(s.face) * 1.5, 0.8, s.sp.z + Math.cos(s.face) * 1.5);
        o.pivot = s.head; o.fov = 42; o.focus = false;
      } },
    { id: 'crewcam', label: 'Crew cam', dur: 10, subject: true, cam: true, caption: workerCaption('Crew cam'), // over the shoulder of one at work
      pick: (v) => v.mode === 'place' || v.mode === 'toSite',
      start: (s) => { s.side = Math.random() < 0.5 ? -1 : 1; [s.off, s.free] = s.clearAngle(Math.PI + s.side * 0.45, 5, 3); return s.free >= 3.5; },
      frame: (s, u, o) => {
        const a = s.face + s.off, r = Math.min(s.free, 5);
        o.pos.set(s.sp.x + Math.sin(a) * r, 3 + u * 0.3, s.sp.z + Math.cos(a) * r);
        o.look.set(s.sp.x + Math.sin(s.face) * 2.5, 1.1, s.sp.z + Math.cos(s.face) * 2.5);
        o.pivot = s.head; o.fov = 44; o.focus = false;
      } },
    { id: 'streetcam', label: 'Street cam', dur: 10, subject: true, cam: true, caption: workerCaption('Street cam'), // the ones off shift, around town
      pick: (v) => v.mode === 'break' && v.wait > 2, // standing around for a bit yet
      start: (s) => { s.side = Math.random() < 0.5 ? -1 : 1; [s.off, s.free] = s.clearAngle(s.side * 0.8, 7.5, 4.5); s.at = null; return s.free >= 5; },
      frame: (s, u, o) => {
        if (!s.at) { const a = s.face + s.off, r = Math.min(s.free, 7.5); s.at = v3().set(s.sp.x + Math.sin(a) * r, 4.5, s.sp.z + Math.cos(a) * r); } // a fixed pole
        o.pos.copy(s.at);
        o.look.set(s.sp.x, 0.8, s.sp.z);
        o.pivot = s.head; o.fov = 40; o.focus = false;
      } },
    { id: 'hero', label: 'Close-up', dur: 10, subject: true,
      start: (s) => { s.side = Math.random() < 0.5 ? -1 : 1; [s.off, s.free] = s.clearAngle(s.side * 0.5, 2.6); return s.free >= 2.1; },
      frame: (s, u, o) => {
        const a = s.face + s.off + s.side * u * 0.6, r = Math.min(s.free, 2.6) - u * 0.4;
        o.pos.set(s.sp.x + Math.sin(a) * r, 1.05 + u * 0.2, s.sp.z + Math.cos(a) * r);
        o.look.set(s.sp.x, 0.85, s.sp.z);
        o.pivot = o.look; o.fov = 30; o.focus = true;
      } },
    { id: 'medium', label: 'Street level', dur: 10, subject: true, // from up the street: the Blocky and the block around it
      start: (s) => { s.side = Math.random() < 0.5 ? -1 : 1; [s.off, s.free] = s.clearAngle(s.side * 0.9, 11, 5.5); return s.free >= 7; },
      frame: (s, u, o) => {
        const a = s.face + s.off + s.side * u * 0.35, r = Math.min(s.free, 11);
        o.pos.set(s.sp.x + Math.sin(a) * r, 5.5 + u * 0.8, s.sp.z + Math.cos(a) * r);
        o.look.set(s.sp.x, 0.7, s.sp.z);
        o.pivot = s.head; o.focusAt = s.head; o.fov = 42; o.focus = false;
      } },
    { id: 'aerial', label: 'Aerial', dur: 14, // the whole city from high up, turning slowly
      start: (s) => { s.H = city.land * PITCH; s.a0 = Math.random() * Math.PI * 2; s.dir = Math.random() < 0.5 ? -1 : 1; return true; },
      frame: (s, u, o) => {
        const a = s.a0 + s.dir * u * 0.5, R = s.H * 1.15 + 12;
        o.pos.set(Math.cos(a) * R, s.H * 0.75 + 14, Math.sin(a) * R);
        o.look.set(0, 0, 0);
        o.pivot = null; o.fov = 42; o.focus = false;
      } },
    { id: 'rooftops', label: 'Over the rooftops', dur: 12, // a slow orbit over one part of town
      start: (s) => {
        const lots = city.built.filter((b) => b.h >= 2);
        if (!lots.length) return false;
        s.b = lots[Math.floor(Math.random() * lots.length)]; s.a0 = Math.random() * Math.PI * 2; s.dir = Math.random() < 0.5 ? -1 : 1;
        return true;
      },
      frame: (s, u, o) => {
        const a = s.a0 + s.dir * u * 0.6, b = s.b, r = 15 + b.h * 0.6;
        o.pos.set(b.x + Math.cos(a) * r, 8 + b.h * 0.9, b.z + Math.sin(a) * r);
        o.look.set(b.x, b.h * 0.35, b.z);
        o.pivot = o.look; o.fov = 40; o.focus = false; // a taller tower in the way: the camera moves in front of it
      } },
    { id: 'gpucam', label: 'GPU District', dur: 11, // the Power Plant: the giant GPU, its fans and the NVDAc screen
      start: (s) => {
        const b = city.built.find((x) => x.type === 'hq-gpu');
        if (!b) return false;
        s.c = v3().set(b.x, 0, b.z); s.a0 = Math.PI * (0.3 + Math.random() * 0.4); s.dir = Math.random() < 0.5 ? -1 : 1;
        return true;
      },
      frame: (s, u, o) => {
        const a = s.a0 + s.dir * u * 0.5;
        o.pos.set(s.c.x + Math.cos(a) * 9.5, 6.2 - u * 1.2, s.c.z + Math.sin(a) * 9.5);
        o.look.set(s.c.x, 2.4, s.c.z);
        o.pivot = o.look; o.fov = 42; o.focus = false;
      } },
    { id: 'skyline', label: 'Skyline', dur: 11,
      start: (s) => {
        const t = tallest();
        s.R = city.land * PITCH + 30; s.a0 = Math.random() * Math.PI * 2;
        s.target = t ? new THREE.Vector3(t.x, Math.min(9, 1 + t.h * 0.45), t.z) : new THREE.Vector3(0, 3, 0);
        return true;
      },
      frame: (s, u, o) => {
        const a = s.a0 + (u - 0.5) * 0.22;
        o.pos.set(s.target.x + Math.cos(a) * s.R, 6, s.target.z + Math.sin(a) * s.R);
        o.look.copy(s.target);
        o.pivot = null; o.fov = 22; o.focus = false;
      } },
    { id: 'follow', label: 'Tracking', dur: 10, subject: true,
      start: (s) => { s.side = Math.random() < 0.5 ? -1 : 1; [s.off, s.free] = s.clearAngle(s.side * 2.2, 5, 3); return s.free >= 4; },
      frame: (s, u, o) => {
        const a = s.face + s.off, r = Math.min(s.free, 5);
        o.pos.set(s.sp.x + Math.sin(a) * r, 3 + u * 0.4, s.sp.z + Math.cos(a) * r);
        o.look.set(s.sp.x + Math.sin(s.face) * 0.8, 0.7, s.sp.z + Math.cos(s.face) * 0.8);
        o.pivot = s.head; o.focusAt = s.head; o.fov = 34; o.focus = true;
      } },
    { id: 'flyover', label: 'Flyover', dur: 12,
      start: (s) => {
        const H = city.land * PITCH, a = Math.random() * Math.PI * 2;
        s.from = new THREE.Vector3(Math.cos(a) * (H + 8), 13, Math.sin(a) * (H + 8));
        s.to = new THREE.Vector3(-Math.cos(a) * H * 0.25, 10, -Math.sin(a) * H * 0.25);
        s.dir = s.to.clone().sub(s.from).setY(0).normalize();
        return true;
      },
      frame: (s, u, o) => {
        o.pos.lerpVectors(s.from, s.to, ease(u));
        o.look.copy(o.pos).addScaledVector(s.dir, 16).setY(1.5);
        o.pivot = null; o.fov = 50; o.focus = false;
      } },
    { id: 'site', label: 'Construction site', dur: 10,
      start: (s) => {
        const p = sim()?.next;
        if (!p?.lot) return false;
        s.c = new THREE.Vector3(p.lot[0] * PITCH, 0, p.lot[1] * PITCH); s.a0 = Math.random() * Math.PI * 2; s.edge = new THREE.Vector3();
        return true;
      },
      frame: (s, u, o) => {
        const a = s.a0 + u * 0.55, r = 11 - u * 2.5, S = sim(), up = S ? Math.min(1, S.placed / S.next.cost) * (S.next.h || 2) : 2;
        o.pos.set(s.c.x + Math.cos(a) * r, 8.5 + u * 1.5, s.c.z + Math.sin(a) * r);
        o.look.set(s.c.x, 0.5 + up * 0.5, s.c.z);
        s.edge.set(s.c.x + Math.cos(a) * 3.6, o.pos.y * 0.6, s.c.z + Math.sin(a) * 3.6);
        o.pivot = s.edge; o.fov = 38; o.focus = false;
      } },
    { id: 'crane', label: 'Crane up', dur: 10,
      start: (s) => { const t = tallest(); if (!t || t.h < 6) return false; s.b = t; s.a = Math.random() * Math.PI * 2; s.edge = new THREE.Vector3(); return true; },
      frame: (s, u, o) => {
        const e = ease(u), b = s.b, r = 8 + e * 4;
        o.pos.set(b.x + Math.cos(s.a) * r, 1.6 + e * (b.h + 5), b.z + Math.sin(s.a) * r);
        o.look.set(b.x, 1.5 + e * (b.h + 0.5), b.z);
        s.edge.set(b.x + Math.cos(s.a) * 3.6, o.pos.y, b.z + Math.sin(s.a) * 3.6);
        o.pivot = s.edge; o.fov = 40; o.focus = false;
      } },
    { id: 'river', label: 'River', dur: 12,
      start: (s) => {
        const L = city.land, pts = [];
        for (let j = -L - 3; j <= L + 3; j++) {
          const xs = [];
          for (let i = -L - 4; i <= L + 4; i++) if (isWater(i, j)) xs.push(i);
          if (xs.length) pts.push(new THREE.Vector3((xs.reduce((a, b) => a + b, 0) / xs.length) * PITCH, 2.8, j * PITCH));
        }
        if (pts.length < 4) return false;
        s.curve = new THREE.CatmullRomCurve3(Math.random() < 0.5 ? pts : pts.reverse());
        return true;
      },
      frame: (s, u, o) => {
        const k = 0.12 + u * 0.6;
        s.curve.getPointAt(k, o.pos);
        s.curve.getPointAt(Math.min(1, k + 0.1), o.look);
        o.look.y = 1;
        o.pivot = null; o.fov = 46; o.focus = false;
      } },
  ];
}

// views(): the Blockies drawn now (id -> BuilderView); selected(): the id of the one picked, if any;
// sim(): the city sim; stats(): { day, minted }; onExit(): put the city view back.
// solids: more things the camera must not go through (the metro), besides the city's buildings and trees
// audio(): a MediaStream of the music for the clips' sound (null: silent clips)
export function createCinematic({ renderer, scene, city, controls, views, selected, sim, stats, onExit, onCaption = () => {}, audio = () => null, solids = [] }) {
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 700);
  const skyMat = new THREE.ShaderMaterial({
    ...SKY, side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: v3() }, sunColor: { value: new THREE.Color('#fff1c8') }, day: { value: 1 } },
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;

  let composer = null, bokeh = null, bloom = null;
  function passes() {
    if (composer) return;
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, cam));
    bokeh = new BokehPass(scene, cam, { focus: 4, aperture: 0.003, maxblur: 0.009 });
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.4, 0.9);
    composer.addPass(bokeh);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const SHOTS = shots(city, sim);
  // Auto (and the livestream): no close-ups, a work cam between two wide shots. ◀ ▶ reach every shot.
  const AUTO = ['aerial', 'sitecam', 'gpucam', 'rooftops', 'carrycam', 'skyline', 'cranecam', 'site', 'crewcam', 'flyover', 'pilecam', 'rooftops', 'streetcam', 'crane', 'medium', 'aerial', 'river'];
  const STREAM = AUTO;
  const st = {
    active: false, stream: false, format: 1, light: 1, clip: 0, auto: true, i: 0, shot: null, s: null, t: 0, rec: null, busy: false, // format 1: 16:9, like the livestream
    caption: ['', ''], size: [1, 1], pr: 1, captureEdge: 0,
  };
  const o = { pos: v3(), look: v3(), fov: 35, focus: false, pivot: null, focusAt: null };
  const look = v3();
  // A spring arm: if a building or a tree stands between what the camera films (pivot) and where it
  // wants to be, the camera moves in front of it.
  const ray = new THREE.Raycaster(), dir = v3();
  let crowd = []; // the other Blockies' hit boxes: nobody walks between the lens and the star
  function blocked(from, to) { // distance to the first solid thing from `from` toward `to`, or Infinity
    dir.subVectors(to, from);
    const d = dir.length();
    if (d < 1e-3) return Infinity;
    ray.set(from, dir.divideScalar(d));
    ray.far = d + 0.4;
    const hit = ray.intersectObjects([city.solids, ...solids, ...crowd], true)[0];
    return hit ? hit.distance : Infinity;
  }
  function arm(pivot, pos) {
    const d = blocked(pivot, pos);
    if (d === Infinity) return;
    const len = pos.distanceTo(pivot);
    pos.lerpVectors(pivot, pos, Math.max(0.5, d - 0.4) / len);
  }
  try { const saved = JSON.parse(localStorage.getItem('basecity:cine') || 'null'); if (saved) { st.format = saved.format % FORMATS.length; st.light = saved.light % LIGHTS.length; st.clip = (saved.clip || 0) % CLIPS.length; } } catch { /* storage unavailable */ }
  const remember = () => { try { localStorage.setItem('basecity:cine', JSON.stringify({ format: st.format, light: st.light, clip: st.clip })); } catch { /* ignore */ } };

  // ---------- the controls, the overlay, the result sheet ----------
  const el = (tag, cls, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };
  const ui = el('div', 'cine-ui', `<div class="cine-bar">
      <button type="button" data-act="prev" title="Previous shot">◀</button>
      <button type="button" data-act="auto" class="cine-shot" title="Auto: the shots change by themselves"></button>
      <button type="button" data-act="next" title="Next shot">▶</button>
      <button type="button" data-act="light" title="Light"></button>
      <button type="button" data-act="format" title="Frame"></button>
      <button type="button" data-act="photo" title="Save a photo">📸 Photo</button>
      <button type="button" data-act="len" title="Clip length"></button>
      <button type="button" data-act="rec" title="Record a clip, with the music">⏺ Record</button>
      <button type="button" data-act="exit" title="Exit (Esc)">✕</button>
    </div>`);
  const overlay = el('canvas', 'cine-overlay');
  const recPill = el('button', 'cine-rec');
  recPill.type = 'button';
  const sheet = el('div', 'cine-sheet', `<div class="cine-card"><div class="cine-media"></div>
      <div class="cine-actions"><button type="button" class="btn primary" data-act="share">Share</button><a class="btn" data-act="save">Save</a><button type="button" class="btn" data-act="close">Close</button></div></div>`);
  for (const e of [ui, overlay, recPill, sheet]) { e.hidden = true; document.body.appendChild(e); }
  const canRecord = typeof MediaRecorder === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  ui.querySelector('[data-act="rec"]').hidden = ui.querySelector('[data-act="len"]').hidden = !canRecord;

  let idle = 0;
  function poke() { if (st.stream) return; idle = 0; ui.classList.remove('idle'); }
  function label() {
    const b = ui.querySelector.bind(ui);
    b('[data-act="auto"]').textContent = `${st.auto ? 'Auto · ' : ''}${st.shot?.label || ''}`;
    b('[data-act="auto"]').classList.toggle('on', st.auto);
    b('[data-act="light"]').textContent = LIGHTS[st.light].label;
    b('[data-act="format"]').textContent = `▭ ${FORMATS[st.format].label}`;
    b('[data-act="len"]').textContent = `⏱ ${CLIPS[st.clip]}s`;
  }
  ui.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    poke();
    if (act === 'exit') exit();
    if (act === 'next' || act === 'prev') { st.auto = false; cut(act === 'next' ? 1 : -1); }
    if (act === 'auto') { st.auto = !st.auto; label(); }
    if (act === 'light') { st.light = (st.light + 1) % LIGHTS.length; light(); remember(); label(); }
    if (act === 'format') { st.format = (st.format + 1) % FORMATS.length; layout(); remember(); label(); }
    if (act === 'len') { st.clip = (st.clip + 1) % CLIPS.length; remember(); label(); }
    if (act === 'photo') photo();
    if (act === 'rec') record();
  });
  recPill.onclick = () => st.rec?.recorder.state === 'recording' && st.rec.recorder.stop();
  sheet.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close' || e.target === sheet) closeSheet();
    if (act === 'share' && sheet.file) {
      try { await navigator.share({ files: [sheet.file], text: shareText() }); } catch { /* cancelled */ }
    }
  });
  addEventListener('pointermove', () => st.active && poke());
  addEventListener('pointerdown', () => st.active && poke());

  const host = () => (CONFIG.siteUrl || location.origin).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const shareText = () => `${CONFIG.cityName}, a city built 24/7 by ${CONFIG.citizenPlural} on Base. ${CONFIG.ticker}\n${CONFIG.siteUrl || location.origin}`;

  // caption bottom left, the BaseCity watermark bottom right (top right when they'd collide: tall frames)
  function drawOverlay(g, W, H) {
    const u = Math.min(W, H) / 100, pad = u * 4;
    const [title, sub] = st.caption, mark = CONFIG.cityName.toUpperCase(), line = `${CONFIG.ticker} on Base · ${host()}`;
    const font = { title: `400 ${Math.round(u * 6)}px "Lilita One", Inter, sans-serif`, sub: `700 ${Math.round(u * 3.2)}px Inter, system-ui, sans-serif`, mark: `400 ${Math.round(u * 4.6)}px "Lilita One", Inter, sans-serif`, line: `700 ${Math.round(u * 2.6)}px Inter, system-ui, sans-serif` };
    const width = (f, t) => { g.font = f; return g.measureText(t).width; };
    const left = Math.max(title ? width(font.title, title) : 0, sub ? width(font.sub, sub) : 0);
    const right = Math.max(width(font.mark, mark), width(font.line, line));
    const top = left + right + pad * 3 > W; // no room side by side
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.55)'; g.shadowBlur = u * 1.2; g.shadowOffsetY = u * 0.2;
    g.textBaseline = 'alphabetic'; g.fillStyle = '#ffffff';
    g.textAlign = 'left';
    if (title) { g.font = font.title; g.fillText(title, pad, H - pad - (sub ? u * 4.6 : 0)); }
    if (sub) { g.font = font.sub; g.globalAlpha = 0.9; g.fillText(sub, pad, H - pad); g.globalAlpha = 1; }
    g.textAlign = 'right';
    const y = top ? pad + u * 4.6 : H - pad - u * 3.8;
    g.font = font.mark; g.fillText(mark, W - pad, y);
    g.font = font.line; g.globalAlpha = 0.85; g.fillText(line, W - pad, y + u * 3.8); g.globalAlpha = 1;
    g.restore();
  }
  function paintOverlay() {
    const [w, h] = st.size, pr = Math.min(devicePixelRatio, 2);
    overlay.width = Math.round(w * pr); overlay.height = Math.round(h * pr);
    const g = overlay.getContext('2d');
    g.clearRect(0, 0, overlay.width, overlay.height);
    drawOverlay(g, overlay.width, overlay.height);
  }

  // ---------- framing ----------
  function quality() { // the drawing buffer: the screen's, or the capture size while capturing
    const [w, h] = st.size;
    return st.captureEdge ? st.captureEdge / Math.max(w, h) : Math.min(devicePixelRatio, 1.5);
  }
  function layout() {
    if (!st.active) return;
    const W = innerWidth, H = innerHeight, r = FORMATS[st.format].ratio;
    let w = W, h = W / r;
    if (h > H) { h = H; w = H * r; }
    w = Math.floor(w); h = Math.floor(h);
    st.size = [w, h];
    for (const c of [renderer.domElement, overlay]) Object.assign(c.style, { inset: 'auto', left: `${Math.round((W - w) / 2)}px`, top: `${Math.round((H - h) / 2)}px`, width: `${w}px`, height: `${h}px` });
    resizeBuffers();
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    paintOverlay();
  }
  function resizeBuffers() {
    const [w, h] = st.size, pr = quality();
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
  }
  function light() {
    const l = LIGHTS[st.light];
    city.env.phaseOverride = l.phase;
    city.env.warm = l.warm;
  }

  // ---------- shots ----------
  function pickSubject(prefer, random, fits) { // the Blocky asked for (or picked on the card), else a star; fits: what the shot needs
    const all = [...views().values()].filter((v) => !fits || fits(v));
    if (!all.length) return null;
    const want = random ? null : prefer ?? selected();
    if (want != null && views().has(want) && (!fits || fits(views().get(want)))) return views().get(want);
    // someone with a little room around them (not in the queue at the block pile), a star if possible
    const roomy = all.filter((v) => all.every((w) => w === v || w.group.position.distanceToSquared(v.group.position) > 2.25));
    const pool = roomy.length ? roomy : all;
    const stars = pool.filter((v) => v.b.kind === 'legend' || (v.b.rarity && v.b.rarity.id !== 'common'));
    const from = stars.length && Math.random() < 0.6 ? stars : pool;
    return from[Math.floor(Math.random() * from.length)];
  }
  function caption(shot, subject, s) {
    if (shot.caption) return shot.caption(s, subject);
    if (shot.subject && subject) {
      const b = subject.b;
      const sub = b.kind === 'legend' || b.kind === 'founder' ? [b.office?.label, b.legend?.title || 'Base Builder'].filter(Boolean).join(' · ') : [b.rarity?.label, b.trait && TRAIT_LABEL[b.trait], b.role?.label].filter(Boolean).join(' · ');
      return [b.name, sub];
    }
    const { day, minted } = stats();
    return [CONFIG.cityName, `Day ${day} · ${minted.toLocaleString('en-US')} ${CONFIG.citizenPlural} building · ${shot.label}`];
  }
  function begin(shot, prefer, tries = 6) {
    for (let n = 0; n < (shot.subject ? tries : 1); n++) if (tryShot(shot, prefer, n > 0)) return true; // no clear view: someone else
    return false;
  }
  function tryShot(shot, prefer, random) {
    const s = { subject: null, sp: v3(), face: 0, head: v3() };
    crowd = [];
    if (shot.subject) {
      s.subject = pickSubject(prefer, random, shot.pick);
      if (!s.subject) return false;
      crowd = [...views().values()].filter((v) => v !== s.subject).map((v) => v.hit);
      s.sp.copy(s.subject.group.position);
      s.face = s.subject.group.rotation.y;
      s.head.copy(s.sp).setY(0.9);
      // the clearest side to film it from, as close as possible to the angle the shot wants
      s.clearAngle = (want, r, h = 1.15) => {
        let best = [want, 0], bestScore = -Infinity;
        for (let k = 0; k < 16; k++) {
          const off = want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
          const a = s.face + off, to = v3().set(s.sp.x + Math.sin(a) * r, h, s.sp.z + Math.cos(a) * r);
          const free = Math.min(r, blocked(s.head, to) - 0.4), score = free - Math.abs(off - want) * 0.15;
          if (free >= r * 0.95) return [off, r];
          if (score > bestScore) { bestScore = score; best = [off, free]; }
        }
        return best;
      };
    }
    if (!shot.start(s)) return false;
    st.shot = shot; st.s = s; st.t = 0;
    st.caption = caption(shot, s.subject, s);
    onCaption(st.caption, s.subject?.b.id ?? null);
    paintOverlay();
    label();
    shot.frame(s, 0, o);
    if (o.pivot) arm(o.pivot, o.pos);
    cam.position.copy(o.pos);
    look.copy(o.look);
    return true;
  }
  function cut(step = 1, prefer) {
    const order = st.stream ? STREAM : st.auto ? AUTO : SHOTS.map((x) => x.id);
    for (let n = 1; n <= order.length; n++) {
      st.i = (st.i + step + order.length) % order.length;
      if (begin(SHOTS.find((x) => x.id === order[st.i]), prefer)) return;
    }
  }

  function frame(t, dt) {
    if (!st.active) return;
    idle += dt;
    if (idle > 3.5 && !st.rec) ui.classList.add('idle');
    st.t += dt;
    const shot = st.shot;
    if (!shot) cut(1);
    else if (st.t > shot.dur) { if (st.auto) cut(1); else if (!begin(shot, st.s.subject?.b.id)) cut(1); } // manual: the shot again
    const s = st.s, u = Math.min(1, st.t / st.shot.dur);
    if (s.subject) {
      if (!views().has(s.subject.b.id)) { cut(1); return frame(t, 0); } // it left the view
      if (Math.floor(st.t * 2) !== Math.floor((st.t - dt) * 2)) crowd = [...views().values()].filter((v) => v !== s.subject).map((v) => v.hit);
      const g = s.subject.group;
      s.sp.lerp(g.position, 1 - Math.exp(-dt * 4));
      s.face = angleTo(s.face, g.rotation.y, 1 - Math.exp(-dt * 1.5));
      s.head.copy(s.sp).setY(0.9);
    }
    o.focusAt = null;
    st.shot.frame(s, u, o);
    if (o.pivot) {
      const want = o.pos.distanceTo(o.pivot);
      arm(o.pivot, o.pos);
      st.blocked = o.pos.distanceTo(o.pivot) < want * 0.6 ? (st.blocked || 0) + dt : 0;
      if (st.blocked > 0.7) { st.blocked = 0; if (st.auto) cut(1); else begin(st.shot, null, 6); return; } // something got in the way
    }
    cam.position.lerp(o.pos, st.t < 0.05 ? 1 : 1 - Math.exp(-dt * 6));
    look.lerp(o.look, st.t < 0.05 ? 1 : 1 - Math.exp(-dt * 6));
    cam.lookAt(look);
    if (Math.abs(cam.fov - o.fov) > 0.01) { cam.fov = o.fov; cam.updateProjectionMatrix(); }
    // sky, bloom (stronger at night, the windows glow) and depth of field on the subject
    const env = city.env;
    skyMat.uniforms.top.value.copy(env.skyTop);
    skyMat.uniforms.bottom.value.copy(env.skyBottom);
    skyMat.uniforms.sunDir.value.copy(env.sunDir);
    skyMat.uniforms.day.value = env.daylight;
    dome.position.copy(cam.position);
    const night = 1 - env.daylight;
    bloom.strength = 0.18 + night * 0.32;
    bloom.threshold = 0.92 - night * 0.14;
    bokeh.enabled = o.focus;
    if (o.focus) bokeh.uniforms.focus.value = cam.position.distanceTo(o.focusAt || look);
    composer.render(dt);
    if (st.snap) { const done = st.snap; st.snap = null; done(); }
    if (st.rec) { const { g, canvas } = st.rec; g.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height); drawOverlay(g, canvas.width, canvas.height); }
  }

  // ---------- photos and clips ----------
  function capture(edge, then) { // re-render at capture size, then call then() right after the frame
    st.captureEdge = edge;
    resizeBuffers();
    st.snap = () => { then(); st.captureEdge = 0; resizeBuffers(); };
  }
  function photo() {
    if (st.busy) return;
    st.busy = true;
    capture(2400, () => {
      const src = renderer.domElement, c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const g = c.getContext('2d');
      g.drawImage(src, 0, 0);
      drawOverlay(g, c.width, c.height);
      c.toBlob((blob) => { st.busy = false; if (blob) show(blob, `${CONFIG.cityName}-${FORMATS[st.format].name}.png`); }, 'image/png');
    });
  }
  function record() {
    if (st.busy || !canRecord) return;
    const sound = audio()?.getAudioTracks().filter((t) => t.readyState === 'live') || [];
    const types = sound.length
      ? ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = types.find((m) => MediaRecorder.isTypeSupported?.(m));
    if (!type) return;
    st.busy = true;
    st.captureEdge = 1280;
    resizeBuffers();
    const canvas = document.createElement('canvas');
    canvas.width = renderer.domElement.width; canvas.height = renderer.domElement.height;
    const g = canvas.getContext('2d');
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...sound]); // the picture, and the music if it's on
    const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6, audioBitsPerSecond: 160e3 });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      clearInterval(st.rec?.tick);
      st.rec = null; st.busy = false; st.captureEdge = 0;
      recPill.hidden = true; ui.hidden = false;
      if (st.active) resizeBuffers();
      const blob = new Blob(chunks, { type: type.split(';')[0] });
      if (blob.size) show(blob, `${CONFIG.cityName}-clip.${type.includes('mp4') ? 'mp4' : 'webm'}`);
    };
    const secs = CLIPS[st.clip];
    st.rec = { recorder, canvas, g, left: secs };
    recorder.start(250);
    ui.hidden = true;
    recPill.hidden = false;
    recPill.textContent = `● REC ${secs}s${sound.length ? ' ♪' : ''} · tap to stop`;
    st.rec.tick = setInterval(() => {
      if (!st.rec) return;
      st.rec.left -= 1;
      recPill.textContent = `● REC ${st.rec.left}s${sound.length ? ' ♪' : ''} · tap to stop`;
      if (st.rec.left <= 0 && recorder.state === 'recording') recorder.stop();
    }, 1000);
  }
  function show(blob, name) {
    const url = URL.createObjectURL(blob), media = sheet.querySelector('.cine-media');
    media.innerHTML = blob.type.startsWith('video') ? `<video src="${url}" autoplay loop muted playsinline></video>` : `<img src="${url}" alt="${CONFIG.cityName}" />`;
    const save = sheet.querySelector('[data-act="save"]');
    save.href = url; save.download = name;
    sheet.file = new File([blob], name, { type: blob.type });
    sheet.querySelector('[data-act="share"]').hidden = !navigator.canShare?.({ files: [sheet.file] });
    sheet.url = url;
    sheet.hidden = false;
  }
  function closeSheet() {
    sheet.hidden = true;
    sheet.querySelector('.cine-media').innerHTML = '';
    if (sheet.url) setTimeout(() => URL.revokeObjectURL(sheet.url), 1000);
    sheet.file = sheet.url = null;
  }

  // ---------- in and out ----------
  // stream: the livestream (/live): 16:9 in the city's own light, no controls or watermark (the page's
  // stream HUD shows the captions), and the shots never stop
  function enter(subjectId = null, { stream = false } = {}) {
    if (st.active) return;
    passes();
    st.active = true;
    st.stream = stream;
    if (stream) { st.format = 1; st.light = 0; }
    document.body.classList.add('cine');
    controls.enabled = false;
    scene.add(dome);
    ui.hidden = overlay.hidden = stream;
    light();
    layout();
    st.auto = subjectId == null;
    st.i = -1;
    if (subjectId != null) { // a Blocky picked to film: from up the street first, then ◀ ▶ through every shot
      st.i = SHOTS.findIndex((x) => x.id === 'medium');
      if (!begin(SHOTS[st.i], subjectId)) cut(1);
    } else cut(1);
    poke();
  }
  function exit() {
    if (!st.active) return;
    if (st.rec?.recorder.state === 'recording') st.rec.recorder.stop();
    if (st.snap) { st.snap = null; st.captureEdge = 0; st.busy = false; } // a photo that never got its frame
    st.active = false;
    st.stream = false;
    closeSheet();
    document.body.classList.remove('cine');
    controls.enabled = true;
    scene.remove(dome);
    ui.hidden = overlay.hidden = recPill.hidden = true;
    city.env.phaseOverride = null;
    city.env.warm = 0;
    for (const c of [renderer.domElement]) Object.assign(c.style, { inset: '', left: '', top: '', width: '', height: '' });
    onExit();
  }

  // cut to this Blocky now (a new arrival on the livestream); false if it can't be filmed right now
  function feature(id) {
    if (!st.active || !views().has(id)) return false;
    const order = st.stream ? STREAM : AUTO;
    for (const sid of st.stream ? ['medium', 'follow'] : ['hero', 'follow']) {
      const shot = SHOTS.find((x) => x.id === sid);
      if (tryShot(shot, id, false)) { st.i = order.indexOf(sid); return true; }
    }
    return false; // no clear view of it: the current shot goes on
  }

  return {
    enter, exit, frame, poke, feature,
    play: (id) => { const shot = SHOTS.find((x) => x.id === id); return !!(st.active && shot && begin(shot, null)); }, // a shot by id (testing, recording)
    resize: () => layout(),
    get active() { return st.active; },
  };
}
