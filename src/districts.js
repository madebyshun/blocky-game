import { hash, PITCH, isReserve } from './sim.js';

// Neighbourhoods of 3x3 lots get a name from what was built there most: tech, fun, homes, green or shops,
// or woods where the city kept its forest (sim.js isReserve).
// The centre is always Downtown. Names stick once given, so the community can refer to places.

const CATEGORY = {
  tech: ['office', 'devhub', 'gpufarm', 'tower', 'skyscraper', 'school', 'hq', 'datalab', 'hackathon', 'launchpad', 'beacon', 'studio', 'airport', 'agenthub', 'aistartup'],
  finance: ['exchange', 'brokerage'],
  civic: ['firestation', 'police', 'hospital'],
  fun: ['coaster', 'ferris', 'carousel', 'park', 'lakepark', 'playground', 'pool', 'soccer', 'skatepark', 'stage', 'icecream', 'court', 'flowergarden', 'stadium', 'liberty', 'wonder'],
  home: ['cottage', 'house', 'townhouses', 'apartment', 'villa', 'garage', 'suburb'],
  green: ['farm', 'garden', 'windmill', 'watertower', 'solarfarm', 'recycling'],
  shop: ['shop', 'cafe', 'square'],
};
const NAMES = {
  tech: ['GPU Valley', 'Silicon Blocks', 'Node Row', 'Commit Heights', 'Mainnet Park'],
  fun: ['Fun Pier', 'Playland', 'Coaster Bay', 'Joy Quarter', 'Funland'],
  home: ['Builder Heights', 'Maple Grove', 'Cobble Hill', 'gm Gardens', 'Blocky Hills', 'Elm Street', 'Sunset Park', 'Willow Bend', 'Brickton', 'Lakeside'],
  green: ['Green Acres', 'Windy Fields', 'Sprout Meadows', 'Harvest Hollow', 'Solar Flats', 'Turbine Ridge'],
  shop: ['Market Street', 'Café Quarter', 'Shopside'],
  civic: ['Civic Center', 'Rescue Row', 'Safety Square'],
  finance: ['Bull Street', 'Wall Block', 'Trading Row'],
  woods: ['Blocky Woods', 'Pine Hollow', 'Oak Ridge', 'Fern Valley', 'Cedar Park', 'Mossy Glen'],
};
const catOf = Object.fromEntries(Object.entries(CATEGORY).flatMap(([c, types]) => types.map((t) => [t, c])));

const given = new Map(); // region key -> name (kept once assigned)

export function computeDistricts(done, land = 0) {
  const regions = new Map();
  const woods = [];
  for (let i = -land; i <= land; i++) for (let j = -land; j <= land; j++) if (isReserve(i, j)) woods.push({ lot: [i, j], type: 'reserve' });
  for (const p of [...done, ...woods]) {
    if (!p.lot) continue;
    const a = Math.round(p.lot[0] / 3), b = Math.round(p.lot[1] / 3), key = `${a},${b}`;
    const r = regions.get(key) || { key, a, b, lots: [], count: {} };
    r.lots.push(p.lot);
    const c = p.type === 'reserve' ? 'woods' : catOf[p.type] || 'home';
    r.count[c] = (r.count[c] || 0) + 1;
    regions.set(key, r);
  }
  const used = new Set(given.values());
  const out = [];
  for (const r of regions.values()) {
    if (r.lots.length < 2) continue;
    let name = given.get(r.key);
    if (!name) {
      if (r.a === 0 && r.b === 0) name = 'Downtown';
      else {
        const cat = Object.entries(r.count).sort((x, y) => y[1] - x[1])[0][0];
        const list = NAMES[cat];
        const start = Math.floor(hash(r.a, r.b, 90) * list.length);
        for (let i = 0; i < list.length && !name; i++) if (!used.has(list[(start + i) % list.length])) name = list[(start + i) % list.length];
        name ||= `${list[start]} ${r.a}${r.b}`;
      }
      given.set(r.key, name);
      used.add(name);
    }
    const cx = r.lots.reduce((s, l) => s + l[0], 0) / r.lots.length, cz = r.lots.reduce((s, l) => s + l[1], 0) / r.lots.length;
    out.push({ key: r.key, name, buildings: r.lots.length - (r.count.woods || 0), x: cx * PITCH, z: cz * PITCH });
  }
  return out;
}
