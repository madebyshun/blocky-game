// "The Blue Square", shot in BaseCity itself: a Base Builder (blue hard hat, Base vest) leads three
// Blockies down the avenue to a giant blue square standing on Town Square, and lays a hand on it.
// Not part of the site. Open /?still&film, then: (await import('/clips/cityfilm.js')).start();
// then window.__clip.frame(t) draws the film at t seconds (driven frame by frame by a script).
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildBlocky } from '../src/citizens.js';
import { makeLegend } from '../src/sim.js';
import { CONFIG } from '../src/config.js';

export function start() {
  const { THREE, scene, renderer, city, traffic, views, sim } = window.__bc;
  const W = innerWidth, H = innerHeight;
  renderer.setPixelRatio(1); renderer.setSize(W, H);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
  city.env.phaseOverride = 0.27; city.env.warm = 0; // bright late morning
  for (const id of ['hud', 'ui']) document.getElementById(id)?.remove();
  const cam = new THREE.PerspectiveCamera(42, W / H, 0.1, 700);

  // a sky dome that follows the camera
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
    const cl = new THREE.Mesh(new THREE.BoxGeometry(26 + (i % 3) * 12, 2.5, 9), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    const a = i * 0.52; cl.position.set(Math.cos(a) * 200, 55 + (i % 4) * 8, Math.sin(a) * 200); cl.lookAt(0, cl.position.y, 0); scene.add(cl);
  }

  // a soft key light from the square's side, so the faces turned to it read
  const key = new THREE.DirectionalLight(0xf2f6ff, 1.3); key.position.set(-20, 14, 8); scene.add(key);
  // the Blue Square on Town Square (lot 0,0)
  const S = 4.6, SQ = new THREE.Vector3(0, S / 2, 0);
  const squareMat = new THREE.MeshStandardMaterial({ color: 0x1040ff, emissive: 0x1a66ff, emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.1, fog: false });
  const square = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), squareMat);
  square.position.copy(SQ); square.castShadow = square.receiveShadow = true; scene.add(square);
  const glow = new THREE.PointLight(0x5aa8ff, 0, 18, 1.6); glow.position.set(S / 2 + 0.4, 2.6, -1.2); scene.add(glow);
  // clear the plaza around it: anything of the square's own lot that pokes through
  const lotClear = (o) => { const p = new THREE.Vector3(); o.getWorldPosition(p); return Math.abs(p.x) < 2.9 && Math.abs(p.z) < 2.9 && p.y < 6; };
  city.root.traverse((o) => { if (o.isMesh && o !== square && lotClear(o) && !o.isInstancedMesh) o.visible = false; });

  // the cast: a Base Builder in front, three Blockies after
  const mk = (b, k) => { const r = buildBlocky(b, { merge: false }); r.group.scale.multiplyScalar(k); r.group.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(r.group); return r; };
  // the Base Builders: the real ones from basecity.space/builders, in their own looks. Jesse leads.
  const legend = (name) => mk(makeLegend(CONFIG.legends.findIndex((l) => l.name === name), Date.now()), 1.12);
  const crew = ['Jesse', 'Brian', 'Nibel', 'sohey', 'Xen'].map(legend), lead = crew[0];
  const kids = [[0x52c49a, 0xf6d5cf, 'builder'], [0xf2a33a, 0xc68e6a, 'carrier'], [0xd65db1, 0x8d5a3b, 'builder'], [0x5b8def, 0xf1c9a5, 'carrier']]
    .map(([shirt, skin, role], i) => mk({ id: 40 + i * 13, role: { id: role, hat: 0xffc83d }, legend: null, tier: null, shirt, skin, trait: null }, 0.92)); // the Blockies, behind
  const cast = [...crew, ...kids];
  // down the avenue at x = 4 (between Town Square and the tower going up on lot 1,0), heading -z
  const START = [[4.0, 19], [3.45, 19.6], [4.55, 19.6], [3.7, 20.6], [4.3, 20.6], [3.6, 21.8], [4.4, 22.0], [3.7, 23.2], [4.3, 23.4]];
  const STOP = [[4.0, 3.6], [3.45, 4.4], [4.55, 4.4], [3.7, 5.4], [4.3, 5.4], [3.6, 6.6], [4.4, 6.8], [3.7, 8.0], [4.3, 8.2]];
  // the construction site next door (the sim's own, live): lot 1,0 if it's being built, else the nearest one
  const sites = (sim()?.sites || []).map((x) => x.p?.lot).filter(Boolean).sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  const SITE = V0(...(sites.find((l) => l[0] === 1 && l[1] === 0) || sites[0] || [1, 0]));

  function V0(i, j) { return new THREE.Vector3(i * 8, 0, j * 8); }
  // post: bloom, depth of field, a vivid grade
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const bokeh = new BokehPass(scene, cam, { focus: 6, aperture: 0.004, maxblur: 0.01 });
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.25, 0.4, 0.95);
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
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const HEAD_Y = 0.98; // eye height of a Base Builder (their hair and hats vary)
  const head = (r) => r.group.position.clone().add(V(0, HEAD_Y * (crew.includes(r) ? 1 : 0.85), 0));
  const tmp = new THREE.Vector3();

  function walk(r, i, t) {
    const u = ease(cl((t - 2.6 - 0.15 * i) / 6.4)), [sx, sz] = START[i], [ex, ez] = STOP[i];
    r.group.position.set(lerp(sx, ex, u), 0.02, lerp(sz, ez, u));
    const sw = u > 0 && u < 1 ? Math.sin(t * 8 + i) * 0.55 : 0;
    r.legs[0].rotation.x = sw; r.legs[1].rotation.x = -sw; r.arms[0].rotation.x = -sw * 0.7; r.arms[1].rotation.x = sw * 0.7;
    r.group.rotation.y = Math.PI;
  }

  function frame(t, dt = 1 / 30) {
    cast.forEach((r, i) => walk(r, i, t));
    // stopped by the square, they turn to it (west, -x) and look up
    const turn = ease(cl((t - 8.8) / 0.7));
    cast.forEach((r) => { r.group.rotation.y = lerp(Math.PI, -Math.PI / 2, turn); });
    // the touch: the Base Builder steps up and lays a hand on it
    if (t > 11.6) {
      const u = ease(cl((t - 11.6) / 1.4));
      lead.group.position.set(lerp(4.0, S / 2 + 0.55, u), 0.02, lerp(3.6, 0.6, u));
      const sw = u < 1 ? Math.sin(t * 8) * 0.55 : 0; lead.legs[0].rotation.x = sw; lead.legs[1].rotation.x = -sw;
      lead.arms[1].rotation.x = -1.55 * ease(cl((t - 13) / 0.5)); // the hand on the square
    }
    const wake = ease(cl((t - 13.5) / 0.9));
    squareMat.emissiveIntensity = 0.3 + wake * 0.6 + (wake > 0 ? Math.sin(t * 3) * 0.08 : 0);
    glow.intensity = wake * 4;
    bloom.strength = 0.25 + wake * 0.2;
    // keep the street clear of traffic around the cast
    for (const car of traffic.group.children) { car.getWorldPosition(tmp); car.visible = !(Math.abs(tmp.x - 4) < 3.2 && tmp.z > -6 && tmp.z < 30) && !(Math.abs(tmp.z - 4) < 3.2 && Math.abs(tmp.x) < 14); }

    for (const v of views().values()) { const g = v.group; if (!g) continue; g.getWorldPosition(tmp); g.visible = !(Math.abs(tmp.x - 4) < 1.3 && tmp.z > -4 && tmp.z < 30) && !(Math.abs(tmp.x) < 3.5 && Math.abs(tmp.z) < 3.5); }
    let pos, tgt, fov = 42, focus = null, ap = 0.004;
    const L = lead.group.position;
    if (t < 3.2) { // the tower going up next door: low by the site, craning up its frame
      const u = ease(t / 3.2); const a = lerp(0.3, 0.55, u); pos = V(SITE.x + Math.cos(a) * 12, lerp(9.5, 8, u), SITE.z + Math.sin(a) * 12); tgt = V(SITE.x, lerp(4, 3, u), SITE.z); fov = 50; ap = 0.0008; focus = pos.distanceTo(SITE);
    } else if (t < 6) { // the Base Builders walk down the avenue, the Blockies behind, the city around them
      const u = (t - 3.2) / 2.8; pos = V(4.0, lerp(1.0, 1.3, u), L.z - lerp(4.2, 3.8, u)); tgt = V(4.0, 1.1, L.z + 1); fov = 44; ap = 0.002; focus = pos.distanceTo(L);
    } else if (t < 9.6) { // over their shoulders: there it is
      const u = (t - 6) / 2.8; pos = V(lerp(5.6, 5.2, u), 2.2, L.z + lerp(4.5, 3.5, u)); tgt = SQ.clone().add(V(0, 0.6, 0)); fov = 40; ap = 0.002; focus = pos.distanceTo(SQ);
    } else if (t < 11.6) { // low, close on their faces looking up at it, lit blue
      const r = t < 10.6 ? lead : crew[1], h = head(r); pos = h.clone().add(V(-1.7, -0.2, -0.55)); tgt = h.clone().add(V(0, 0.05, 0)); fov = 36; focus = pos.distanceTo(h);
    } else if (t < 15) { // the touch, from the side
      pos = V(L.x + 0.6, 1.4, L.z - 4.4); tgt = V(L.x - 0.5, 1.3, L.z + 1.4); fov = 44; focus = pos.distanceTo(L);
    } else { // crane up: the square alight in the middle of BaseCity
      const u = ease((t - 15) / 2.6); pos = V(lerp(5, 8, u), lerp(2.2, 20, u), lerp(13, 22, u)); tgt = V(lerp(0.5, 4, u), lerp(2.4, 2.5, u), 0); fov = 48; ap = 0.0008; focus = pos.distanceTo(SQ);
    }
    cam.position.copy(pos); cam.lookAt(tgt); cam.fov = fov; cam.updateProjectionMatrix();
    bokeh.uniforms.focus.value = focus ?? 8; bokeh.uniforms.aperture.value = ap;
    sky.position.copy(cam.position);
    composer.render(dt);
  }
  window.__film = () => {}; // the city keeps running, we draw
  window.__clip = { frame, duration: 17.6 };
}
