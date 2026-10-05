import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// City service vehicles: fire truck, police car, ambulance, garbage truck. Each faces +x (like the
// cars in vehicles.js). Light bars flash through shared materials, so one flash(t) call per frame
// drives every vehicle; parked ones (designs, gallery) can keep their lights off.

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const BODY = new THREE.MeshLambertMaterial({ vertexColors: true });
const lamp = (color, emissive) => new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0 });
const LIGHTS = { red: lamp(0xff3b3b, 0xff0000), blue: lamp(0x3b7bff, 0x0040ff), amber: lamp(0xffb020, 0xff8c00) };
const HEAD = new THREE.MeshLambertMaterial({ color: 0xfff4c8, emissive: 0xffe08a, emissiveIntensity: 0.5 });
const OFF = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });

function mesh(boxes, mat) {
  const geos = boxes.map(([w, h, d, x, y, z, color]) => {
    const g = UNIT.clone(); g.scale(w, h, d); g.translate(x, y + h / 2, z);
    if (color !== undefined) {
      const c = new THREE.Color(color), arr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return g;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), mat);
  m.castShadow = true;
  return m;
}
const wheels = (xs, z = 0.42) => xs.flatMap((x) => [[0.34, 0.34, 0.14, x, 0, z, 0x1b1b1b], [0.34, 0.34, 0.14, x, 0, -z, 0x1b1b1b]]);

function vehicle(boxes, len, lights, parked) {
  const g = new THREE.Group();
  g.add(mesh(boxes, BODY));
  g.add(mesh([[0.06, 0.12, 0.16, len / 2, 0.35, -0.26], [0.06, 0.12, 0.16, len / 2, 0.35, 0.26]], HEAD));
  for (const [kind, list] of Object.entries(lights)) g.add(mesh(list, parked ? OFF : LIGHTS[kind]));
  return g;
}

const SERVICE = {
  // red engine with a ladder on top and a red light bar on the cab
  fire(parked) {
    const red = 0xd62c1a;
    return vehicle([
      [2.6, 0.5, 0.9, 0, 0.18, 0, red],
      [0.75, 0.55, 0.86, 0.9, 0.68, 0, red],
      [0.06, 0.3, 0.72, 1.28, 0.8, 0, 0x9fd8ff],
      [1.75, 0.38, 0.86, -0.4, 0.68, 0, 0xb5241a],
      [2.62, 0.07, 0.92, 0, 0.5, 0, 0xf4f4f0],
      [1.95, 0.06, 0.06, -0.3, 1.08, 0.22, 0xd5d8dc], [1.95, 0.06, 0.06, -0.3, 1.08, -0.22, 0xd5d8dc],
      ...[-1.1, -0.75, -0.4, -0.05, 0.3, 0.6].map((x) => [0.05, 0.05, 0.44, x, 1.08, 0, 0xd5d8dc]),
      [0.1, 0.25, 0.1, 0.55, 1.06, 0, 0x9aa3ad],
      ...wheels([-0.9, -0.4, 0.9]),
    ], 2.6, { red: [[0.16, 0.1, 0.22, 0.9, 1.23, -0.2], [0.16, 0.1, 0.22, 0.9, 1.23, 0.2]] }, parked);
  },
  // white car with blue doors and a red/blue light bar
  police(parked) {
    return vehicle([
      [1.5, 0.45, 0.8, 0, 0.18, 0, 0xf4f4f0],
      [0.7, 0.22, 0.82, 0.05, 0.3, 0, 0x1f3a93],
      [0.8, 0.36, 0.72, -0.1, 0.63, 0, 0x2b2f36],
      [0.82, 0.24, 0.74, -0.1, 0.68, 0, 0x9fd8ff],
      [0.5, 0.08, 0.62, -0.1, 0.99, 0, 0x2b2f36],
      ...wheels([-0.45, 0.45], 0.38),
    ], 1.5, { red: [[0.14, 0.1, 0.24, -0.1, 1.07, -0.14]], blue: [[0.14, 0.1, 0.24, -0.1, 1.07, 0.14]] }, parked);
  },
  // white van with a red stripe and cross, red lights
  ambulance(parked) {
    const white = 0xf4f4f0, red = 0xe0302a;
    return vehicle([
      [2.1, 0.45, 0.86, 0, 0.18, 0, white],
      [1.35, 0.6, 0.86, -0.36, 0.63, 0, white],
      [0.6, 0.38, 0.8, 0.66, 0.63, 0, white],
      [0.06, 0.26, 0.66, 0.97, 0.7, 0, 0x9fd8ff],
      [2.12, 0.1, 0.88, 0, 0.5, 0, red],
      [0.36, 0.12, 0.02, -0.36, 0.92, 0.44, red], [0.12, 0.36, 0.02, -0.36, 0.8, 0.44, red],
      [0.36, 0.12, 0.02, -0.36, 0.92, -0.44, red], [0.12, 0.36, 0.02, -0.36, 0.8, -0.44, red],
      ...wheels([-0.65, 0.6]),
    ], 2.1, { red: [[0.14, 0.1, 0.2, 0.3, 1.23, -0.25], [0.14, 0.1, 0.2, 0.3, 1.23, 0.25]] }, parked);
  },
  // green compactor truck with an amber beacon
  garbage(parked) {
    const green = 0x2e7d32;
    return vehicle([
      [2.4, 0.45, 0.88, 0, 0.18, 0, 0x3a3f44],
      [0.65, 0.72, 0.86, 0.85, 0.42, 0, green],
      [0.06, 0.28, 0.7, 1.18, 0.78, 0, 0x9fd8ff],
      [1.6, 0.88, 0.9, -0.35, 0.5, 0, 0x388e3c],
      ...[-1.0, -0.6, -0.2, 0.2].map((x) => [0.06, 0.88, 0.92, x, 0.5, 0, 0x2e6b30]),
      [0.2, 0.7, 0.86, -1.18, 0.4, 0, 0x2b2f36],
      ...wheels([-0.8, 0.85]),
    ], 2.4, { amber: [[0.18, 0.14, 0.18, 0.85, 1.14, 0]] }, parked);
  },
};
export const FLEET = Object.keys(SERVICE); // fire, police, ambulance, garbage
export const makeService = (kind, parked = false) => SERVICE[kind](parked);

// light bars: red and blue alternate, amber turns like a beacon
export function flash(t) {
  const a = Math.sin(t * 9) > 0 ? 1 : 0;
  LIGHTS.red.emissiveIntensity = 1.6 * a;
  LIGHTS.blue.emissiveIntensity = 1.6 * (1 - a);
  LIGHTS.amber.emissiveIntensity = 0.4 + 1.2 * Math.max(0, Math.sin(t * 5));
}
