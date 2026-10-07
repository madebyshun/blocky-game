import * as THREE from 'three';
import { buildBlocky } from './citizens.js';

// The GPU District (a meme, @blockyonbase style): once the Power Plant on Base Avenue stands (the 'gpu'
// HQ, src/city.js), a guest in a leather jacket walks around it and holds his GPU up at the door. Just
// for looks: he doesn't build, isn't a Base Builder or a Blocky, and every visitor sees their own.

const PLANT = 'hq-gpu';
// a loop on the sidewalk around the plant (lot coordinates), and where he stops: [x, z, hold, presents]
const ROUTE = [[0.3, 3.0, 4.5, true], [2.9, 3.0, 0.6], [2.9, -2.9, 1.5], [-2.9, -2.9, 1.5], [-2.9, 3.0, 0.6]];

export function createGpuDistrict(city) {
  const group = new THREE.Group();
  city.root.add(group);
  let guest = null, at = null;

  function spawn(plant) {
    const { group: g, legs, arms } = buildBlocky({ id: 4090, role: { id: 'founder' }, legend: { look: 'leather' } });
    g.scale.setScalar(1.05);
    group.add(g);
    guest = { g, legs, arms, i: 0, wait: 2, x: ROUTE[0][0], z: ROUTE[0][1] };
    at = plant;
  }

  return {
    get here() { return !!guest; },
    update(t, dt) {
      const plant = city.built.find((b) => b.type === PLANT);
      if (!plant) { if (guest) { group.remove(guest.g); guest = null; } return; }
      if (!guest || at.x !== plant.x || at.z !== plant.z) { if (guest) group.remove(guest.g); spawn(plant); }
      const s = guest, [tx, tz, hold, presents] = ROUTE[s.i];
      const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
      if (d > 0.02) { // walking
        const v = Math.min(d, dt * 1.6);
        s.x += (dx / d) * v; s.z += (dz / d) * v;
        s.g.rotation.y = Math.atan2(dx, dz);
        const sw = Math.sin(t * 9) * 0.55;
        s.legs[0].rotation.x = sw; s.legs[1].rotation.x = -sw;
        s.arms[0].rotation.x = -sw; s.arms[1].rotation.x = -0.4;
      } else { // at a stop: at the door he faces the street and holds the GPU up high
        s.wait -= dt;
        s.legs[0].rotation.x = s.legs[1].rotation.x = 0;
        if (presents) {
          s.g.rotation.y += (0 - s.g.rotation.y) * Math.min(1, dt * 6);
          s.arms[1].rotation.x += (-2.7 - s.arms[1].rotation.x) * Math.min(1, dt * 5);
          s.arms[0].rotation.x = Math.sin(t * 3) * 0.15;
        } else s.arms[1].rotation.x += (-0.4 - s.arms[1].rotation.x) * Math.min(1, dt * 5);
        if (s.wait <= 0) { s.i = (s.i + 1) % ROUTE.length; s.wait = ROUTE[s.i][2]; }
      }
      s.g.position.set(at.x + s.x, 0.15, at.z + s.z);
    },
  };
}
