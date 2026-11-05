// "The Blue Square": a short film scene, rendered frame by frame by a script (window.__clip.frame(t)).
// Golden hour, a field of autumn voxels, a group of Blockies who find a giant blue square on a hill.
// Not part of the site: open /clips/bluesquare.html to preview, or drive __clip.frame from Playwright.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildBlocky } from '../src/citizens.js';

const W = innerWidth, H = innerHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.margin = '0';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color(0xd8dde6); // a light, neutral haze
scene.fog = new THREE.FogExp2(FOG, 0.007);
const cam = new THREE.PerspectiveCamera(42, W / H, 0.1, 600);

// ---------- sky: a warm gradient dome and a square sun low behind the hill ----------
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3f7fe0'); grad.addColorStop(0.45, '#9cc4f0'); grad.addColorStop(0.6, '#f3e3cf'); grad.addColorStop(1, '#ffd8a8');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false }));
  scene.add(sky);
}
const SUN_POS = new THREE.Vector3(0, 26, -260);
const sunDisc = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.6, 3.4, 3.0), fog: false }));
sunDisc.position.copy(SUN_POS); scene.add(sunDisc);
// blocky clouds
for (let i = 0; i < 9; i++) {
  const cl = new THREE.Mesh(new THREE.BoxGeometry(30 + (i % 3) * 14, 2.5, 10), new THREE.MeshBasicMaterial({ color: 0xffe2c4, fog: false, transparent: true, opacity: 0.85 }));
  cl.position.set(-150 + i * 38, 60 + (i % 4) * 7, -230 + (i % 2) * 30); scene.add(cl);
}

// ---------- light: a low sun behind the square (backlight), a cool fill ----------
const sun = new THREE.DirectionalLight(0xffe6c8, 2.8);
sun.position.set(0, 18, -60); sun.target.position.set(0, 0, 10);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 160 });
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x4a3a30, 1.25));
const rim = new THREE.DirectionalLight(0xffd2b0, 0.8); rim.position.set(-30, 10, 30); scene.add(rim);

// ---------- the land: voxel field, a hill, autumn trees ----------
const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
const hillAt = (x, z) => 7.5 * Math.exp(-((x * x) / 260 + ((z + 30) ** 2) / 220)); // the hill the square sits on
const groundH = (x, z) => Math.round(hillAt(x, z) + Math.sin(x * 0.15) * 0.6 + Math.cos(z * 0.13) * 0.6);
const GRASS = [0x6aa84f, 0x5e9a45, 0x7fb85a, 0xc98b3a, 0x88b04b], DIRT = 0x7a4a2c;
{
  const box = new THREE.BoxGeometry(1, 1, 1), cells = [];
  for (let x = -70; x <= 70; x++) for (let z = -90; z <= 40; z++) cells.push([x, z]);
  const top = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), cells.length);
  const side = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: DIRT }), cells.length);
  const m = new THREE.Matrix4(), col = new THREE.Color();
  cells.forEach(([x, z], i) => {
    const h = groundH(x, z);
    m.makeScale(1, 1, 1).setPosition(x, h - 0.5, z); top.setMatrixAt(i, m);
    col.setHex(GRASS[Math.floor(rand() * GRASS.length)]).multiplyScalar(0.85 + rand() * 0.3); top.setColorAt(i, col);
    m.makeScale(1, 3, 1).setPosition(x, h - 2.5, z); side.setMatrixAt(i, m);
  });
  top.receiveShadow = side.receiveShadow = true;
  scene.add(top, side);
  // flowers and tufts
  const tuft = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.32, 0.16), new THREE.MeshLambertMaterial(), 1600);
  for (let i = 0; i < 1600; i++) {
    const x = Math.round(-60 + rand() * 120), z = Math.round(-80 + rand() * 115);
    m.makeScale(1, 0.6 + rand(), 1).setPosition(x + rand() - 0.5, groundH(x, z) + 0.25, z + rand() - 0.5); tuft.setMatrixAt(i, m);
    tuft.setColorAt(i, col.setHex([0xffc23a, 0xff7b3a, 0xe8452c, 0xd9a03a][Math.floor(rand() * 4)]));
  }
  scene.add(tuft);
  // trees: trunks and leafy crowns of cubes
  const LEAF = [0xe0631f, 0xf09a2a, 0xc23a1e, 0x4e8a3a];
  const trunk = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0x5b3a26 }), 400), leaf = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), 6000);
  let ti = 0, li = 0;
  for (let n = 0; n < 70; n++) {
    const x = Math.round(-65 + rand() * 130), z = Math.round(-85 + rand() * 110);
    if (Math.abs(x) < 9 && z > -40 && z < 30) continue; // keep the path and the hill top clear
    const g = groundH(x, z), th = 3 + Math.floor(rand() * 3);
    for (let y = 0; y < th && ti < 400; y++) { m.makeScale(1, 1, 1).setPosition(x, g + y + 0.5, z); trunk.setMatrixAt(ti++, m); }
    const r = 2 + Math.floor(rand() * 2), c0 = LEAF[Math.floor(rand() * LEAF.length)];
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = 0; dy <= r; dy++) {
      if (dx * dx + dz * dz + (dy * 1.4) ** 2 > r * r + 1 || rand() < 0.15 || li >= 6000) continue;
      m.makeScale(1, 1, 1).setPosition(x + dx, g + th + dy, z + dz); leaf.setMatrixAt(li, m);
      leaf.setColorAt(li++, col.setHex(rand() < 0.75 ? c0 : LEAF[Math.floor(rand() * 4)]).multiplyScalar(0.85 + rand() * 0.3));
    }
  }
  trunk.count = ti; leaf.count = li; trunk.castShadow = leaf.castShadow = true;
  scene.add(trunk, leaf);
}

