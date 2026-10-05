import * as THREE from 'three';
import { buildBlocky } from './citizens.js';
import { pfpColor } from './pfp.js';

// A Blocky as an SVG: the same boxes as its 3D model, seen head-and-shoulders and flat-shaded.
// Runs anywhere (no WebGL): the NFT image API (api/nft/[id].js) and the collection pages use it.

const TILT = THREE.MathUtils.degToRad(9); // the camera looks down a little
const TURN = 0.42; // and sees the Blocky a little from its left
const VIEW = new THREE.Vector3(0, Math.sin(TILT), Math.cos(TILT)); // toward the camera
const LIGHT = new THREE.Vector3(0.45, 0.85, 0.6).normalize();
// world -> [screen x, screen y, depth toward the camera]
const project = (v) => [v.x, v.y * Math.cos(TILT) - v.z * Math.sin(TILT), v.y * Math.sin(TILT) + v.z * Math.cos(TILT)];

// faces of the unit box: corners (as ±1 signs) and the local normal
const FACES = [
  [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1], [1, 0, 0]],
  [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1], [-1, 0, 0]],
  [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1], [0, 1, 0]],
  [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1], [0, -1, 0]],
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]],
  [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [0, 0, -1]],
];

const hex = (c) => `#${c.getHexString()}`;
function shade(material, normal) {
  const k = 0.6 + 0.4 * Math.max(0, normal.dot(LIGHT));
  const c = material.color.clone().multiplyScalar(k);
  if (material.emissive && material.emissive.getHex()) c.add(material.emissive.clone().multiplyScalar(material.emissiveIntensity ?? 1));
  c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b);
  return c;
}

// A visible flat face: its projected corners (counter-clockwise), its plane (to know its depth at any
// point of the picture) and its paint.
function face(world, normal, material) {
  if (normal.dot(VIEW) <= 1e-4) return null; // facing away
  let pts = world.map(project);
  const signed = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (Math.abs(signed) < 1e-9) return null; // edge-on
  if (signed < 0) pts = pts.reverse();
  const [nx, ny, nz] = project(normal);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return {
    pts, nx, ny, nz, x0: pts[0][0], y0: pts[0][1], z0: pts[0][2],
    depth: pts.reduce((s, p) => s + p[2], 0) / pts.length,
    minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
    fill: hex(shade(material, normal)), opacity: material.transparent ? material.opacity : 1,
  };
}
const depthAt = (f, x, y) => f.z0 - (f.nx * (x - f.x0) + f.ny * (y - f.y0)) / f.nz;

// Every visible face of the Blocky, turned and tilted like its portrait.
function faces(b) {
  const { group } = buildBlocky(b, { merge: false });
  group.scale.setScalar(1);
  group.rotation.y = TURN;
  group.updateMatrixWorld(true);
  const out = [], nm = new THREE.Matrix3();
  group.traverse((o) => {
    if (!o.isMesh || !o.material?.color) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const m = o.material;
    if (o.geometry.type === 'BoxGeometry') {
      nm.getNormalMatrix(o.matrixWorld);
      for (const [a, b2, c, d, normal] of FACES) {
        const world = [a, b2, c, d].map((k) => new THREE.Vector3(k[0] * 0.5, k[1] * 0.5, k[2] * 0.5).applyMatrix4(o.matrixWorld));
        const f = face(world, new THREE.Vector3(...normal).applyMatrix3(nm).normalize(), m);
        if (f) out.push(f);
      }
      return;
    }
    // anything round (halo, swim ring) is drawn from its triangles: a low-poly look that fits
    const pos = o.geometry.attributes.position, index = o.geometry.index;
    const at = (i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const world = [0, 1, 2].map((k) => at(index ? index.getX(i + k) : i + k));
      const normal = new THREE.Vector3().subVectors(world[1], world[0]).cross(new THREE.Vector3().subVectors(world[2], world[0]));
      if (normal.lengthSq() < 1e-14) continue;
      const f = face(world, normal.normalize(), m);
      if (f) out.push(f);
    }
  });
  return out;
}

// Sutherland–Hodgman: the part of convex polygon `poly` inside convex polygon `by` (both counter-clockwise).
function clip(poly, by) {
  let out = poly;
  for (let i = 0; i < by.length && out.length; i++) {
    const [ax, ay] = by[i], [bx, by2] = by[(i + 1) % by.length];
    const side = (p) => (bx - ax) * (p[1] - ay) - (by2 - ay) * (p[0] - ax);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}
function centroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length], k = x0 * y1 - x1 * y0;
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
  }
  return a > 1e-12 ? { area: a / 2, x: cx / (3 * a), y: cy / (3 * a) } : { area: 0 };
}

