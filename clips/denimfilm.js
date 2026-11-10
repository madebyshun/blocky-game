// "Denim": Base went from 2 s blocks to 200 ms on Nov 5 2026. Shot in BaseCity: blocks fall onto Town
// Square, one every 2 s, and the Base Builders stack them; then Denim, and they come ten times as fast.
// The block numbers on screen follow the real schedule (block 53,556,127 was the last 2 s block).
// Not part of the site. Open /?still&film, then (await import('/clips/denimfilm.js')).start(), then
// window.__clip.frame(t) draws the film at t seconds.
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildBlocky } from '../src/citizens.js';
import { makeLegend } from '../src/sim.js';
import { CONFIG } from '../src/config.js';

const DENIM_BLOCK = 53556127;
const SLOW_END = 6.0, CARD_END = 8.0, DUR = 16.5; // seconds: 2 s blocks, the Denim card, then 200 ms

export function start() {
  const { THREE, scene, renderer, city, traffic, views } = window.__bc;
  const W = innerWidth, H = innerHeight;
  renderer.setPixelRatio(1); renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
  city.env.phaseOverride = 0.27; city.env.warm = 0;
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.1, 700);
  const key = new THREE.DirectionalLight(0xf2f6ff, 1.2); key.position.set(-20, 14, 8); scene.add(key);
  const sky = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#2f86ff'); gr.addColorStop(0.42, '#62b4ff'); gr.addColorStop(0.5, '#b8e2ff'); gr.addColorStop(1, '#d9f0ff');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -1; m.frustumCulled = false; scene.add(m); return m;
  })();

  // clear Town Square (lot 0,0) for the pad
  const p = new THREE.Vector3();
  city.root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.getWorldPosition(p); if (Math.abs(p.x) < 2.9 && Math.abs(p.z) < 2.9 && p.y < 8) o.visible = false; } });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.12, 5.4), new THREE.MeshStandardMaterial({ color: 0xe9eef7, roughness: 0.8 }));
  pad.position.set(0, 0.06, 0); pad.receiveShadow = true; scene.add(pad);

  // the blocks: Base-blue cubes, stacked 3x3 a layer
  const S = 1.6, GAP = 0.06;
  const mat = new THREE.MeshStandardMaterial({ color: 0x1040ff, emissive: 0x1a66ff, emissiveIntensity: 0.25, roughness: 0.35 });
  const hot = new THREE.MeshStandardMaterial({ color: 0x3b6bff, emissive: 0x4a88ff, emissiveIntensity: 0.9, roughness: 0.3 });
  const geo = new THREE.BoxGeometry(S, S, S);
  const slot = (i) => { const k = i % 9, l = Math.floor(i / 9); return new THREE.Vector3(((k % 3) - 1) * (S + GAP), S / 2 + 0.12 + l * (S + 0.02), (Math.floor(k / 3) - 1) * (S + GAP)); };
  // when each block lands: every 2 s up to SLOW_END, then every 200 ms from CARD_END
  const lands = [];
  for (let t = 1.2; t < SLOW_END; t += 2) lands.push(t);
  for (let t = CARD_END + 0.3; t < DUR - 0.4; t += 0.2) lands.push(t);
  const FALL = 0.7;
  const cubes = lands.map((at, i) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; m.visible = false; scene.add(m); return { m, at, to: slot(i), spin: (i * 1.7) % 3 }; });

  // the cast around the pad: Base Builders in front (Jesse, Brian, sohey), Blockies behind
  const mk = (b, k) => { const r = buildBlocky(b, { merge: false }); r.group.scale.multiplyScalar(k); r.group.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(r.group); return r; };
  const legend = (name) => mk(makeLegend(CONFIG.legends.findIndex((l) => l.name === name), Date.now()), 1.12);
  const crew = ['Jesse', 'Brian', 'sohey'].map(legend);
  const kids = [[0x52c49a, 0xf6d5cf, 'builder'], [0xf2a33a, 0xc68e6a, 'carrier'], [0xd65db1, 0x8d5a3b, 'builder']]
    .map(([shirt, skin, role], i) => mk({ id: 40 + i * 13, role: { id: role, hat: 0xffc83d }, legend: null, tier: null, shirt, skin, trait: null }, 0.92));
  const SPOTS = [[3.4, 1.0], [3.4, -1.8], [-1.0, 3.5], [1.4, 3.5], [-3.5, 1.0], [-3.5, -1.8]];
  [...crew, ...kids].forEach((r, i) => { const [x, z] = SPOTS[i]; r.group.position.set(x, 0.02, z); r.group.rotation.y = Math.atan2(-x, -z); });

  // overlay: the block counter and the cards (DOM, drawn over the canvas)
  const ov = document.createElement('div'); ov.id = 'ov';
  ov.innerHTML = `<style>
    #ov{position:fixed;inset:0;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#fff;z-index:2147483647}
    #ov .hud{position:absolute;left:4%;top:6%;text-shadow:0 2px 12px #0009}
    #ov .hud small{display:block;font:700 ${H * 0.024}px Inter,sans-serif;letter-spacing:.14em;opacity:.9}
    #ov .hud b{display:block;font:800 ${H * 0.07}px/1.05 Inter,sans-serif;font-variant-numeric:tabular-nums}
    #ov .hud span{display:inline-block;margin-top:${H * 0.012}px;font:800 ${H * 0.03}px Inter,sans-serif;background:#0052ff;padding:.2em .55em;border-radius:.3em}
    #ov .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0052ff;opacity:0}
    #ov .card small{font:700 ${H * 0.035}px Inter,sans-serif;letter-spacing:.2em;opacity:.85}
    #ov .card b{font:900 ${H * 0.16}px/1 Inter,sans-serif;letter-spacing:-.02em}
    #ov .card i{font:700 ${H * 0.04}px Inter,sans-serif;font-style:normal;margin-top:${H * 0.02}px}
  </style><div class="hud"><small>BASE · BLOCK</small><b id="ov-n"></b><span id="ov-pace"></span></div>
  <div class="card" id="ov-card"><small>NOV 5, 2026 · 18:00 UTC</small><b>DENIM</b><i>2 s → 200 ms</i></div>`;
  document.documentElement.appendChild(ov); // outside body: the page lays body out narrower than the canvas
  const $n = ov.querySelector('#ov-n'), $pace = ov.querySelector('#ov-pace'), $card = ov.querySelector('#ov-card'), $hud = ov.querySelector('.hud');

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const bokeh = new BokehPass(scene, cam, { focus: 10, aperture: 0.0015, maxblur: 0.008 });
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.4, 0.92);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = mix(vec3(l), c.rgb, 1.18);
        c.rgb = (c.rgb - 0.5) * 1.12 + 0.5;
        float v = smoothstep(1.05, 0.45, distance(vUv, vec2(0.5)));
        gl_FragColor = vec4(c.rgb * mix(0.86, 1.0, v), 1.0); }`,
  }));
  composer.addPass(new OutputPass());

  const cl = (x) => Math.max(0, Math.min(1, x)), ease = (u) => u * u * (3 - 2 * u), lerp = (a, b, u) => a + (b - a) * u;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), tmp = new THREE.Vector3();

  function frame(t, dt = 1 / 30) {
    // the blocks: each falls for FALL s and lands at its time, glowing as it lands
    let top = 0;
    for (const c of cubes) {
      const u = (t - (c.at - FALL)) / FALL;
      c.m.visible = u > 0;
      if (u <= 0) continue;
      const k = cl(u), y = lerp(c.to.y + 26, c.to.y, k * k);
      c.m.position.set(c.to.x, y, c.to.z);
      c.m.rotation.set(0, (1 - k) * c.spin, 0);
      c.m.material = t - c.at < 0.25 && t > c.at ? hot : mat;
      if (k >= 1) top = Math.max(top, c.to.y);
    }
    // the crew: calm in the slow part, arms up and heads up once the blocks pour in
    const fast = t > CARD_END, bob = Math.sin(t * 9);
    [...crew, ...kids].forEach((r, i) => {
      const up = fast ? ease(cl((t - CARD_END - 0.4 - i * 0.1) / 0.5)) : 0;
      r.arms[0].rotation.x = -2.7 * up + (fast ? bob * 0.25 : 0); r.arms[1].rotation.x = -2.7 * up - (fast ? bob * 0.25 : 0);
      if (!fast && i === 0) { const reach = Math.max(0, Math.sin(((t - 0.2) / 2) * Math.PI * 2)) * 0.9; r.arms[1].rotation.x = -reach; } // Jesse sets each one down
      r.group.position.y = 0.02 + (fast ? Math.abs(bob) * 0.06 * up : 0);
    });
    // keep the plaza clear of cars and passers-by
    for (const car of traffic.group.children) { car.getWorldPosition(tmp); car.visible = !(Math.abs(tmp.x) < 9 && Math.abs(tmp.z) < 9); }
    for (const v of views().values()) { const g = v.group; if (!g) continue; g.getWorldPosition(tmp); g.visible = !(Math.abs(tmp.x) < 6 && Math.abs(tmp.z) < 6); }

    // the counter: the real schedule, 2 s blocks up to Denim, 200 ms after
    const n = t < CARD_END ? DENIM_BLOCK - 3 + Math.floor(t / 2) : DENIM_BLOCK + Math.floor((t - CARD_END) / 0.2);
    $n.textContent = `#${n.toLocaleString('en-US')}`;
    $pace.textContent = t < CARD_END ? 'a block every 2 s' : 'a block every 200 ms';
    $hud.style.opacity = t > SLOW_END - 0.2 && t < CARD_END + 0.1 ? '0' : '1';
    const cu = t < SLOW_END || t > CARD_END ? 0 : Math.min(1, (t - SLOW_END) / 0.15, (CARD_END - t) / 0.2);
    $card.style.opacity = "0"; void cu; // the Denim card is laid over in the edit (denim-card.png), full frame

    // cameras
    let pos, tgt, fov = 42, focus = 10;
    // (the cameras stand on the crossroads around Town Square: the lots around it are built up)
    if (t < 3.2) { // the plaza, a block coming down, Jesse at the pad
      const u = ease(t / 3.2); pos = V(4.2, lerp(2.8, 2.3, u), 4.2); tgt = V(0, 1.4, 0); fov = 60; focus = 5.5;
    } else if (t < SLOW_END) { // close on Jesse, waiting for the next one
      const j = crew[0].group.position; pos = V(j.x - 1.5, 1.35, j.z + 1.0); tgt = V(j.x, 1.25, j.z); fov = 40; focus = pos.distanceTo(j);
    } else if (t < 11.5) { // after Denim: low, looking up into the pour
      const u = (t - CARD_END) / 3.5; pos = V(4.0, 0.7, 4.0); tgt = V(0, lerp(2.5, 4.5, u), 0); fov = 64; focus = 5.5;
    } else if (t < 14) { // the crew, arms up
      const u = (t - 11.5) / 2.5; pos = V(-4.1, lerp(1.4, 1.8, u), 4.1); tgt = V(0.3, 2.4, 0); fov = 58; focus = 5.5;
    } else { // crane up the avenue: the stack in the middle of BaseCity
      const u = ease((t - 14) / (DUR - 14)); pos = V(4.0, lerp(3, 19, u), lerp(4.5, 15, u)); tgt = V(0, lerp(2.5, 2, u), 0); fov = 50; focus = pos.length();
    }
    cam.position.copy(pos); cam.lookAt(tgt); cam.fov = fov; cam.updateProjectionMatrix();
    bokeh.uniforms.focus.value = focus;
    bloom.strength = fast ? 0.42 : 0.3;
    sky.position.copy(cam.position);
    composer.render(dt);
  }
  window.__film = () => {};
  window.__clip = { frame, duration: DUR };
}