// ---------- the Blue Square on the hill ----------
const SQ = new THREE.Vector3(0, groundH(0, -30) + 5, -30);
const squareMat = new THREE.MeshStandardMaterial({ color: 0x0000ff, emissive: 0x0000ff, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1, fog: false }); // Base blue, not tinted by the haze
const square = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), squareMat);
square.position.copy(SQ); square.castShadow = true; scene.add(square);
const glow = new THREE.PointLight(0x6f8cff, 0, 45, 1.6); glow.position.copy(SQ).add(new THREE.Vector3(0, 0, 7)); scene.add(glow);

// ---------- falling leaves and dust in the light ----------
const leaves = [];
{
  const geo = new THREE.PlaneGeometry(0.22, 0.22);
  for (let i = 0; i < 260; i++) {
    const mm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: [0xff9f43, 0xe8572f, 0xffd36a][i % 3], side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    mm.position.set(-30 + rand() * 60, rand() * 14, -40 + rand() * 70);
    leaves.push({ m: mm, sp: 0.3 + rand() * 0.6, ph: rand() * 6.28, base: mm.position.clone() });
    scene.add(mm);
  }
}

// ---------- the Blockies ----------
const LOOKS = [[0x52c49a, 0xf6d5cf], [0x5b8def, 0xc68e6a], [0xf2a33a, 0xf1c9a5], [0xd65db1, 0x8d5a3b]];
const crew = LOOKS.map(([shirt, skin], i) => {
  const r = buildBlocky({ id: 40 + i * 13, role: { id: ['builder', 'carrier', 'architect', 'builder'][i], hat: 0xffc83d }, legend: null, tier: null, shirt, skin, trait: null }, { merge: false });
  r.group.scale.multiplyScalar(1.2); r.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  scene.add(r.group); return r;
});
const START = [[-2.4, 22], [1.2, 23], [-0.6, 25], [2.8, 25.5]], STOP = [[-3, 6], [0.4, 5], [-1.2, 8.5], [2.6, 8]];

