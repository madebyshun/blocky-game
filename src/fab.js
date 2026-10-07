import * as THREE from 'three';
import { PITCH } from './sim.js';
import { FAB } from './chips.js';

// Around the Chip Fab, once it stands (src/chips.js): a dredge on the river next to it pulling up sand
// for silicon, a pipe on posts carrying it to the Fab's silo, and the silicon crates that came with the
// buys, stacked by the door (as many as the silicon in stock). Just for looks: the numbers are chips.js's.

const mat = (c, e) => new THREE.MeshLambertMaterial({ color: c, ...(e ? { emissive: e, emissiveIntensity: 0.6 } : {}) });
const M = { hull: mat(0xc0392b), deck: mat(0x5d6670), cabin: mat(0xf2f4f7), glass: mat(0x7dd3fc, 0x1e90ff), arm: mat(0xf4c542), sand: mat(0xe8d9b5), pipe: mat(0x9aa3ad), post: mat(0x4a5058), crate: mat(0xd2b48c), band: mat(0x111827), chip: mat(0x76b900, 0x3a6000) };
function box(parent, w, h, d, m, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); parent.add(o); return o; }

const DREDGE = [3, 2]; // the river lot next to the Fab (plot 15 is [4, 3])

export function createFabDecor(city) {
  const group = new THREE.Group();
  city.root.add(group);
  let made = false, arm = null, bucket = null, crates = null, shown = -1;

  function build(fab) {
    // the dredge: a barge with a cabin, a sand heap and a crane arm with a bucket
    const barge = new THREE.Group();
    barge.position.set(DREDGE[0] * PITCH, 0.05, DREDGE[1] * PITCH);
    barge.rotation.y = 0.5;
    box(barge, 3.6, 0.5, 1.9, M.hull, 0, 0, 0);
    box(barge, 3.4, 0.08, 1.7, M.deck, 0, 0.5, 0);
    box(barge, 0.9, 0.8, 1.0, M.cabin, -1.1, 0.58, 0); box(barge, 0.92, 0.22, 1.02, M.glass, -1.1, 1.0, 0);
    box(barge, 1.2, 0.35, 1.0, M.sand, 0.7, 0.58, 0); box(barge, 0.7, 0.2, 0.6, M.sand, 0.7, 0.93, 0);
    arm = new THREE.Group(); arm.position.set(0.1, 0.58, 0);
    box(arm, 0.2, 1.5, 0.2, M.arm, 0, 0, 0);
    const boom = box(arm, 2.4, 0.16, 0.16, M.arm, 1.1, 1.4, 0); boom.rotation.z = -0.35;
    bucket = box(arm, 0.4, 0.3, 0.4, M.deck, 2.2, 0.4, 0);
    barge.add(arm);
    group.add(barge);
    // the pipe to the silo: on posts over the road
    const from = new THREE.Vector3(DREDGE[0] * PITCH + 1.2, 1.3, DREDGE[1] * PITCH + 0.6), to = new THREE.Vector3(fab.x - 2.45, 1.3, fab.z + 1.5);
    const len = from.distanceTo(to), mid = from.clone().add(to).multiplyScalar(0.5);
    const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, len), M.pipe);
    pipe.position.copy(mid); pipe.lookAt(to); group.add(pipe);
    for (let i = 1; i < 4; i++) { const p = from.clone().lerp(to, i / 4); box(group, 0.14, 1.3, 0.14, M.post, p.x, 0, p.z); }
    crates = new THREE.Group(); crates.position.set(fab.x + 2.5, 0.15, fab.z + 2.35); group.add(crates);
    made = true;
  }

  function stack(n) { // crates of silicon, three wide and two deep, up to two high
    crates.clear();
    for (let i = 0; i < n; i++) {
      const x = (i % 3) * 0.42 - 0.42, z = (Math.floor(i / 3) % 2) * 0.42, y = Math.floor(i / 6) * 0.38;
      box(crates, 0.38, 0.36, 0.38, M.crate, x, y, z); box(crates, 0.39, 0.05, 0.39, M.band, x, y + 0.15, z);
    }
    if (n) box(crates, 0.16, 0.04, 0.16, M.chip, 0, Math.ceil(n / 6) * 0.38 - 0.02, 0.2); // a chip on top, for show
  }

  return {
    update(t, dt, state) {
      const fab = city.built.find((b) => b.type === FAB);
      if (!fab) { if (made) { group.clear(); made = false; shown = -1; } return; }
      if (!made) build(fab);
      arm.rotation.y = Math.sin(t * 0.35) * 0.6;
      bucket.position.y = 0.4 + Math.max(0, Math.sin(t * 0.7)) * 0.5;
      const n = Math.min(12, Math.ceil((state?.silicon || 0) / 24));
      if (n !== shown) { shown = n; stack(n); }
    },
  };
}
