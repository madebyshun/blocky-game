import * as THREE from 'three';
import { hash } from './sim.js';
import { makeDrone } from './fleet.js';

// The city's AI agents: drones that leave the AI Agent Hub and every AI Startup with a parcel,
// fly over the rooftops to another building, deliver, and fly back for the next job. The hub
// launches four, each startup two more.

const SPEED = 6, CLIMB = 3, CRUISE = 8;

export function createAgents(city) {
  const group = new THREE.Group();
  city.root.add(group);
  const drones = [];
  let deliveries = 0;

  const bases = () => city.built.filter((b) => b.type === 'agenthub' || b.type === 'aistartup');
  const roof = (b) => b.h + 1.2;

  function leg(d, from, to) {
    d.from = from; d.to = to;
    d.cruise = Math.max(CRUISE + hash(d.n, 3) * 3, roof(from) + 2, roof(to) + 2);
    d.phase = 'up';
    d.mesh.userData.parcel.visible = d.carry;
  }

  function spawn(n) {
    const home = bases()[n % bases().length];
    const d = { n, mesh: makeDrone(), carry: true, wait: hash(n, 1) * 3, jobs: 0 };
    d.mesh.position.set(home.x, roof(home), home.z);
    group.add(d.mesh);
    leg(d, home, pickTarget(d, home));
    drones.push(d);
  }

  function pickTarget(d, from) {
    const list = d.carry ? city.built.filter((b) => b !== from) : bases();
    if (!list.length) return from;
    return list[Math.floor(hash(d.n, d.jobs++, 7) * list.length)];
  }

  const P = new THREE.Vector3();
  function update(t, dt) {
    const c = city.counts;
    const want = bases().length ? Math.min(14, (c.agenthub ? 4 : 0) + 2 * (c.aistartup || 0)) : 0;
    while (drones.length < want) spawn(drones.length);
    for (const d of drones) {
      const m = d.mesh;
      m.userData.spin(dt);
      if (d.wait > 0) { d.wait -= dt; m.position.y += Math.sin(t * 3 + d.n) * 0.002; continue; }
      const p = m.position;
      if (d.phase === 'up') {
        p.y = Math.min(d.cruise, p.y + CLIMB * dt);
        if (p.y >= d.cruise) d.phase = 'fly';
      } else if (d.phase === 'fly') {
        P.set(d.to.x - p.x, 0, d.to.z - p.z);
        const dist = P.length(), step = SPEED * dt;
        if (dist <= step) { p.x = d.to.x; p.z = d.to.z; d.phase = 'down'; }
        else { P.multiplyScalar(step / dist); p.x += P.x; p.z += P.z; }
        m.rotation.y = Math.atan2(-(d.to.z - p.z), d.to.x - p.x);
        m.rotation.z = -0.12; // nose down while cruising
      } else if (d.phase === 'down') {
        m.rotation.z = 0;
        p.y = Math.max(roof(d.to), p.y - CLIMB * dt);
        if (p.y <= roof(d.to)) {
          if (d.carry) deliveries++; // dropped the parcel
          d.carry = !d.carry; // back to a base to load the next one
          d.wait = 1.2;
          leg(d, d.to, pickTarget(d, d.to));
        }
      }
    }
  }

  return { update, get deliveries() { return deliveries; }, get count() { return drones.length; } };
}

// For the gallery: three drones hovering at different heights.
export function dronesSample() {
  const g = new THREE.Group();
  const list = [[-1.6, 1.4, -1], [0.4, 2.4, 0.6], [1.8, 1.8, -1.4]].map(([x, y, z], i) => {
    const d = makeDrone();
    d.position.set(x, y, z);
    d.userData.parcel.visible = i !== 1;
    g.add(d);
    return { d, y };
  });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.15, 6.4), new THREE.MeshLambertMaterial({ color: 0x2b2f36 }));
  pad.position.y = 0.075;
  pad.receiveShadow = true;
  g.add(pad);
  g.userData.animate = (t, dt) => list.forEach(({ d, y }, i) => { d.userData.spin(dt || 0.016); d.position.y = y + Math.sin(t * 2 + i) * 0.15; });
  return g;
}