// ---------- post: bloom, depth of field, a warm grade with a vignette ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, cam));
const bokeh = new BokehPass(scene, cam, { focus: 8, aperture: 0.004, maxblur: 0.012 });
composer.addPass(bokeh);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.7, 0.6, 0.82);
composer.addPass(bloom);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null }, fade: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float fade; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.97), 0.5);                       // barely warm
      c.rgb = (c.rgb - 0.5) * 1.06 + 0.5;                                          // a touch of contrast
      float v = smoothstep(1.05, 0.45, distance(vUv, vec2(0.5)));                 // vignette
      gl_FragColor = vec4(c.rgb * mix(0.78, 1.0, v) * fade, 1.0); }`,
}));
composer.addPass(new OutputPass());

// ---------- the film: shots by time ----------
const cl = (x) => Math.max(0, Math.min(1, x)), ease = (u) => u * u * (3 - 2 * u), lerp = (a, b, u) => a + (b - a) * u;
const at = (r) => r.group.position;
function walk(r, i, t) {
  const u = ease(cl((t - 0.2 * i) / 7.2)), [sx, sz] = START[i], [ex, ez] = STOP[i];
  const x = lerp(sx, ex, u), z = lerp(sz, ez, u);
  r.group.position.set(x, groundH(Math.round(x), Math.round(z)), z);
  const moving = u > 0 && u < 1, sw = moving ? Math.sin(t * 7 + i) * 0.55 : 0;
  r.legs[0].rotation.x = sw; r.legs[1].rotation.x = -sw;
  r.arms[0].rotation.x = -sw * 0.7; r.arms[1].rotation.x = sw * 0.7;
  r.group.rotation.y = Math.PI; // facing the hill (-z)
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HEAD_Y = new THREE.Box3().setFromObject(crew[0].group).max.y - crew[0].group.position.y - 0.4; // eye height
const head = (i) => at(crew[i]).clone().add(V(0, HEAD_Y, 0));

function frame(t, dt) {
  crew.forEach((r, i) => walk(r, i, t));
  // they look up at the square once they've stopped
  const look = ease(cl((t - 7.5) / 1.2));
  crew.forEach((r) => { const hd = r.group.children.find((c) => c.position.y > 1.1); if (hd) hd.rotation.x = -0.35 * look; });
  // the touch: the first one walks up and lays a hand on it, and it wakes up
  const reach = ease(cl((t - 11.6) / 1.6)), lead = crew[1];
  if (t > 11.6) {
    const z = lerp(5, -23.2, ease(cl((t - 11.6) / 1.5))), x = lerp(0.4, 0, reach);
    lead.group.position.set(x, groundH(0, Math.round(z)), z);
    const sw = t < 13.1 ? Math.sin(t * 8) * 0.6 : 0; lead.legs[0].rotation.x = sw; lead.legs[1].rotation.x = -sw;
    lead.arms[1].rotation.x = -2.6 * ease(cl((t - 13) / 0.6)); // the arm goes up
  }
  const wake = ease(cl((t - 13.6) / 0.9));
  squareMat.emissiveIntensity = 0.25 + wake * 2.6 + (wake > 0 ? Math.sin(t * 3) * 0.15 : 0);
  glow.intensity = wake * 260;
  bloom.strength = 0.7 + wake * 0.45;
  for (const l of leaves) { l.m.position.set(l.base.x + Math.sin(t * 0.7 + l.ph) * 1.5 + t * 0.4, ((l.base.y - t * l.sp) % 14 + 14) % 14, l.base.z + Math.cos(t * 0.5 + l.ph)); l.m.rotation.set(t * l.sp * 3 + l.ph, t * 2 + l.ph, 0); }

  // cameras
  let pos, tgt, fov = 42, focus;
  if (t < 3) { // low behind the group, the sun ahead over the crest
    const u = t / 3; pos = V(lerp(-6, -4, u), 1.4, 31); tgt = V(0, lerp(4, 5, u), -30); focus = 9;
  } else if (t < 6) { // close on one face, walking, backlit
    const h = head(0); pos = h.clone().add(V(1.4, 0.25, -2.2)); pos.y = Math.max(pos.y, groundH(Math.round(pos.x), Math.round(pos.z)) + 1.2); tgt = h.clone().add(V(0, -0.05, 0)); fov = 32; focus = pos.distanceTo(h);
  } else if (t < 9) { // over their shoulders: the square on the hill, the sun right behind it
    const u = (t - 6) / 3; pos = V(lerp(1.5, 0.8, u), 2.8, lerp(13, 11, u)); tgt = SQ.clone(); fov = 38; focus = pos.distanceTo(SQ);
  } else if (t < 11.6) { // low, close, looking up into their faces
    const k = t < 10.3 ? 2 : 3, h = head(k); pos = h.clone().add(V(-0.8, -0.45, -2.0)); tgt = h.clone().add(V(0, 0.15, 0)); fov = 34; focus = pos.distanceTo(h);
  } else if (t < 15) { // the touch, from the side
    const L = at(lead); pos = V(L.x + 3.2, L.y + 2.4, L.z + 7.5); tgt = V(L.x, L.y + 2.2, L.z - 4); fov = 44; focus = pos.distanceTo(tgt);
  } else { // wide: the square alight, the crew small before it
    const u = (t - 15) / 2.6; pos = V(lerp(-10, -7, u), lerp(2, 3, u), lerp(24, 20, u)); tgt = SQ.clone().add(V(0, -1, 0)); fov = 46; focus = pos.distanceTo(V(0, 2, 6));
  }
  cam.position.copy(pos); cam.lookAt(tgt); cam.fov = fov; cam.updateProjectionMatrix();
  bokeh.uniforms.focus.value = focus;
  sunDisc.lookAt(cam.position);
  composer.render(dt);
}
window.__clip = { frame, duration: 17.6 };
frame(0, 1 / 30);