// Painter's order: wherever two faces overlap on the picture, the one farther away is painted first
// (coplanar ones: the later part, a decoration, goes on top). Boxes that cut into each other can
// make a loop; the farthest face left breaks it.
function paintOrder(list) {
  const n = list.length, after = list.map(() => []), waits = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const a = list[i];
    for (let j = i + 1; j < n; j++) {
      const b = list[j];
      if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) continue;
      const o = centroid(clip(a.pts, b.pts));
      if (!(o.area > 1e-6)) continue;
      const d = depthAt(a, o.x, o.y) - depthAt(b, o.x, o.y);
      const [first, next] = d > 1e-5 ? [j, i] : [i, j];
      after[first].push(next);
      waits[next]++;
    }
  }
  const done = new Array(n).fill(false), out = [], ready = [];
  for (let i = 0; i < n; i++) if (!waits[i]) ready.push(i);
  while (out.length < n) {
    if (!ready.length) {
      let pick = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || list[i].depth < list[pick].depth)) pick = i;
      ready.push(pick);
    }
    const i = ready.shift();
    if (done[i]) continue;
    done[i] = true;
    out.push(list[i]);
    for (const k of after[i]) if (--waits[k] === 0 && !done[k]) ready.push(k);
  }
  return out;
}

const RARITY_TAG = { uncommon: 'UNCOMMON', rare: 'RARE', legendary: 'LEGENDARY' };

// size: pixels of the square image. label: the Blocky's number and rarity in the corners.
export function blockySvg(b, { size = 1024, label = true } = {}) {
  const list = paintOrder(faces(b));
  const pts = list.flatMap((f) => f.pts);
  const top = Math.max(...pts.map((p) => p[1])) + 0.06, bottom = 0.34 * Math.cos(TILT);
  const halfW = Math.max(...pts.filter((p) => p[1] > bottom).map((p) => Math.abs(p[0]))) + 0.06;
  const scale = Math.min((size * 0.84) / (top - bottom), (size * 0.88) / (2 * halfW));
  const X = (x) => +(size / 2 + x * scale).toFixed(1);
  const Y = (y) => +(size * 0.09 + (top - y) * scale).toFixed(1);
  const body = list.map((f) => {
    const op = f.opacity < 1 ? ` fill-opacity="${f.opacity}" stroke-opacity="${f.opacity}"` : '';
    return `<polygon points="${f.pts.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')}" fill="${f.fill}" stroke="${f.fill}" stroke-width="0.8" stroke-linejoin="round"${op}/>`;
  }).join('');
  const color = new THREE.Color(pfpColor(b)), light = color.clone().lerp(new THREE.Color('#ffffff'), 0.35), dark = color.clone().multiplyScalar(0.72);
  const cell = size / 16, u = size / 1024;
  const tag = RARITY_TAG[b.rarity?.id];
  const labels = !label ? '' : `
  <g font-family="Inter, Arial, Helvetica, sans-serif" font-weight="800">
    <rect x="${28 * u}" y="${size - 74 * u}" width="${(b.kind === 'blocky' ? 34 + 21 * String(b.id).length : 30 + 17 * b.name.length) * u}" height="${48 * u}" rx="${24 * u}" fill="#0a0e18" fill-opacity="0.55"/>
    <text x="${46 * u}" y="${size - 40 * u}" font-size="${30 * u}" fill="#ffffff">${b.kind === 'blocky' ? `#${b.id}` : b.name.replace(/[<&>]/g, '')}</text>
    ${tag ? `<rect x="${28 * u}" y="${28 * u}" width="${(28 + 19 * tag.length) * u}" height="${44 * u}" rx="${22 * u}" fill="#0a0e18" fill-opacity="0.55"/><text x="${44 * u}" y="${59 * u}" font-size="${26 * u}" fill="#ffc83d">${tag}</text>` : ''}
    <rect x="${size - 196 * u}" y="${size - 70 * u}" width="${170 * u}" height="${42 * u}" rx="${21 * u}" fill="#0a0e18" fill-opacity="0.45"/>
    <rect x="${size - 182 * u}" y="${size - 58 * u}" width="${18 * u}" height="${18 * u}" fill="#0052ff"/>
    <text x="${size - 156 * u}" y="${size - 41 * u}" font-size="${26 * u}" fill="#ffffff">BaseCity</text>
  </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="72%"><stop offset="0" stop-color="${hex(light)}"/><stop offset="1" stop-color="${hex(dark)}"/></radialGradient>
    <pattern id="grid" width="${cell * 2}" height="${cell * 2}" patternUnits="userSpaceOnUse"><rect x="${cell}" width="${cell}" height="${cell}" fill="#ffffff" fill-opacity="0.08"/><rect y="${cell}" width="${cell}" height="${cell}" fill="#ffffff" fill-opacity="0.08"/></pattern>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <rect width="${size}" height="${size}" fill="url(#grid)"/>
  ${body}${labels}
</svg>`;
}
