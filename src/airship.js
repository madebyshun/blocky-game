import * as THREE from 'three';

// The blimp that flies each new builder into the city's helipad.
const BOX = new THREE.BoxGeometry(1, 1, 1);
function B(parent, w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color }));
  m.scale.set(w, h, d);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function createAirship() {
  const g = new THREE.Group();
  const bal = 0xf4f4f0, base = 0x0052ff;
  B(g, 4.4, 1.6, 1.6, bal, 0, 1.2, 0);
  B(g, 5.2, 1.0, 1.0, bal, 0, 1.5, 0);
  B(g, 3.6, 2.0, 1.0, bal, 0, 1.0, 0);
  B(g, 3.6, 1.0, 2.0, bal, 0, 1.5, 0);
  B(g, 4.5, 0.3, 1.65, base, 0, 1.75, 0);
  B(g, 0.2, 0.9, 0.1, base, -2.5, 2.2, 0);
  B(g, 0.2, 0.1, 1.6, base, -2.5, 1.95, 0);
  B(g, 1.8, 0.6, 0.9, 0xc8a26b, 0, 0, 0);
  B(g, 0.06, 0.6, 0.06, 0x2b2f36, -0.6, 0.6, 0.3);
  B(g, 0.06, 0.6, 0.06, 0x2b2f36, 0.6, 0.6, -0.3);
  const prop = new THREE.Group();
  prop.position.set(-1.1, 0.3, 0);
  B(prop, 0.08, 0.9, 0.12, 0x2b2f36, 0, -0.45, 0);
  g.add(prop);
  g.userData.prop = prop;
  return g;
}
