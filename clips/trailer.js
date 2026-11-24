// "BaseCity" trailer for Stocks Maxxing: one Blocky walks through the game — it wakes, works a job, gets paid
// in USDC, walks Blocky Street and stacks stocks — then the crowd of agents and the title. Game-trailer style:
// quick cuts, chunky title cards. Shot in BaseCity's own engine, in the stocks district.
// Numbers shown are the ones in docs/LAUNCH.md (50 Blockies with ERC-8004 agents, a paid $0.10 NVDA job).
// Not part of the site. Open /?still&film, then (await import('/clips/trailer.js')).start(), then
// window.__clip.frame(t) draws the film at t seconds.
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildBlocky } from '../src/citizens.js';
import { makeLegend, PITCH } from '../src/sim.js';
import { CONFIG } from '../src/config.js';

const DUR = 32;
const TICK = ['SNDK', 'MSTR', 'NVDA', 'TSLA', 'META', 'AMZN'];

export function start() {
  const { THREE, scene, renderer, city, traffic, views, street } = window.__bc;
  const W = innerWidth, H = innerHeight;
  renderer.setPixelRatio(1); renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  const cam = new THREE.PerspectiveCamera(45, W / H, 0.1, 700);

  const lots = CONFIG.stocks.lots, span = (k) => [Math.min(...lots.map((l) => l[k])), Math.max(...lots.map((l) => l[k]))];
  const [i0, i1] = span(0), [j0, j1] = span(1);
  const cx = ((i0 + i1) / 2) * PITCH, cz = ((j0 + j1) / 2) * PITCH, hw = ((i1 - i0 + 1) * PITCH) / 2, hd = ((j1 - j0 + 1) * PITCH) / 2;
  const inside = (p, pad = 0) => Math.abs(p.x - cx) < hw + pad && Math.abs(p.z - cz) < hd + pad;
  const p = new THREE.Vector3(), mine = new Set();
  street.film.group.traverse((o) => mine.add(o));
  const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  city.root.traverse((o) => {
    if (!o.isMesh || mine.has(o)) return;
    if (o.isInstancedMesh) {
      let hit = false;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); p.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); if (inside(p, -0.5)) { o.setMatrixAt(i, zero); hit = true; } }
      if (hit) o.instanceMatrix.needsUpdate = true;
      return;
    }
    o.getWorldPosition(p); if (inside(p, -0.5)) o.visible = false;
  });
  const sky = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#2f86ff'); gr.addColorStop(0.45, '#6bb8ff'); gr.addColorStop(0.52, '#c4e6ff'); gr.addColorStop(1, '#e0f3ff');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.renderOrder = -1; m.frustumCulled = false; scene.add(m); return m;
  })();
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(26 + (i % 3) * 12, 2.5, 9), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    const a = i * 0.45; c.position.set(cx + Math.cos(a) * 200, 55 + (i % 4) * 8, cz + Math.sin(a) * 200); c.lookAt(cx, c.position.y, cz); scene.add(c);
  }
  const key = new THREE.DirectionalLight(0xfff4e6, 1.2); key.position.set(cx - 30, 30, cz + 20); scene.add(key);
  const V = (x, y, z) => new THREE.Vector3(cx + x, y, cz + z);

  // the hero
  const mk = (b, k) => { const r = buildBlocky(b, { merge: false }); r.group.scale.multiplyScalar(k); r.group.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(r.group); return r; };
  const hero = mk({ id: 7, role: { id: 'builder', hat: 0x0052ff }, legend: null, tier: null, shirt: 0x0052ff, skin: 0xf2cfa0, trait: null }, 1.15);

  // the crowd at the end: Base Builders and Blockies
  const legend = (name) => mk(makeLegend(CONFIG.legends.findIndex((l) => l.name === name), Date.now()), 1.1);
  const crowd = [...['Jesse', 'Brian', 'Nibel', 'sohey', 'Xen'].map(legend)];
  const pal = [[0x52c49a, 0xf6d5cf], [0xf2a33a, 0xc68e6a], [0xd65db1, 0x8d5a3b], [0x5b8def, 0xf1c9a5], [0xe04f4f, 0xf2cfa0], [0x8b5cf6, 0xc68e6a]];
  for (let i = 0; i < 14; i++) { const [shirt, skin] = pal[i % pal.length]; crowd.push(mk({ id: 60 + i * 11, role: { id: 'builder', hat: [0xffc83d, 0x0052ff, 0xffffff][i % 3] }, legend: null, tier: null, shirt, skin, trait: null }, 0.95)); }
  crowd.forEach((r, i) => {
    const row = Math.floor(i / 5), col = i % 5;
    r.group.position.set(cx + (col - 2) * 1.05 + (row % 2) * 0.5, 0.12, cz + 3 + row * 1.0);
    r.group.rotation.y = Math.PI; r.group.visible = false;
  });

  // props: a job card, USDC coins, stock blocks
  const card = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 300; const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 300); g.fillStyle = '#0052ff'; g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#fff'; g.font = '700 30px Inter, sans-serif'; g.fillText('NEW JOB · BLUE AGENT', 24, 43);
    g.fillStyle = '#0a0b0d'; g.font = '800 38px Inter, sans-serif'; g.fillText('NVDA NAV premium', 24, 128);
    g.fillStyle = '#5b616e'; g.font = '600 26px Inter, sans-serif'; g.fillText('Stock research · paid in USDC', 24, 172);
    g.fillStyle = '#16a34a'; g.font = '900 52px Inter, sans-serif'; g.fillText('$0.10', 24, 260);
    g.fillStyle = '#0052ff'; g.fillRect(330, 212, 160, 62); g.fillStyle = '#fff'; g.font = '800 28px Inter, sans-serif'; g.fillText('ACCEPT', 352, 253);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false }));
    scene.add(m); return m;
  })();
  const coinTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#2775ca'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.beginPath(); g.arc(64, 64, 44, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.font = '900 60px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('$', 64, 85);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const coinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.04, 20);
  const coinMats = [new THREE.MeshStandardMaterial({ color: 0x2775ca, metalness: 0.4, roughness: 0.3 }), new THREE.MeshStandardMaterial({ map: coinTex, emissive: 0x112244, metalness: 0.3, roughness: 0.4 })];
  const coins = Array.from({ length: 26 }, (_, i) => { const m = new THREE.Mesh(coinGeo, [coinMats[0], coinMats[1], coinMats[1]]); m.rotation.x = Math.PI / 2; m.userData = { a: i * 2.4, r: 0.4 + (i % 5) * 0.25, d: (i * 0.137) % 1.6 }; scene.add(m); m.visible = false; return m; });
  const stockBlock = (t, color) => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, 128, 128); g.fillStyle = '#ffffff22'; g.fillRect(0, 0, 128, 14);
    g.fillStyle = '#fff'; g.font = `900 ${t.length > 3 ? 34 : 42}px Inter, sans-serif`; g.textAlign = 'center'; g.fillText(t, 64, 78);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshStandardMaterial({ map: tex, emissive: 0x111a33, roughness: 0.5 }));
    scene.add(m); m.visible = false; return m;
  };
  const stack = TICK.map((t, i) => stockBlock(t, ['#0052ff', '#f7931a', '#76b900', '#e82127', '#0866ff', '#ff9900'][i]));

  street.film.start(); street.film.nyse = { open: false, why: 'after hours', time: '16:00 ET' };
  const T = street.film.tickers;
  T.forEach((t, i) => street.film.build(t, 6 + (i * 3) % 7));

  // overlay: game-trailer title cards
  const ov = document.createElement('div'); ov.id = 'ov';
  const f = (k) => `${H * k}px`;
  ov.innerHTML = `<style>
    @font-face{font-family:Lilita;src:url(/fonts/lilita-one.woff2) format('woff2')}
    #ov{position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647}
    #ov .card{position:absolute;left:0;top:0;width:100vw;height:100vh;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;opacity:0}
    #ov .t,#ov .logo,#ov .s,#ov .pill,#ov .url{white-space:nowrap}
    #ov .t{font:400 ${f(0.13)}/1 Lilita,Inter,sans-serif;color:#fff;letter-spacing:.02em;
      text-shadow:0 ${f(0.008)} 0 #0039b3,0 ${f(0.016)} 0 #002a85,0 ${f(0.024)} 0 #001c5c,0 ${f(0.04)} ${f(0.05)} #000a}
    #ov .s{margin-top:${f(0.03)};font:800 ${f(0.035)}/1.2 Inter,sans-serif;color:#fff;letter-spacing:.14em;text-shadow:0 3px 16px #000c}
    #ov .black{position:absolute;inset:0;background:#05070d;opacity:1}
    #ov .bars:before,#ov .bars:after{content:'';position:absolute;left:0;right:0;height:${f(0.09)};background:#000}
    #ov .bars:before{top:0} #ov .bars:after{bottom:0}
    #ov .logo{font:400 ${f(0.2)}/1 Lilita,Inter,sans-serif;color:#fff;
      text-shadow:0 ${f(0.01)} 0 #0039b3,0 ${f(0.02)} 0 #002a85,0 ${f(0.03)} 0 #001c5c,0 ${f(0.04)} 0 #00133f,0 ${f(0.06)} ${f(0.06)} #000b}
    #ov .pill{margin-top:${f(0.035)};display:inline-block;background:#0052ff;color:#fff;font:800 ${f(0.032)} Inter,sans-serif;letter-spacing:.1em;padding:.55em 1.2em;border-radius:999px}
    #ov .url{margin-top:${f(0.025)};font:700 ${f(0.03)} Inter,sans-serif;color:#fff;text-shadow:0 3px 16px #000c}
  </style>
  <div class="bars"></div>
  <div class="black" id="black"></div>
  <div class="card" id="k0"><div class="s" style="letter-spacing:.3em">ON BASE, A NEW BLOCK EVERY 200 MS</div></div>
  <div class="card" id="k1"><div class="t">A CITY<br>BUILT BLOCK BY BLOCK</div></div>
  <div class="card" id="k2" style="justify-content:flex-end;padding-bottom:${f(0.14)}"><div class="t">MEET BLOCKY</div><div class="s">YOUR CITIZEN · YOUR AGENT</div></div>
  <div class="card" id="k3" style="justify-content:flex-end;padding-bottom:${f(0.13)}"><div class="t">IT WORKS</div><div class="s">TAKES JOBS FROM BLUE AGENT</div></div>
  <div class="card" id="k4" style="justify-content:flex-start;padding-top:${f(0.13)}"><div class="t">IT GETS PAID</div><div class="s">IN USDC · ONCHAIN · x402</div></div>
  <div class="card" id="k5" style="justify-content:flex-start;padding-top:${f(0.13)}"><div class="t">IT STACKS STOCKS</div><div class="s">COINBASE TOKENIZED STOCKS ON BASE</div></div>
  <div class="card" id="k6" style="justify-content:flex-start;padding-top:${f(0.13)}"><div class="t">50 BLOCKIES<br>50 ONCHAIN AGENTS</div><div class="s">ERC-8004 · ONE PER CITIZEN</div></div>
  <div class="card" id="k7"><div class="logo">BASECITY</div><div class="pill">PLAY · WORK · EARN · OWN STOCKS</div><div class="url">basecity.space · built on Base</div></div>`;
  document.documentElement.appendChild(ov);
  const $ = (id) => ov.querySelector(id), K = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => $(`#k${i}`)), black = $('#black');

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const bokeh = new BokehPass(scene, cam, { focus: 8, aperture: 0.002, maxblur: 0.008 }); composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.3, 0.4, 0.9); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const cl = (x) => Math.max(0, Math.min(1, x)), ease = (u) => u * u * (3 - 2 * u), lerp = (a, b, u) => a + (b - a) * u;
  const win = (t, a, b, f = 0.25) => cl((t - a) / f) * cl((b - t) / f);
  let nextDrop = 0, k = 0;

  // the hero's path (district coords): approach under the arch, stop, work, then walk the street
  const walk = (r, speed, t) => { const s = Math.sin(t * speed); r.legs[0].rotation.x = s * 0.7; r.legs[1].rotation.x = -s * 0.7; r.arms[0].rotation.x = -s * 0.6; r.arms[1].rotation.x = s * 0.6; };
  const still = (r) => { r.legs.forEach((l) => (l.rotation.x = 0)); r.arms.forEach((a) => (a.rotation.x = 0)); };

  function frame(t, dt = 1 / 30, draw = true) {
    city.env.phaseOverride = t < 24 ? 0.3 : lerp(0.3, 0.36, cl((t - 24) / 8)); city.env.warm = 0.12;
    while (t >= nextDrop) { street.film.drop(T[(k * 5 + (k >> 2)) % T.length], t > 14); k += 1; nextDrop += t > 14 ? 0.12 : 0.4; }
    for (const car of traffic.group.children) { car.getWorldPosition(p); car.visible = !inside(p, 2); }
    for (const v of views().values()) { const g = v.group; if (!g) continue; g.getWorldPosition(p); g.visible = !inside(p, 1); }

    // hero
    let hx = 0, hz = 16, hry = Math.PI, hy = 0.12;
    if (t < 4) { still(hero); hz = 16; hry = 0; hy = 0.12 + Math.max(0, Math.sin((t - 3) * 6)) * 0.15 * (t > 3 ? 1 : 0); hero.arms[1].rotation.x = t > 3 ? -2.6 + Math.sin(t * 12) * 0.4 : 0; }
    else if (t < 8) { const u = (t - 4) / 4; hz = lerp(16, 11, u); hry = Math.PI; walk(hero, 9, t); }
    else if (t < 12) { hz = 11; hry = Math.PI; still(hero); hero.arms[0].rotation.x = t > 10 ? -1.4 : -0.6; }
    else if (t < 15.5) { hz = 11; hry = 0; still(hero); const c = ease(cl((t - 12.5) / 0.4)); hero.arms[0].rotation.x = -2.8 * c; hero.arms[1].rotation.x = -2.8 * c; hy = 0.12 + Math.abs(Math.sin(t * 7)) * 0.25 * c; }
    else if (t < 22) { const u = (t - 15.5) / 6.5; hz = lerp(11, 2, u); hry = Math.PI; walk(hero, 10, t); }
    else { hz = 1.2; hx = 0; hry = 0; still(hero); const c = cl((t - 22.3) / 0.4); hero.arms[0].rotation.x = -2.8 * c; hero.arms[1].rotation.x = -2.8 * c; hy = 0.12 + Math.abs(Math.sin(t * 7)) * 0.2 * c; }
    hero.group.position.set(cx + hx, hy, cz + hz); hero.group.rotation.y = hry;
    const H0 = hero.group.position;

    // job card, floats in front of the hero 8 – 12
    card.visible = t > 8.2 && t < 12.2;
    const cs = ease(cl((t - 8.2) / 0.35)) * cl((12.2 - t) / 0.25);
    card.scale.setScalar(Math.max(0.001, cs)); card.position.set(H0.x, 2.25 + Math.sin(t * 2) * 0.05, H0.z - 1.1); card.rotation.set(0, 0, 0);
    // coins rain around the hero 12 – 16
    coins.forEach((c) => { const d = c.userData, u = t - 12 - d.d; c.visible = u > 0 && u < 2.2; if (!c.visible) return; c.position.set(H0.x + Math.cos(d.a) * d.r, Math.max(0.15, 5 - u * u * 4.5), H0.z + Math.sin(d.a) * d.r); c.rotation.z = u * 6; });
    // stock blocks stack beside the hero 17.5 – 32
    stack.forEach((b, i) => { const at = 17.5 + i * 0.6, u = t - at; b.visible = u > 0; if (!b.visible) return; const land = Math.max(0, 1 - u / 0.4); b.position.set(cx + 1.7, 0.4 + i * 0.57 + land * 4, (t < 22 ? H0.z : cz + 1.2) + 0.2); b.rotation.y = land * 2 + 0.2; });

    // crowd from 22
    crowd.forEach((r, i) => { r.group.visible = t > 22; const c = ease(cl((t - 22.4 - i * 0.03) / 0.4)), hop = Math.abs(Math.sin(t * 7 + i)); r.arms[0].rotation.x = -2.8 * c + hop * 0.3; r.arms[1].rotation.x = -2.8 * c - hop * 0.3; r.group.position.y = 0.12 + hop * 0.22 * c; });

    // cards
    black.style.opacity = String(Math.max(cl(1 - (t - 2.2) / 0.5), cl((t - 31.4) / 0.6)));
    K[0].style.opacity = String(win(t, 0.2, 2.2, 0.3)); K[1].style.opacity = String(win(t, 2.4, 3.8, 0.2));
    K[2].style.opacity = String(win(t, 4.3, 7.8)); K[3].style.opacity = String(win(t, 8.4, 11.8));
    K[4].style.opacity = String(win(t, 12.2, 15.4)); K[5].style.opacity = String(win(t, 17.6, 21.8));
    K[6].style.opacity = String(win(t, 22.6, 25.8)); K[7].style.opacity = String(cl((t - 26.6) / 0.5));
    const tk = $('#k7 .logo'); tk.style.transform = `scale(${lerp(1.25, 1, ease(cl((t - 26.6) / 0.6)))})`;

    // camera
    let pos, tgt, fov = 45, focus = 6, ap = 0.0015;
    if (t < 4) { const u = ease(cl((t - 2) / 2)); pos = V(lerp(-24, -1.4, u), lerp(26, 1.6, u), lerp(40, 19.2, u)); tgt = V(0, lerp(4, 1.3, u), lerp(0, 16, u)); fov = lerp(55, 40, u); focus = lerp(30, 3.4, u); ap = lerp(0.0002, 0.003, u); }
    else if (t < 8) { const u = (t - 4) / 4; pos = V(lerp(1.6, 1.2, u), 1.5, H0.z - cz - 3.2); tgt = V(0, 1.2, H0.z - cz); focus = 3.4; ap = 0.0025; fov = 42; }
    else if (t < 12) { const u = ease((t - 8) / 4); pos = V(lerp(1.8, 0.9, u), lerp(1.8, 1.6, u), 11 + lerp(2.6, 2.0, u)); tgt = V(0, 1.85, 9.6); focus = 3.3; ap = 0.002; fov = 44; }
    else if (t < 15.5) { const u = ease((t - 12) / 3.5); pos = V(Math.sin(u * 1.4) * 3.4, lerp(1.2, 2.4, u), 11 - Math.cos(u * 1.4) * 3.4); tgt = V(0, 1.1, 11); focus = 3.4; ap = 0.002; fov = 46; }
    else if (t < 22) { const u = ease((t - 15.5) / 6.5); pos = V(lerp(-2.2, -1.4, u), lerp(0.7, 1.1, u), H0.z - cz + lerp(2.6, 3.4, u)); tgt = V(0.6, lerp(3, 4, u), H0.z - cz - 6); fov = 60; focus = 3; ap = 0.0012; }
    else if (t < 26.5) { const u = ease((t - 22) / 4.5); pos = V(lerp(0, 0.6, u), lerp(1.6, 2.6, u), lerp(-3.2, -4.6, u)); tgt = V(0, 1.4, 3.5); fov = 46; focus = 5; ap = 0.0012; }
    else { const u = ease(cl((t - 26.5) / 5.5)); pos = V(lerp(6, 14, u), lerp(5, 22, u), lerp(16, 26, u)); tgt = V(0, lerp(4, 3, u), lerp(0, -2, u)); fov = 50; focus = 25; ap = 0.0002; }
    cam.position.copy(pos); cam.lookAt(tgt); cam.fov = fov; cam.updateProjectionMatrix();
    bokeh.uniforms.focus.value = focus; bokeh.uniforms.aperture.value = ap;
    bloom.strength = 0.25 + cl((t - 24) / 6) * 0.3;
    sky.position.copy(cam.position);
    if (draw) composer.render(dt);
  }
  window.__film = () => {};
  window.__clip = { frame, duration: DUR };
}
