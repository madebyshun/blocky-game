// "Blocky Street": Wall Street closes at 4pm, Blocky Street doesn't. Shot in BaseCity's own district
// (src/stocks.js): blocks drop onto the stock towers, the bell rings at 16:00 ET, the board flips to
// CLOSED, and the towers keep building, every new block glowing, into the night. The district's
// numbers are not shown (the film runs without the live feed): only the clock and the blocks.
// Not part of the site. Open /?still&film, then (await import('/clips/streetfilm.js')).start(), then
// window.__clip.frame(t) draws the film at t seconds.
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from '../src/config.js';
import { PITCH } from '../src/sim.js';

const OPEN_END = 4.5, DUR = 17;

export function start() {
  const { THREE, scene, renderer, city, traffic, views, street } = window.__bc;
  const W = innerWidth, H = innerHeight;
  renderer.setPixelRatio(1); renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.8;
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.1, 700);

  // the district: its centre, and nothing of the city's own standing on it (a sim may not have cleared it yet)
  const lots = CONFIG.stocks.lots, span = (k) => [Math.min(...lots.map((l) => l[k])), Math.max(...lots.map((l) => l[k]))];
  const [i0, i1] = span(0), [j0, j1] = span(1);
  const cx = ((i0 + i1) / 2) * PITCH, cz = ((j0 + j1) / 2) * PITCH, hw = ((i1 - i0 + 1) * PITCH) / 2, hd = ((j1 - j0 + 1) * PITCH) / 2;
  const inside = (p, pad = 0) => Math.abs(p.x - cx) < hw + pad && Math.abs(p.z - cz) < hd + pad;
  const p = new THREE.Vector3(), mine = new Set();
  street.film.group.traverse((o) => mine.add(o));
  const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  city.root.traverse((o) => {
    if (!o.isMesh || mine.has(o)) return;
    if (o.isInstancedMesh) { // woods and the like: the instances standing on the district fold away
      let hit = false;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); if (inside(p, -0.5)) { o.setMatrixAt(i, zero); hit = true; } }
      if (hit) o.instanceMatrix.needsUpdate = true;
      return;
    }
    o.getWorldPosition(p); if (inside(p, -0.5)) o.visible = false;
  });
  // a dusk sky that follows the camera
  const sky = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#0b1640'); gr.addColorStop(0.35, '#27407e'); gr.addColorStop(0.5, '#f08a5d'); gr.addColorStop(0.56, '#ffd2a1'); gr.addColorStop(1, '#3b2c4a');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -1; m.frustumCulled = false; scene.add(m); return m;
  })();
  street.film.start();
  const T = street.film.tickers;
  T.forEach((t, i) => street.film.build(t, [10, 8, 7, 6, 6, 5, 5, 4][i] ?? 4)); // the film's own heights (no numbers shown)

  // captions: a lower third, drawn over the canvas
  const ov = document.createElement('div'); ov.id = 'ov';
  ov.innerHTML = `<style>#ov{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Inter,system-ui,sans-serif}
    #ov .cap{position:absolute;left:5%;bottom:9%;color:#fff;font:900 ${H * 0.07}px/1.05 Inter,sans-serif;text-shadow:0 4px 24px #000c;opacity:0}
    #ov .cap small{display:block;font:700 ${H * 0.028}px Inter,sans-serif;letter-spacing:.16em;opacity:.85;margin-bottom:${H * 0.01}px}</style>
    <div class="cap" id="c1"><small>NYSE · 16:00 ET</small>Wall Street closed.</div>
    <div class="cap" id="c2"><small>BASE · EVERY 200 MS</small>Blocky Street didn't.</div>`;
  document.documentElement.appendChild(ov);
  const c1 = ov.querySelector('#c1'), c2 = ov.querySelector('#c2');

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.4, 0.93);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = mix(vec3(l), c.rgb, 1.15);
        c.rgb = (c.rgb - 0.5) * 1.1 + 0.5;
        float v = smoothstep(1.05, 0.4, distance(vUv, vec2(0.5)));
        gl_FragColor = vec4(c.rgb * mix(0.8, 1.0, v), 1.0); }`,
  }));
  composer.addPass(new OutputPass());

  const cl = (x) => Math.max(0, Math.min(1, x)), ease = (u) => u * u * (3 - 2 * u), lerp = (a, b, u) => a + (b - a) * u;
  const V = (x, y, z) => new THREE.Vector3(cx + x, y, cz + z);
  let nextDrop = 0.2, k = 0, closed = false;

  function frame(t, dt = 1 / 30, draw = true) {
    // the day goes: late afternoon → dusk → night, so the glowing blocks carry the end
    city.env.phaseOverride = lerp(0.44, 0.53, cl(t / DUR)); city.env.warm = 0.5;
    if (!closed && t >= OPEN_END) { closed = true; street.film.nyse = { open: false, why: 'after hours', time: '16:00 ET' }; }
    if (closed && t > OPEN_END + 1) street.film.nyse = { open: false, why: 'after hours', time: `16:0${Math.min(9, Math.floor((t - OPEN_END) / 1.5))} ET` };
    // blocks: a steady few while Wall Street is open, then faster, and every one after 16:00 glows
    while (t >= nextDrop) {
      const after = nextDrop >= OPEN_END;
      street.film.drop(T[(k * 5 + (k >> 2)) % T.length], after);
      k += 1;
      nextDrop += after ? (t < 8 ? 0.18 : 0.09) : 0.55;
    }
    // keep the street clear of cars and passers-by
    for (const car of traffic.group.children) { car.getWorldPosition(p); car.visible = !inside(p, 2); }
    for (const v of views().values()) { const g = v.group; if (!g) continue; g.getWorldPosition(p); g.visible = !inside(p, 1); }

    const a1 = cl((t - 7) / 0.4) * cl((10 - t) / 0.4), a2 = cl((t - 10.2) / 0.4) * cl((13.2 - t) / 0.4);
    c1.style.opacity = String(a1); c2.style.opacity = String(a2);

    let pos, tgt, fov = 46;
    if (t < OPEN_END) { // under the arch, up the street to the board: Wall Street still open
      const u = ease(t / OPEN_END); pos = V(lerp(-0.4, 0.4, u), lerp(1.6, 2.2, u), lerp(17, 12.5, u)); tgt = V(0, 4.2, -10); fov = 50;
    } else if (t < 7) { // the board and its bell: 16:00, CLOSED
      const u = (t - OPEN_END) / 2.5; pos = V(lerp(-1.5, -0.6, u), 4.4, lerp(-7.2, -8.2, u)); tgt = V(0, 6.0, -14); fov = 40;
    } else if (t < 13) { // low between the towers, looking up into the pour
      const u = ease((t - 7) / 6), a = lerp(-0.5, 0.5, u); pos = V(Math.sin(a) * 1.4, 0.8, lerp(6, 1, u)); tgt = V(Math.sin(a) * 4, lerp(6, 9, u), lerp(-4, -8, u)); fov = 62;
    } else { // crane up: the street lit in the city at night
      const u = ease((t - 13) / (DUR - 13)); pos = V(lerp(5, 10, u), lerp(4, 17, u), lerp(16, 22, u)); tgt = V(0, lerp(4, 3, u), lerp(0, -2, u)); fov = 50;
    }
    cam.position.copy(pos); cam.lookAt(tgt); cam.fov = fov; cam.updateProjectionMatrix();
    bloom.strength = 0.25 + cl((t - OPEN_END) / 6) * 0.35;
    sky.position.copy(cam.position);
    if (draw) composer.render(dt); // a render split into parts fast-forwards to its first frame without drawing
  }
  window.__film = () => {};
  window.__clip = { frame, duration: DUR };
}
