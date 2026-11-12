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
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { buildBlocky } from '../src/citizens.js';
import { makeLegend } from '../src/sim.js';
import { CONFIG } from '../src/config.js';
import { PITCH } from '../src/sim.js';

const OPEN_END = 4.5, DUR = 17;
// Real numbers, read on 2026-11-12 ~05:00 UTC from Base (Coinbase's own tokens, 8 decimals, equity icon;
// price and 24 h DEX volume as the Base MCP token search reports them). COIN's own token was not found
// there, so it is left out of the tape and the total.
const TAPE = [['META', 628.46, 12.43e6], ['NVDA', 162.34, 11.86e6], ['AMZN', 266.33, 10.77e6], ['GOOGL', 295.14, 9.29e6], ['MSFT', 520.77, 8.44e6], ['TSLA', 386.14, 8.21e6], ['AAPL', 355.89, 4.66e6]];
const TOTAL = TAPE.reduce((a, [, , v]) => a + v, 0); // $65.66M
const AS_OF = 'Nov 12, 2026';

export function start() {
  const { THREE, scene, renderer, city, traffic, views, street } = window.__bc;
  const W = innerWidth, H = innerHeight;
  renderer.setPixelRatio(1); renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
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
    gr.addColorStop(0, '#2f86ff'); gr.addColorStop(0.42, '#62b4ff'); gr.addColorStop(0.5, '#b8e2ff'); gr.addColorStop(1, '#d9f0ff');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -1; m.frustumCulled = false; scene.add(m); return m;
  })();
  for (let i = 0; i < 12; i++) { // blocky clouds
    const c = new THREE.Mesh(new THREE.BoxGeometry(26 + (i % 3) * 12, 2.5, 9), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    const a = i * 0.52; c.position.set(cx + Math.cos(a) * 200, 55 + (i % 4) * 8, cz + Math.sin(a) * 200); c.lookAt(cx, c.position.y, cz); scene.add(c);
  }
  const key = new THREE.DirectionalLight(0xfff4e6, 1.1); key.position.set(cx - 30, 30, cz + 20); scene.add(key);

  // the crowd: Base Builders in front of the board (Jesse, Brian, Nibel, sohey, Xen), Blockies around them;
  // they cheer when the bell rings
  const mk = (b, k) => { const r = buildBlocky(b, { merge: false }); r.group.scale.multiplyScalar(k); r.group.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(r.group); return r; };
  const legend = (name) => mk(makeLegend(CONFIG.legends.findIndex((l) => l.name === name), Date.now()), 1.12);
  const crowd = [...['Jesse', 'Brian', 'Nibel', 'sohey', 'Xen'].map(legend),
    ...[[0x52c49a, 0xf6d5cf], [0xf2a33a, 0xc68e6a], [0xd65db1, 0x8d5a3b], [0x5b8def, 0xf1c9a5]].map(([shirt, skin], i) => mk({ id: 40 + i * 13, role: { id: 'builder', hat: 0xffc83d }, legend: null, tier: null, shirt, skin, trait: null }, 0.92))];
  const SPOT = [[0, -8.6], [-1.1, -8.2], [1.1, -8.2], [-0.6, -7.2], [0.6, -7.2], [-1.6, -6.4], [1.6, -6.4], [-0.4, -5.8], [0.9, -5.6]];
  crowd.forEach((r, i) => { const [x, z] = SPOT[i]; r.group.position.set(cx + x, 0.12, cz + z); r.group.rotation.y = Math.PI; });
  street.film.start();
  const T = street.film.tickers;
  const volOf = (t) => TAPE.find((x) => x[0] === t)?.[2] ?? 0;
  T.forEach((t) => street.film.build(t, Math.max(3, Math.round(1 + 3 * Math.log10(1 + volOf(t) / 1e4))) - 3)); // each tower as tall as its real 24 h volume (the same log scale as the site), less a few floors for the film to build

  // captions: a lower third, drawn over the canvas
  const ov = document.createElement('div'); ov.id = 'ov';
  ov.innerHTML = `<style>#ov{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:Inter,system-ui,sans-serif}
    #ov .cap{position:absolute;left:5%;bottom:9%;color:#fff;font:900 ${H * 0.07}px/1.05 Inter,sans-serif;text-shadow:0 4px 24px #000c;opacity:0}
    #ov .cap small{display:block;font:700 ${H * 0.028}px Inter,sans-serif;letter-spacing:.16em;opacity:.85;margin-bottom:${H * 0.01}px}
    #ov .hook{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;font:900 ${H * 0.075}px/1.1 Inter,sans-serif;text-shadow:0 4px 30px #000d;padding:0 8%;opacity:0}
    #ov .tape{position:absolute;left:0;right:0;bottom:0;height:${H * 0.06}px;background:#0a0b0dee;color:#fff;overflow:hidden;white-space:nowrap;font:700 ${H * 0.026}px/${H * 0.06}px Inter,sans-serif}
    #ov .tape i{display:inline-block;padding-left:100%;font-style:normal} #ov .tape b{color:#3d7bff;margin:0 .4em} #ov .tape em{font-style:normal;color:#9aa3b2;margin:0 1.6em 0 .3em}
    #ov .tag{position:absolute;left:0;bottom:${H * 0.06}px;background:#0052ff;color:#fff;font:800 ${H * 0.02}px Inter,sans-serif;letter-spacing:.12em;padding:.5em 1em}
    #ov .ctr{position:absolute;right:4%;top:6%;text-align:right;color:#fff;text-shadow:0 3px 18px #000c;opacity:0}
    #ov .ctr small{display:block;font:800 ${H * 0.022}px Inter,sans-serif;letter-spacing:.14em;opacity:.9}
    #ov .ctr b{display:block;font:900 ${H * 0.085}px/1 Inter,sans-serif;font-variant-numeric:tabular-nums}
    #ov .big{position:absolute;left:5%;top:9%;color:#fff;text-shadow:0 4px 30px #000c;opacity:0}
    #ov .big b{display:block;font:900 ${H * 0.13}px/1 Inter,sans-serif;font-variant-numeric:tabular-nums;color:#fff}
    #ov .big span{display:block;font:800 ${H * 0.038}px/1.2 Inter,sans-serif;margin-top:${H * 0.012}px}
    #ov .big small{display:block;font:700 ${H * 0.022}px Inter,sans-serif;letter-spacing:.1em;opacity:.85;margin-top:${H * 0.01}px}</style>
    <div class="hook" id="hook">What happens on Base<br>when Wall Street closes?</div>
    <div class="cap" id="c1"><small>NYSE · 16:00 ET</small>Wall Street closed.</div>
    <div class="cap" id="c2"><small>BASE · EVERY 200 MS</small>Blocky Street didn't.</div>
    <div class="ctr" id="ctr"><small>BLOCKS ON BASE SINCE THE BELL</small><b id="ctrn">0</b></div>
    <div class="big" id="big"><b id="bign">$0</b><span>in tokenized stocks traded on Base in 24h</span><small>7 COINBASE STOCKS · BASE DEXS · ${AS_OF.toUpperCase()}</small></div>
    <div class="tag">ON BASE · 24H · ${AS_OF.toUpperCase()}</div>
    <div class="tape"><i id="tape">${[...TAPE, ...TAPE].map(([k, p, v]) => `<b>■</b>${k} $${p.toFixed(2)}<em>$${(v / 1e6).toFixed(1)}M traded</em>`).join('')}</i></div>`;
  document.documentElement.appendChild(ov);
  const c1 = ov.querySelector('#c1'), c2 = ov.querySelector('#c2'), hook = ov.querySelector('#hook'), ctr = ov.querySelector('#ctr'), ctrn = ov.querySelector('#ctrn'), big = ov.querySelector('#big'), bign = ov.querySelector('#bign'), tape = ov.querySelector('#tape');

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const bokeh = new BokehPass(scene, cam, { focus: 8, aperture: 0.002, maxblur: 0.008 });
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.4, 0.9);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); c.rgb = mix(vec3(l), c.rgb, 1.25);
        c.rgb = (c.rgb - 0.5) * 1.1 + 0.5;
        float v = smoothstep(1.05, 0.4, distance(vUv, vec2(0.5)));
        gl_FragColor = vec4(c.rgb * mix(0.88, 1.0, v), 1.0); }`,
  }));
  composer.addPass(new OutputPass());

  const cl = (x) => Math.max(0, Math.min(1, x)), ease = (u) => u * u * (3 - 2 * u), lerp = (a, b, u) => a + (b - a) * u;
  const V = (x, y, z) => new THREE.Vector3(cx + x, y, cz + z);
  let nextDrop = 0.2, k = 0, closed = false;

  function frame(t, dt = 1 / 30, draw = true) {
    // the day goes: late afternoon → dusk → night, so the glowing blocks carry the end
    city.env.phaseOverride = lerp(0.3, 0.36, cl(t / DUR)); city.env.warm = 0.15; // a bright afternoon: 4pm in New York
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

    // the crowd: looking up at the board, then arms up and hopping when the bell rings
    crowd.forEach((r, i) => {
      const cheer = t > OPEN_END ? ease(cl((t - OPEN_END - 0.2 - i * 0.05) / 0.4)) : 0, hop = cheer ? Math.abs(Math.sin((t - OPEN_END) * 7 + i)) : 0;
      r.arms[0].rotation.x = -2.8 * cheer + hop * 0.3; r.arms[1].rotation.x = -2.8 * cheer - hop * 0.3;
      r.group.position.y = 0.12 + hop * 0.25 * cheer;
    });
    const a1 = cl((t - 7) / 0.4) * cl((10 - t) / 0.4), a2 = cl((t - 10.2) / 0.4) * cl((13.2 - t) / 0.4);
    c1.style.opacity = String(a1); c2.style.opacity = String(a2);
    hook.style.opacity = String(cl(t / 0.3) * cl((2.4 - t) / 0.3));
    tape.style.transform = `translateX(${-t * 7}%)`;
    ctr.style.opacity = String(cl((t - OPEN_END - 0.3) / 0.3) * cl((13 - t) / 0.3));
    ctrn.textContent = `+${Math.max(0, Math.floor((t - OPEN_END) * 5)).toLocaleString('en-US')}`; // Base's real pace: a block every 200 ms
    const bu = cl((t - 13.3) / 0.3); big.style.opacity = String(bu);
    bign.textContent = `$${(TOTAL * ease(cl((t - 13.3) / 2.4)) / 1e6).toFixed(1)}M`;

    let pos, tgt, fov = 46, focus = 10, ap = 0.0012;
    if (t < 2.6) { // under the arch, up the street to the board: Wall Street still open
      const u = ease(t / 2.6); pos = V(lerp(-0.4, 0.2, u), lerp(1.4, 1.9, u), lerp(17, 13, u)); tgt = V(0, 3.6, -10); fov = 50; focus = 20; ap = 0.0006;
    } else if (t < OPEN_END) { // the Base Builders in front of the board, waiting: 15:59
      const u = ease((t - 2.6) / (OPEN_END - 2.6)); pos = V(lerp(-0.8, 0.6, u), 1.35, lerp(-11.4, -11.0, u)); tgt = V(0, 1.15, -6.5); fov = 44; focus = 3.6; ap = 0.003;
    } else if (t < 7) { // the board and its bell: 16:00, CLOSED, the crowd cheers below
      const u = (t - OPEN_END) / 2.5; pos = V(lerp(-1.5, -0.6, u), lerp(3.2, 3.8, u), lerp(-4.4, -5.4, u)); tgt = V(0, 5.4, -14); fov = 44; focus = 10; ap = 0.001;
    } else if (t < 13) { // low between the towers, looking up into the pour
      const u = ease((t - 7) / 6), a = lerp(-0.5, 0.5, u); pos = V(Math.sin(a) * 1.4, 0.8, lerp(6, 1, u)); tgt = V(Math.sin(a) * 4, lerp(6, 9, u), lerp(-4, -8, u)); fov = 62; focus = 6; ap = 0.0008;
    } else { // crane up: the street lit in the city at night
      const u = ease((t - 13) / (DUR - 13)); pos = V(lerp(5, 10, u), lerp(4, 17, u), lerp(16, 22, u)); tgt = V(0, lerp(4, 3, u), lerp(0, -2, u)); fov = 50; focus = 25; ap = 0.0003;
    }
    cam.position.copy(pos); cam.lookAt(tgt); cam.fov = fov; cam.updateProjectionMatrix();
    bokeh.uniforms.focus.value = focus; bokeh.uniforms.aperture.value = ap;
    bloom.strength = 0.25 + cl((t - OPEN_END) / 6) * 0.25;
    sky.position.copy(cam.position);
    if (draw) composer.render(dt); // a render split into parts fast-forwards to its first frame without drawing
  }
  window.__film = () => {};
  window.__clip = { frame, duration: DUR };
}
