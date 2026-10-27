// Base Live: a block of the city (CONFIG.baseLive, west side) where Base itself runs, block by block,
// as a 3D dashboard. It's drawn at 0.6 scale, turned so its front (the chain) faces town.
// - The Base Tower and "the chain": every Base block (2 s) drops in as a bar, its height the block's
//   transactions, its colour how full it was. LIVE cards over each building (block, TPS, gas, ...).
// - USDC moved on Base runs as trucks from the USDC Bank; $100k+ transfers are big trucks, $1M+ a whale
//   ship in the Bridge Port and a line in the city log. Deposits bridged in from Ethereum dock as boats.
//   A new Basename sets off fireworks over the Basename Registry, its name in the sky.
// - The Data Plaza: the last hour and the day on big screens. App slots: "your app here".
// - Find my tx: a transaction drives through the district with its card. My Base: a wallet as a little
//   plot of its own (ETH, USDC, $BLOCKY, transactions). Both make a share card.
// Render only (the sim never sees any of this). Every number is read from Base (api/_baselive.js);
// when the feed is down the cards say so instead of guessing.
import * as THREE from 'three';
import { PITCH } from './sim.js';
import { CONFIG } from './config.js';
import { esc, shortAddr } from './names.js';

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map();
const mat = (color, emissive = 0) => {
  const k = `${color}|${emissive}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, emissive }));
  return mats.get(k);
};
function box(parent, w, h, d, color, x, y, z, emissive) {
  const m = new THREE.Mesh(UNIT, mat(color, emissive));
  m.scale.set(w, h, d); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
const BLUE = 0x0052ff, WHITE = 0xf4f6fa, DARK = 0x1d2430, GLASS = 0x2a3a58, PAVE = 0xd9dde4, ORANGE = 0xff6a3d, GOLD = 0xffc83d, USDC_BLUE = 0x2775ca;

// a sign: text on a canvas, on a thin panel facing +z
function sign(text, { w = 4, h = 1, bg = '#0052ff', fg = '#ffffff', font = 'bold 64px Inter, sans-serif' } = {}) {
  const c = document.createElement('canvas');
  c.width = Math.round(256 * w / h); c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.font = font.replace(/\d+px/, `${Math.round(c.height * 0.5)}px`); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 6);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
}
// a screen whose canvas is redrawn with draw(g, w, h)
function screen(w, h) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * h / w);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.userData.draw = (fn) => { fn(c.getContext('2d'), c.width, c.height); tex.needsUpdate = true; };
  return m;
}

// ---------- numbers ----------
const compact = (v, d = 1) => (v >= 1e9 ? `${(v / 1e9).toFixed(d)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(d)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(d)}k` : `${Math.round(v)}`);
const usd = (v) => `$${compact(v)}`;
const int = (v) => Math.round(v).toLocaleString('en-US');
const eth = (v) => (v >= 100 ? int(v) : v >= 1 ? v.toFixed(2) : v.toFixed(4));
const gwei = (v) => (v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toFixed(4));

// ---------- the district's layout (local, metres; +x east, +z south) ----------
const SPOTS = {
  tower: [0, -9], port: [-18, -8], bank: [-12, 3], dex: [12, 3], registry: [17, -9], plaza: [0, 3],
  apps: [[-15, 11], [-8, 11], [8, 11], [15, 11]], mine: [0, 11],
};
const BARS = 30, BAR_X0 = -14.5, BAR_Z = 16.6; // the chain, along the front: the last 30 blocks, newest at the east end
export const DISTRICT = { w: 46, d: 36 };

export function createBaseLive(city, { camera, renderer, scene, controls, open = () => true, log, blockiesOf, feed = '/api' } = {}) {
  const group = new THREE.Group();
  city.root.add(group);
  const ground = new THREE.Group(); group.add(ground);

  // where it sits: the middle of its lots (CONFIG.baseLive), turned a quarter so the front faces east
  const lots = CONFIG.baseLive?.lots || [[0, 0]], SCALE = 0.6;
  const mid = (k) => ((Math.min(...lots.map((l) => l[k])) + Math.max(...lots.map((l) => l[k]))) / 2) * PITCH;
  group.scale.setScalar(SCALE); group.rotation.y = Math.PI / 2;
  group.position.set(mid(0) - 2.5 * SCALE, 0, mid(1)); // the plaza's centre is 2.5 m in front of the origin
  group.updateMatrix();
  const center = new THREE.Vector3(mid(0), 2, mid(1));

  // ---------- the ground: a pale plaza, footpaths, a road in from the highway ----------
  box(ground, DISTRICT.w, 0.1, DISTRICT.d, PAVE, 0, 0.02, 2.5);
  for (const [x, z, w, d] of [[0, -2.6, 40, 1.4], [-12, 7.6, 1.4, 2.4], [12, 7.6, 1.4, 2.4], [0, 14.4, 34, 1]]) box(ground, w, 0.11, d, 0xc4c9d2, x, 0.03, z);
  for (const [x, z] of [[-21.5, 19], [-21, -14], [21.5, 19], [21, -2], [-6, -14], [6, -14], [-21, 4], [21, 10]]) { // trees round the edge
    box(ground, 0.3, 1.2, 0.3, 0x7a5a3a, x, 0.6, z);
    box(ground, 1.6, 1.6, 1.6, 0x4caf50, x, 1.9, z);
  }

  // ---------- the Base Tower ----------
  const tower = new THREE.Group(); tower.position.set(...xz(SPOTS.tower)); group.add(tower);
  box(tower, 7, 0.6, 7, 0xe8ebf0, 0, 0.3, 0);
  box(tower, 4.6, 15, 4.6, BLUE, 0, 8, 0);
  for (let y = 2; y < 15; y += 1.4) for (const s of [-1, 1]) {
    box(tower, 4.66, 0.5, 0.2, GLASS, 0, y, 2.3 * s, 0x0a1a40); box(tower, 0.2, 0.5, 4.66, GLASS, 2.3 * s, y, 0, 0x0a1a40);
  }
  box(tower, 5, 0.4, 5, WHITE, 0, 15.6, 0);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.12, 8, 48), new THREE.MeshBasicMaterial({ color: 0x5c9bff, transparent: true, opacity: 0.7 }));
  halo.rotation.x = Math.PI / 2; halo.position.y = 17.2; tower.add(halo);
  const logo = new THREE.Group(); logo.position.y = 19; tower.add(logo); // the Base mark: a blue square, rounded corners
  const mark = new THREE.Shape(), R = 0.32, S2 = 1.5;
  mark.moveTo(-S2 + R, -S2); mark.lineTo(S2 - R, -S2); mark.quadraticCurveTo(S2, -S2, S2, -S2 + R); mark.lineTo(S2, S2 - R); mark.quadraticCurveTo(S2, S2, S2 - R, S2);
  mark.lineTo(-S2 + R, S2); mark.quadraticCurveTo(-S2, S2, -S2, S2 - R); mark.lineTo(-S2, -S2 + R); mark.quadraticCurveTo(-S2, -S2, -S2 + R, -S2);
  const markGeo = new THREE.ExtrudeGeometry(mark, { depth: 0.3, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.15);
  logo.add(new THREE.Mesh(markGeo, new THREE.MeshLambertMaterial({ color: 0x0000ff, emissive: 0x0000a0 })));
  const towerSign = sign('BASE', { w: 3.6, h: 1 }); towerSign.position.set(0, 1.6, 2.32); tower.add(towerSign);

  // ---------- the chain: one bar per block ----------
  const chain = new THREE.Group(); group.add(chain);
  box(chain, BARS + 1.5, 0.3, 1.8, 0x2b313c, BAR_X0 + (BARS - 1) / 2, 0.15, BAR_Z); // the rail they stand on
  for (let i = 0; i < BARS; i += 5) box(chain, 0.1, 0.32, 1.84, 0x4f5868, BAR_X0 + i - 0.5, 0.16, BAR_Z);
  const bars = []; // { mesh, x, tx, y, vy, landed }
  const barColor = (gas) => new THREE.Color(gas < 0.15 ? 0x3d7bff : gas < 0.25 ? 0x22c3a6 : gas < 0.35 ? 0xffc83d : 0xff6a3d); // how full: blue, teal, yellow, orange
  const barH = (tx) => Math.max(0.3, Math.min(7, tx / 70));
  function pushBar(b) {
    const m = new THREE.Mesh(UNIT, new THREE.MeshLambertMaterial({ color: barColor(b.gas), emissive: barColor(b.gas).multiplyScalar(0.25) }));
    const h = barH(b.tx);
    m.scale.set(0.82, h, 0.82); m.castShadow = true; chain.add(m);
    for (const x of bars) x.slot -= 1;
    bars.push({ mesh: m, h, slot: BARS - 1, x: BAR_X0 + BARS - 1, y: 18, vy: 0, landed: false });
    while (bars.length > BARS) { const old = bars.shift(); chain.remove(old.mesh); old.mesh.material.dispose(); }
  }

  // ---------- the USDC Bank ----------
  const bank = new THREE.Group(); bank.position.set(...xz(SPOTS.bank)); group.add(bank);
  box(bank, 8, 0.5, 6, 0xe6e9ef, 0, 0.25, 0);
  box(bank, 7, 4, 4.6, WHITE, 0, 2.5, -0.4);
  for (let x = -3; x <= 3; x += 1.5) box(bank, 0.45, 3.4, 0.45, 0xffffff, x, 2.2, 2.2);
  box(bank, 7.6, 0.5, 5.4, 0xf8f9fb, 0, 4.15, 0); // the entablature over the columns
  const gable = new THREE.Shape(); gable.moveTo(-3.9, 0); gable.lineTo(3.9, 0); gable.lineTo(0, 1.5); gable.lineTo(-3.9, 0);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 5.6, bevelEnabled: false }).translate(0, 0, -2.8), mat(USDC_BLUE)); // a pediment, roof ridge front to back
  roof.position.y = 4.4; roof.castShadow = true; bank.add(roof);
  const usdcSign = sign('USDC', { w: 2.2, h: 0.62, bg: '#ffffff', fg: '#2775ca' }); usdcSign.position.set(0, 4.88, 2.84); bank.add(usdcSign);

  // ---------- the Bridge Port: a basin, a quay, a lighthouse ----------
  const port = new THREE.Group(); port.position.set(...xz(SPOTS.port)); group.add(port);
  const water = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 11), new THREE.MeshLambertMaterial({ color: 0x3d8fe0, transparent: true, opacity: 0.9 }));
  water.position.set(-1, 0.05, 0); port.add(water);
  box(port, 1.6, 0.5, 11, 0xb9a27a, 3.6, 0.25, 0); // the quay
  for (let z = -4.5; z <= 4.5; z += 3) box(port, 0.3, 0.6, 0.3, 0x5a4a3a, 3, 0.4, z);
  box(port, 1.1, 5, 1.1, WHITE, -4.4, 2.5, -5); box(port, 1.12, 0.8, 1.12, 0xe0393e, -4.4, 3.6, -5); box(port, 0.9, 0.6, 0.9, 0xfff2a8, -4.4, 5.3, -5, 0xffe066);
  const portSign = sign('BRIDGE PORT', { w: 4.4, h: 0.8, bg: '#1d2430' }); portSign.position.set(4.45, 1.1, 0); portSign.rotation.y = Math.PI / 2; port.add(portSign);

  // ---------- the DEX Market ----------
  const dex = new THREE.Group(); dex.position.set(...xz(SPOTS.dex)); group.add(dex);
  box(dex, 8, 0.5, 6, 0xe6e9ef, 0, 0.25, 0);
  box(dex, 7, 5.5, 4.6, 0x232a36, 0, 3.2, -0.4);
  for (let y = 1.4; y < 5.6; y += 1.1) box(dex, 7.06, 0.4, 4.66, GLASS, 0, y, -0.4, 0x10203c);
  const dexBoard = screen(6, 1.4); dexBoard.position.set(0, 4.9, 1.95); dex.add(dexBoard);
  const dexSign = sign('DEX MARKET', { w: 4.4, h: 0.8, bg: '#232a36' }); dexSign.position.set(0, 6.4, 1.9); dex.add(dexSign);

  // ---------- the Basename Registry: a blue dome ----------
  const reg = new THREE.Group(); reg.position.set(...xz(SPOTS.registry)); group.add(reg);
  box(reg, 7, 0.5, 7, 0xe6e9ef, 0, 0.25, 0);
  box(reg, 5.6, 3.4, 5.6, WHITE, 0, 2.2, 0);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(BLUE, 0x0a2a7a)); dome.position.y = 3.9; reg.add(dome);
  const regSign = sign('.base.eth', { w: 4, h: 0.9 }); regSign.position.set(0, 2.6, 2.82); reg.add(regSign);

  // ---------- the Data Plaza: three screens on posts, in an arc ----------
  const plaza = new THREE.Group(); plaza.position.set(...xz(SPOTS.plaza)); group.add(plaza);
  const screens = [-1, 0, 1].map((k) => {
    const s = new THREE.Group(); s.position.set(k * 5.4, 0, -Math.abs(k) * 1.2); s.rotation.y = -k * 0.35; plaza.add(s);
    box(s, 0.3, 2.2, 0.3, 0x3a404c, -1.8, 1.1, 0); box(s, 0.3, 2.2, 0.3, 0x3a404c, 1.8, 1.1, 0);
    box(s, 4.8, 2.9, 0.3, DARK, 0, 3.4, 0);
    const scr = screen(4.5, 2.6); scr.position.set(0, 3.4, 0.16); s.add(scr);
    return scr;
  });

  // ---------- four of Base's biggest apps (api/_baselive.js APPS), and the plot for "My Base" ----------
  // each a small HQ in its colour; its height follows its TVL on Base once that's in
  const APP_LOOK = { aerodrome: ['Aerodrome', 0x1f4bff], uniswap: ['Uniswap', 0xff007a], morpho: ['Morpho', 0x2470ff], aave: ['Aave', 0x9391f7] };
  const apps = Object.entries(APP_LOOK).map(([id, [name, color]], i) => {
    const [x, z] = SPOTS.apps[i];
    const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g);
    box(g, 6, 0.14, 4.6, 0xdfe4ec, 0, 0.07, 0);
    const tower = new THREE.Group(); g.add(tower);
    box(tower, 4.2, 1, 3, color, 0, 0.5, -0.4);
    for (const y of [0.25, 0.55, 0.85]) box(tower, 4.26, 0.12, 3.06, GLASS, 0, y, -0.4, 0x0a1a40);
    tower.scale.y = 3;
    // a billboard on the roof with its live numbers (drawn by drawApps)
    const board = screen(4.6, 1.9); board.position.set(0, 4, 1.1); board.rotation.x = -0.25; g.add(board);
    box(g, 0.15, 1, 0.15, 0x3a404c, -1.8, 3.4, 1); box(g, 0.15, 1, 0.15, 0x3a404c, 1.8, 3.4, 1);
    return { id, name, color, g, tower, board, posts: g.children.slice(-2) };
  });
  function sizeApps() { // height: 2.5 m, plus 1.6 m per tenfold of TVL over $10M, up to 9 m
    for (const a of apps) {
      const tvl = S.stats?.apps?.[a.id];
      a.tower.scale.y = tvl ? Math.max(2.5, Math.min(9, 2.5 + Math.log10(tvl / 1e7) * 1.6)) : 3;
      const h = a.tower.scale.y;
      a.board.position.y = h + 1.5; a.posts.forEach((p) => { p.position.y = h + 0.4; });
    }
  }
  function drawApps(lines) { // lines: { id: [big number, what it is, TVL text] }
    for (const a of apps) {
      const [big, what, tvl] = lines[a.id] || ['—', '', ''];
      a.board.userData.draw((g, w, h) => {
        g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
        g.fillStyle = `#${a.color.toString(16).padStart(6, '0')}`; g.fillRect(0, 0, w, 44);
        g.fillStyle = '#ffffff'; g.font = 'bold 32px Inter, sans-serif'; g.textBaseline = 'middle'; g.fillText(a.name.toUpperCase(), 18, 23);
        g.font = 'bold 22px Inter, sans-serif'; g.textAlign = 'right'; g.fillText('● LIVE', w - 16, 23); g.textAlign = 'left';
        g.font = 'bold 78px Inter, sans-serif'; g.fillText(big, 18, 108);
        g.fillStyle = '#9fb3d9'; g.font = '24px Inter, sans-serif'; g.fillText(what, 18, 160); g.fillText(tvl, 18, 192);
      });
    }
  }
  const minePlot = new THREE.Group(); minePlot.position.set(...xz(SPOTS.mine)); group.add(minePlot);
  box(minePlot, 6, 0.14, 4.6, 0xdde6ff, 0, 0.07, 0);
  const mineSign = sign('MY BASE', { w: 3, h: 0.8 }); mineSign.position.set(0, 0.5, 2.31); minePlot.add(mineSign);
  const mine = new THREE.Group(); minePlot.add(mine);

  // ---------- routes: dotted lines on the ground, money moving along them ----------
  const route = (pts) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0.12, z)), false, 'centripetal');
  const ROUTES = {
    portBank: route([[-14.4, -6], [-13.6, -3.2], [-12.4, -1.6], [-12, -0.4]]),
    bankTower: route([[-8, -1.4], [-4.5, -2.6], [-1.6, -3.6], [0, -5]]),
    bankDex: route([[-8, -1.6], [-2, -2], [3, -2], [8, -1.6], [12, -0.4]]),
    dexTower: route([[9, -1.2], [5, -2.4], [2, -3.6], [0.8, -5]]),
    inbound: route([[-1, 22], [-1, 14.6], [-17.6, 14.6], [-17.6, 4], [-14.4, -6]]), // in from the street in front
  };
  const DOT = new THREE.BoxGeometry(0.34, 0.06, 0.34);
  for (const [name, c] of Object.entries(ROUTES)) {
    const n = Math.floor(c.getLength() / 0.9), m = mat(name === 'inbound' ? 0x8c9bb4 : ORANGE, name === 'inbound' ? 0 : 0x7a2a10);
    for (let i = 0; i <= n; i++) { const d = new THREE.Mesh(DOT, m); d.position.copy(c.getPointAt(i / n)); group.add(d); }
  }

  // movers: trucks along a route (USDC), boats into the port (deposits, whales), a car for "Find my tx"
  const movers = [];
  function truck(color, k = 1) {
    const g = new THREE.Group();
    box(g, 1.1 * k, 0.5 * k, 0.6 * k, color, 0, 0.35 * k, 0);
    box(g, 0.4 * k, 0.42 * k, 0.56 * k, WHITE, 0.6 * k, 0.32 * k, 0);
    for (const [x, z] of [[-0.35, 0.3], [-0.35, -0.3], [0.45, 0.3], [0.45, -0.3]]) box(g, 0.22 * k, 0.22 * k, 0.08 * k, DARK, x * k, 0.11 * k, z * k);
    group.add(g);
    return g;
  }
  function boat(color, k = 1) {
    const g = new THREE.Group();
    box(g, 2.2 * k, 0.5 * k, 0.9 * k, color, 0, 0.2 * k, 0);
    box(g, 0.8 * k, 0.6 * k, 0.7 * k, WHITE, -0.3 * k, 0.7 * k, 0);
    box(g, 0.12 * k, 0.6 * k, 0.12 * k, 0xe0393e, 0.3 * k, 1 * k, 0);
    group.add(g);
    return g;
  }
  const P = new THREE.Vector3(), Q = new THREE.Vector3();
  function send(mesh, curves, secs, { label = null, onDone = null, keep = 0 } = {}) {
    movers.push({ mesh, curves, secs, t: 0, label, onDone, keep });
  }
  function stepMovers(dt) {
    for (let i = movers.length - 1; i >= 0; i--) {
      const m = movers[i];
      m.t += dt;
      const u = Math.min(1, m.t / m.secs), k = u * m.curves.length, c = Math.min(m.curves.length - 1, Math.floor(k)), f = Math.min(0.999, k - c);
      const curve = m.curves[c];
      curve.getPointAt(f, P); curve.getPointAt(Math.min(1, f + 0.01), Q);
      m.mesh.position.copy(P);
      if (Q.distanceToSquared(P) > 1e-6) m.mesh.rotation.y = Math.atan2(-(Q.z - P.z), Q.x - P.x);
      if (m.label) m.label.at.copy(m.mesh.position).setY(m.mesh.position.y + 3.5).applyMatrix4(group.matrix);
      if (u >= 1) {
        if (m.keep > 0) { m.keep -= dt; continue; }
        group.remove(m.mesh); movers.splice(i, 1);
        if (m.label) dropLabel(m.label);
        m.onDone?.();
      }
    }
  }
  // a boat sails in from the west edge of the basin to the quay, waits, and leaves
  let berth = 0; // boats tie up one after another along the quay
  const basinIn = () => { const z = -11 + (berth++ % 4) * 2.4; return route([[-22.4, z - 2.2], [-20.4, z - 1.1], [-18, z - 0.3], [-15.9, z]]); };
  let following = 0; // labels riding on movers, at most a few at once
  const maybeLabel = (html, cls) => (following < 3 ? (following++, followLabel(html, cls)) : null);
  const xzv = (p) => new THREE.Vector3(p[0], 0, p[1]);

  // ---------- fireworks (a new Basename) ----------
  const sparks = [];
  const SPARK = new THREE.BoxGeometry(0.22, 0.22, 0.22);
  function firework(at, color) {
    for (let i = 0; i < 46; i++) {
      const m = new THREE.Mesh(SPARK, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(at); group.add(m);
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2, v = 4 + Math.random() * 3;
      sparks.push({ m, v: new THREE.Vector3(Math.cos(a) * Math.cos(e) * v, Math.sin(e) * v + 2, Math.sin(a) * Math.cos(e) * v), life: 1.6 + Math.random() * 0.5 });
    }
  }
  function stepSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life -= dt; s.v.y -= 5 * dt; s.v.multiplyScalar(1 - dt * 0.9);
      s.m.position.addScaledVector(s.v, dt);
      s.m.material.opacity = Math.max(0, Math.min(1, s.life));
      if (s.life <= 0) { group.remove(s.m); s.m.material.dispose(); sparks.splice(i, 1); }
    }
  }
  // a ring that pulses out on the ground (a whale at the bank)
  const rings = [];
  function pulse(x, z, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.2, z); group.add(m);
    rings.push({ m, t: 0 });
  }
  function stepRings(dt) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt;
      r.m.scale.setScalar(1 + r.t * 5); r.m.material.opacity = Math.max(0, 1 - r.t / 2.4);
      if (r.t > 2.4) { group.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); }
    }
  }

  // ---------- LIVE cards (DOM, pinned over the buildings) and pop-up labels ----------
  const layer = document.createElement('div'); layer.className = 'bl-layer'; document.body.appendChild(layer);
  const cards = [];
  function card(id, at, icon, title, accent = '#0052ff', mini = false) {
    const el = document.createElement('div');
    el.className = `bl-card${mini ? ' mini' : ''}`; el.dataset.id = id;
    el.innerHTML = `<div class="bl-head"><span class="bl-ico" style="background:${accent}22;color:${accent}">${icon}</span><div><b>${esc(title)}</b><i class="bl-live"><span></span>LIVE</i></div></div><div class="bl-rows"></div><canvas class="bl-spark" width="240" height="56"></canvas>`;
    el.onclick = () => { el.classList.toggle('open'); };
    layer.appendChild(el);
    const c = { id, el, at: new THREE.Vector3(...at), rows: el.querySelector('.bl-rows'), spark: el.querySelector('.bl-spark') };
    cards.push(c);
    return c;
  }
  const rowsHtml = (rows) => rows.map(([k, v, cls]) => `<div class="bl-row"><span>${esc(k)}</span><b class="${cls || ''}">${v}</b></div>`).join('');
  function drawSpark(cv, values, color = '#0052ff') {
    const g = cv.getContext('2d'), w = cv.width, h = cv.height;
    g.clearRect(0, 0, w, h);
    if (values.length < 2) return;
    const max = Math.max(...values, 1), min = Math.min(...values, 0);
    g.strokeStyle = color; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath();
    values.forEach((v, i) => { const x = (i / (values.length - 1)) * (w - 6) + 3, y = h - 4 - ((v - min) / (max - min || 1)) * (h - 10); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    g.lineTo(w - 3, h); g.lineTo(3, h); g.closePath(); g.fillStyle = `${color}22`; g.fill();
  }
  const pops = [];
  function popLabel(html, at, { secs = 4, rise = 3, cls = '' } = {}) {
    const el = document.createElement('div'); el.className = `bl-pop ${cls}`; el.innerHTML = html; layer.appendChild(el);
    const p = { el, at: at.clone(), t: 0, secs, rise };
    pops.push(p);
    return p;
  }
  function dropLabel(p) { const i = pops.indexOf(p); if (i >= 0) pops.splice(i, 1); p.el.remove(); if (p.follow) following = Math.max(0, following - 1); }
  const stuck = []; // labels that follow a mover: { el, at }
  function followLabel(html, cls = '') {
    const el = document.createElement('div'); el.className = `bl-pop bl-follow ${cls}`; el.innerHTML = html; layer.appendChild(el);
    const p = { el, at: new THREE.Vector3(), t: 0, secs: Infinity, rise: 0, follow: !/bl-whale|bl-mine/.test(cls) };
    pops.push(p);
    return p;
  }

  const W = (x, y, z) => [x, y, z]; // card anchors in district coordinates (placed every frame)
  const C = {
    tower: card('tower', W(0, 20.8, -9), '⛓', 'Base · blocks'),
    bank: card('bank', W(-12, 7.5, 3), '$', 'USDC Bank', '#2775ca'),
    port: card('port', W(-23, 1.5, -2), '⚓', 'Bridge Port', '#1d2430'),
    dex: card('dex', W(12, 8, 3), '⇄', 'DEX Market', '#0f9d58'),
    reg: card('reg', W(17, 7, -9), '✦', 'Basenames', '#0052ff'),
    plaza: card('plaza', W(0, 6.8, 2), '▦', 'Base today', '#7c4dff'),
  };

  // ---------- the feed ----------
  const S = {
    head: 0, blocks: [], queue: [], last: null, ok: false, fails: 0, stats: null, playAt: 0,
    swaps: [], usdcWin: [], names: [], deposits: [], seen: new Set(),
    live: { from: 0, names: 0, deposits: 0, eth: 0 }, // counted from the blocks played here, for when the hour's numbers aren't in
    tvl: null, // straight from DefiLlama when /api/basestats has none
  };
  async function poll() {
    if (document.visibilityState !== 'visible') return;
    try {
      const r = await fetch(`${feed}/baselive?since=${S.head}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      for (const b of j.blocks || []) if (b.n > S.head) { S.queue.push(b); S.head = b.n; }
      if (!S.head && j.head) S.head = j.head;
      S.ok = true; S.fails = 0;
    } catch { if (++S.fails >= 3) S.ok = false; }
  }
  async function pollStats() {
    try {
      const r = await fetch(`${feed}/basestats`);
      if (r.ok) S.stats = await r.json();
      if (S.stats?.errors && Object.keys(S.stats.errors).length) console.warn('[base live] /api/basestats:', S.stats.errors);
    } catch { /* the plaza falls back on what it sees */ }
    if (!S.stats?.tvl) { // DefiLlama answers browsers too
      try { const row = (await (await fetch('https://api.llama.fi/v2/chains')).json()).find((c) => c.name === 'Base'); if (Number.isFinite(row?.tvl)) S.tvl = row.tvl; } catch { /* none */ }
    }
    sizeApps(); drawScreens(); renderCards();
  }
  let pollTimer = null, statsTimer = null;
  function start() {
    if (pollTimer) return;
    poll(); pollStats();
    pollTimer = setInterval(poll, 4000);
    statsTimer = setInterval(pollStats, 5 * 60000);
  }

  // one block, played out in the city
  function play(b) {
    S.blocks.push(b); if (S.blocks.length > BARS) S.blocks.shift();
    S.last = b;
    if (!S.live.from) S.live.from = Date.now();
    if (!S.stats?.txPerDay || !S.stats?.names) drawScreens(); // the plaza runs on what it sees here
    pushBar(b);
    if (b.swaps !== null) { S.swaps.push(b.swaps); if (S.swaps.length > 15) S.swaps.shift(); }
    S.usdcWin.push({ t: b.t, usd: b.usdc.usd, n: b.usdc.n }); while (S.usdcWin.length && b.t - S.usdcWin[0].t > 60000) S.usdcWin.shift();
    // USDC: a few trucks for the block's transfers, a big one per $100k+, a whale ship per $1M+
    const small = Math.min(3, Math.ceil(b.usdc.n / 120));
    for (let i = 0; i < small; i++) setTimeout(() => send(truck(USDC_BLUE, 0.8), [Math.random() < 0.5 ? ROUTES.bankTower : ROUTES.bankDex], 6 + Math.random() * 2), i * 500);
    for (const x of b.usdc.big) {
      if (S.seen.has(x.tx)) continue; S.seen.add(x.tx);
      if (x.usd >= 1e6) whale(x);
      else send(truck(0x163d7a, 1.3), [ROUTES.bankDex], 8, { label: x.usd >= 250000 ? maybeLabel(`<b>${usd(x.usd)}</b> USDC`) : null });
    }
    for (const d of b.bridge) {
      if (S.seen.has(d.tx)) continue; S.seen.add(d.tx);
      S.live.deposits++; S.live.eth += d.eth;
      S.deposits.unshift({ ...d, t: b.t }); S.deposits.length = Math.min(S.deposits.length, 5);
      send(boat(0x2b6cff), [basinIn()], 7, { label: maybeLabel(d.eth ? `<b>+${eth(d.eth)} ETH</b> bridged in` : 'a token bridged in'), keep: 6 });
    }
    for (const name of b.names) {
      S.live.names++;
      S.names.unshift({ name, t: b.t }); S.names.length = Math.min(S.names.length, 6);
      firework(new THREE.Vector3(SPOTS.registry[0], 9 + Math.random() * 3, SPOTS.registry[1]), [0x5c9bff, 0xffc83d, 0xff6a3d, 0x7cf2c0][Math.floor(Math.random() * 4)]);
      popLabel(`🎆 <b>${esc(name)}</b>`, new THREE.Vector3(SPOTS.registry[0] + 4, 17, SPOTS.registry[1] + 2).applyMatrix4(group.matrix), { secs: 5, rise: 4, cls: 'bl-name' });
      log?.(`🎆 <b>${esc(name)}</b> just registered on Base`);
    }
    renderCards();
  }
  function whale(x) {
    send(boat(GOLD, 1.9), [basinIn()], 9, { label: followLabel(`🐋 <b>${usd(x.usd)}</b> USDC`, 'bl-whale'), keep: 10 });
    pulse(SPOTS.bank[0], SPOTS.bank[1], GOLD);
    log?.(`🐋 Whale on Base: <b>${usd(x.usd)} USDC</b> just moved <a href="https://basescan.org/tx/${x.tx}" target="_blank" rel="noopener">↗</a>`);
  }

  const tps = () => {
    const bs = S.blocks.slice(-15);
    if (bs.length < 2) return S.last ? S.last.tx / 2 : 0;
    const span = (bs.at(-1).t - bs[0].t) / 1000 + 2;
    return bs.reduce((s, b) => s + b.tx, 0) / span;
  };
  function renderCards() {
    const b = S.last, off = !S.ok && !b;
    const dash = '—';
    C.tower.rows.innerHTML = rowsHtml([
      ['Block', b ? `#${int(b.n)}` : dash],
      ['TPS', b ? tps().toFixed(0) : dash],
      ['Gas used', b ? `${Math.round(b.gas * 100)}%` : dash],
      ['Base fee', b ? `${gwei(b.gwei)} gwei` : dash],
    ]);
    drawSpark(C.tower.spark, S.blocks.map((x) => x.tx));
    const vol = S.usdcWin.reduce((s, x) => s + x.usd, 0), n = S.usdcWin.reduce((s, x) => s + x.n, 0);
    const span = S.usdcWin.length > 1 ? (S.usdcWin.at(-1).t - S.usdcWin[0].t) / 1000 + 2 : 2;
    C.bank.rows.innerHTML = rowsHtml([
      ['USDC moved / min', b ? usd((vol / span) * 60) : dash],
      ['Transfers / min', b ? int((n / span) * 60) : dash],
      ['Biggest this block', b?.usdc.big[0] ? usd(b.usdc.big[0].usd) : b ? `< $100k` : dash],
    ]);
    drawSpark(C.bank.spark, S.blocks.map((x) => x.usdc.usd), '#2775ca');
    const st = S.stats;
    C.port.rows.innerHTML = rowsHtml([
      st?.bridge ? ['Deposits, last hour', int(st.bridge.n)] : [`Deposits, last ${liveMin()}`, b ? int(S.live.deposits) : dash],
      st?.bridge ? ['ETH bridged in, 1h', eth(st.bridge.eth)] : [`ETH bridged in, ${liveMin()}`, b ? eth(S.live.eth) : dash],
      ['Latest', S.deposits[0] ? (S.deposits[0].eth ? `+${eth(S.deposits[0].eth)} ETH` : 'a token') : 'waiting…'],
    ]);
    const sw = S.swaps.length ? S.swaps.reduce((s, x) => s + x, 0) / S.swaps.length : null;
    C.dex.rows.innerHTML = rowsHtml([
      ['Swaps, last block', S.swaps.length ? int(S.swaps.at(-1)) : dash],
      ['Swaps / min', sw !== null ? int(sw * 30) : dash],
    ]);
    drawSpark(C.dex.spark, S.swaps, '#0f9d58');
    C.reg.rows.innerHTML = rowsHtml([
      st?.names ? ['New names, last hour', int(st.names.n)] : [`New names, last ${liveMin()}`, b ? int(S.live.names) : dash],
      ['Latest', S.names[0] ? esc(S.names[0].name) : st?.names?.last[0] ? esc(st.names.last[0]) : dash],
    ]);
    C.plaza.rows.innerHTML = rowsHtml([
      ['Tx pace / day', pace() ? compact(pace(), 2) : dash],
      ['TVL (DefiLlama)', tvl() ? usd(tvl()) : dash],
      ['Traffic', b ? `follows ${tps().toFixed(0)} TPS` : dash],
    ]);
    // the four apps: their live number (per block for swaps, per minute for lending actions) and TVL
    const seen = S.blocks.slice(-15), span2 = seen.length > 1 ? (seen.at(-1).t - seen[0].t) / 1000 + 2 : 2;
    const perBlock = (id) => { const v = seen.map((x) => x.apps?.[id]).filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const perMin = (id) => (seen.length ? (seen.reduce((s, x) => s + (x.apps?.[id] || 0), 0) / span2) * 60 : null);
    const tvlOf = (id) => (st?.apps?.[id] ? usd(st.apps[id]) : dash);
    const rate = (v, d = 1) => (v === null ? dash : v.toFixed(d));
    const tvlLine = (id) => (st?.apps?.[id] ? `TVL on Base ${usd(st.apps[id])}` : '');
    const pm = (id) => (perMin(id) === null ? dash : int(perMin(id)));
    drawApps({
      aerodrome: [rate(perBlock('aerodrome')), 'pool swaps per block', tvlLine('aerodrome')],
      uniswap: [rate(perBlock('uniswap')), 'v4 swaps per block', tvlLine('uniswap')],
      morpho: [pm('morpho'), 'lending actions per minute', tvlLine('morpho')],
      aave: [pm('aave'), 'lending actions per minute', tvlLine('aave')],
    });
    for (const c of cards) c.el.classList.toggle('off', off);
    // the DEX board
    dexBoard.userData.draw((g, w, h) => {
      g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#7cf2c0'; g.font = 'bold 42px ui-monospace, Menlo, monospace'; g.textBaseline = 'middle';
      g.fillText(S.swaps.length ? `SWAPS ${S.swaps.at(-1)} / BLOCK` : 'SWAPS —', 18, h / 2);
    });
  }
  // what the plaza shows when /api/basestats has nothing: the pace of the blocks played here, how long
  // they've been watched, TVL fetched here
  const pace = () => S.stats?.txPerDay || (S.blocks.length >= 3 ? Math.round((S.blocks.reduce((s, x) => s + x.tx, 0) / S.blocks.length) * 43200) : null);
  const tvl = () => S.stats?.tvl || S.tvl;
  const liveMin = () => { const m = S.live.from ? Math.max(1, Math.round((Date.now() - S.live.from) / 60000)) : 0; return m >= 60 ? 'hour' : `${m || 1} min`; };
  function drawScreens() {
    const st = S.stats;
    const draw = (scr, title, big, sub, color) => scr.userData.draw((g, w, h) => {
      g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
      g.fillStyle = color; g.fillRect(0, 0, w, 10);
      g.fillStyle = '#9fb3d9'; g.font = 'bold 30px Inter, sans-serif'; g.fillText(title, 24, 58);
      g.fillStyle = '#ffffff'; g.font = 'bold 92px Inter, sans-serif'; g.fillText(big, 24, 166);
      g.fillStyle = '#9fb3d9'; g.font = '26px Inter, sans-serif'; g.fillText(sub, 24, 226);
    });
    draw(screens[0], 'BASE TX / DAY', pace() ? compact(pace(), 1) : '—', st?.txPerDay ? 'pace of the last hour' : 'pace of the last minute', '#0052ff');
    draw(screens[1], 'TVL ON BASE', tvl() ? usd(tvl()) : '—', 'source: DefiLlama', '#7c4dff');
    draw(screens[2], st?.names ? 'BASENAMES / HOUR' : `BASENAMES · ${liveMin().toUpperCase()}`, st?.names ? int(st.names.n) : S.last ? int(S.live.names) : '—', S.names[0]?.name || st?.names?.last[0] || 'new names', '#ff6a3d');
  }
  drawScreens(); renderCards();

  // ---------- Find my tx ----------
  async function findTx(hash) {
    const r = await fetch(`${feed}/basetx?hash=${encodeURIComponent(hash.trim())}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Could not read that transaction');
    const name = (a) => (a && j.names?.[a]) || shortAddr(a || '');
    const what = j.usdc[0] ? `${usd(j.usdc[0].usd)} USDC` : j.eth ? `${eth(j.eth)} ETH` : `${int(j.logs)} events`;
    const lbl = followLabel(`🚗 <b>Your tx</b> · ${esc(what)}<br><small>${esc(name(j.from))} → ${esc(j.to ? name(j.to) : 'new contract')}</small>`, 'bl-mine');
    const car = truck(ORANGE, 1.5);
    send(car, [ROUTES.inbound, ROUTES.portBank, ROUTES.bankTower], 14, { label: lbl, keep: 20 });
    return { ...j, what, fromName: name(j.from), toName: j.to ? name(j.to) : 'a new contract' };
  }

  // ---------- My Base ----------
  async function myBase(who) {
    const r = await fetch(`${feed}/baseme?who=${encodeURIComponent(who.trim())}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Could not read that wallet');
    j.blockies = blockiesOf?.(j.address) ?? 0;
    buildMine(j);
    return j;
  }
  let mineCard = null;
  function buildMine(w) {
    while (mine.children.length) mine.remove(mine.children[0]);
    const lg = (v, k) => Math.max(0.3, Math.min(7, Math.log10(1 + v * k) * 2));
    const hE = lg(w.eth, 100), hU = lg(w.usdc, 1), hB = lg(w.blocky, 0.01);
    box(mine, 1.5, hE, 1.5, 0x627eea, -2, hE / 2 + 0.14, -0.5); // ETH
    box(mine, 1.5, hU, 1.5, USDC_BLUE, 0, hU / 2 + 0.14, -0.5); // USDC
    box(mine, 1.5, hB, 1.5, BLUE, 2, hB / 2 + 0.14, -0.5); // $BLOCKY
    const stack = w.txs === null ? 0 : Math.min(24, Math.ceil(Math.log2(w.txs + 1) * 2)); // transactions: a stack of little blocks
    for (let i = 0; i < stack; i++) box(mine, 0.5, 0.5, 0.5, i % 2 ? 0xffffff : 0xdde6ff, -2.6 + (i % 6) * 0.55, 0.4 + Math.floor(i / 6) * 0.52, 1.5);
    for (let i = 0; i < Math.min(8, w.blockies); i++) { // their Blockies, standing in front
      box(mine, 0.32, 0.4, 0.22, 0x0052ff, 0.8 + (i % 4) * 0.5, 0.35, 1.2 + Math.floor(i / 4) * 0.5);
      box(mine, 0.3, 0.3, 0.3, 0xf6d5cf, 0.8 + (i % 4) * 0.5, 0.72, 1.2 + Math.floor(i / 4) * 0.5);
    }
    const label = w.name || shortAddr(w.address);
    if (!mineCard) mineCard = card('mine', W(0, 8.5, 11), '◆', 'My Base', '#0052ff');
    mineCard.el.querySelector('.bl-head b').textContent = label;
    mineCard.rows.innerHTML = rowsHtml([
      ['ETH', eth(w.eth)], ['USDC', usd(w.usdc)], [CONFIG.ticker || '$BLOCKY', compact(w.blocky)],
      w.smart ? ['Wallet', 'Smart wallet'] : ['Transactions', int(w.txs)], ...(w.blockies ? [['Blockies', int(w.blockies)]] : []),
    ]);
    mineCard.el.classList.add('pin');
  }

  // ---------- a share card: the view + the numbers ----------
  function snapshot() {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/jpeg', 0.92);
  }
  async function shareImage({ title, lines, kicker }) {
    const shot = snapshot();
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = shot; });
    const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    const g = c.getContext('2d');
    const s = Math.max(1200 / img.width, 630 / img.height), iw = img.width * s, ih = img.height * s;
    g.drawImage(img, (1200 - iw) / 2 + 180, (630 - ih) / 2, iw, ih);
    const grad = g.createLinearGradient(0, 0, 620, 0); grad.addColorStop(0, 'rgba(255,255,255,0.97)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 620, 630);
    g.fillStyle = '#0052ff'; g.fillRect(48, 52, 18, 18);
    g.font = 'bold 22px Inter, sans-serif'; g.fillText(`${kicker}`, 78, 69);
    g.fillStyle = '#0b1220'; g.font = 'bold 54px Inter, sans-serif';
    wrap(g, title, 48, 140, 520, 60);
    g.font = '28px Inter, sans-serif'; g.fillStyle = '#2b3445';
    lines.forEach((l, i) => g.fillText(l, 48, 300 + i * 46));
    g.fillStyle = '#0052ff'; g.font = 'bold 26px Inter, sans-serif'; g.fillText(`${(CONFIG.siteUrl || 'basecity.space').replace(/^https?:\/\//, '')} · Base Live`, 48, 580);
    return c.toDataURL('image/png');
  }
  function wrap(g, text, x, y, max, lh) {
    let line = '', yy = y;
    for (const word of String(text).split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width > max && line) { g.fillText(line, x, yy); line = word; yy += lh; } else line = test;
    }
    g.fillText(line, x, yy);
  }

  // ---------- each frame ----------
  const V = new THREE.Vector3();
  let dash = false, vis = false;
  // a point on screen (px), or null when it's off screen
  function toScreen(at) {
    V.copy(at).project(camera);
    if (V.z > 1 || V.x < -1.1 || V.x > 1.1 || V.y < -1.1 || V.y > 1.2) return null;
    const r = renderer.domElement.getBoundingClientRect();
    return [r.left + ((V.x + 1) / 2) * r.width, r.top + ((1 - V.y) / 2) * r.height];
  }
  function project(at, el, show) {
    const p = show && toScreen(at);
    if (!p) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.transform = `translate(${p[0]}px, ${p[1]}px) translate(-50%, -100%)`;
  }
  // the cards, pinned over their buildings; where two would overlap, the higher one moves up
  function placeCards(show) {
    const list = [];
    for (const c of cards) {
      const p = show && (dash || c.id === 'tower') && toScreen(V.copy(c.at).applyMatrix4(group.matrix).applyMatrix4(city.root.matrixWorld)); // outside the Dashboard view: just the chain
      if (!p) { c.el.style.display = 'none'; continue; }
      c.el.style.display = '';
      if (!c.size || Math.random() < 0.05) c.size = [c.el.offsetWidth, c.el.offsetHeight + 14];
      list.push({ c, x: p[0], y: p[1], w: c.size[0], h: c.size[1] });
    }
    list.sort((a, b) => b.y - a.y); // lowest on screen first: it keeps its place
    for (let i = 0; i < list.length; i++) for (let j = 0; j < i; j++) {
      const a = list[i], b = list[j]; // a is higher on screen than b
      const dx = (a.w + b.w) / 2 + 6 - Math.abs(a.x - b.x);
      if (dx > 0 && a.y > b.y - b.h - 4) { // overlapping: step aside if that's a short way, else move above it; then check again
        if (dx < 80 && !a.moved) { a.x += a.x < b.x ? -dx : dx; a.moved = true; } else a.y = b.y - b.h - 4;
        j = -1;
      }
    }
    for (const { c, x, y } of list) c.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
  function update(t, dt) {
    group.visible = open(); // in a replay, not before its day
    if (!group.visible) { layer.style.display = 'none'; return; }
    layer.style.display = '';
    // play the queued blocks one every ~2 s; catch up if the queue grows
    S.playAt -= dt;
    if (S.queue.length && S.playAt <= 0) { play(S.queue.shift()); S.playAt = S.queue.length > 4 ? 0.4 : 1.9; }
    for (const b of bars) { // slide along the rail, the newest drops in from above
      const x = BAR_X0 + b.slot;
      b.x += (x - b.x) * Math.min(1, dt * 6);
      if (!b.landed) { b.vy -= 40 * dt; b.y += b.vy * dt; if (b.y <= 0.3) { b.y = 0.3; b.landed = true; } }
      b.mesh.position.set(b.x, b.y + b.h / 2, BAR_Z);
    }
    halo.rotation.z = t * 0.6; halo.position.y = 17.2 + Math.sin(t * 2) * 0.2;
    logo.rotation.y = t * 0.8;
    stepMovers(dt); stepSparks(dt); stepRings(dt);
    // the cards: in the Dashboard view, or when the camera is close to the district
    const zoomed = camera.zoom >= 1.5;
    const near = controls ? controls.target.distanceTo(V.copy(center).applyMatrix4(city.root.matrixWorld)) < 46 : false;
    vis = dash || (zoomed && near);
    layer.classList.toggle('dash', dash);
    placeCards(vis);
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t += dt;
      if (p.t > p.secs) { dropLabel(p); continue; }
      const at = V.copy(p.at); if (p.rise) at.y += (p.t / p.secs) * p.rise;
      project(at.applyMatrix4(city.root.matrixWorld), p.el, dash || (vis && p.el.classList.contains('bl-mine')));
      if (Number.isFinite(p.secs)) p.el.style.opacity = String(Math.min(1, (p.secs - p.t) * 1.5));
    }
  }
  function xz([x, z]) { return [x, 0, z]; }

  start();
  return {
    update, findTx, myBase, shareImage, tps,
    get center() { return center; }, // in city.root's coordinates
    get busy() { return S.last ? Math.max(0.4, Math.min(1.7, tps() / 150)) : 1; }, // the city's traffic follows Base
    get live() { return S.ok; },
    setDash(on) { dash = on; },
    get dash() { return dash; },
  };
}
