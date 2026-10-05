// The city sim (src/sim.js): with a fixed number of Blockies it never runs out of work (when the land
// is full it rebuilds the oldest homes, shops and offices denser), a whale still gets its fountain,
// and a long replay stays fast. Run: npm test
import assert from 'node:assert/strict';
import { CitySim, cityCrew, makeBlocky, CATALOG } from '../src/sim.js';

const HOUR = 3600000, DAY = 24 * HOUR, t0 = Date.UTC(2026, 9, 1);
const city = (n, whales = []) => {
  const crew = [...cityCrew(t0), ...Array.from({ length: n }, (_, i) => makeBlocky(i + 1, t0 + 60000, '0x1', i))];
  const sim = new CitySim(t0);
  sim.setCrew(crew, whales);
  return sim;
};

// 150 Blockies used to fill their land in ~3 days and stop; now the crew keeps rebuilding
let sim = city(150);
const at = (d) => { sim.advance(t0 + d * DAY); return { blocked: !!sim.blocked, done: sim.done.length, standing: sim.buildingCount, rebuilt: sim.done.filter((p) => p.rebuilds).length }; };
const d5 = at(5), d15 = at(15), d30 = at(30);
assert.equal(d5.blocked || d15.blocked || d30.blocked, false, 'the crew ran out of work');
assert.ok(d30.done > d15.done && d15.done > d5.done, 'projects keep finishing');
assert.ok(d30.rebuilt > 20, `only ${d30.rebuilt} rebuilds in 30 days`);
assert.equal(d30.standing, d15.standing, 'rebuilds replace buildings, the lot count holds');
assert.ok(sim.next.rebuilds, 'the next project is a rebuild');
// rebuilds never shrink a lot, and downtown gets denser
for (const p of sim.done.filter((x) => x.rebuilds)) {
  const old = sim.done.find((x) => x.name === p.rebuilds);
  assert.ok(CATALOG[p.type].cost >= CATALOG[old.type].cost, `${p.name} is smaller than ${old.name}`);
}
// a skyscraper is only torn down once nothing else can grow
const firstTop = sim.done.findIndex((p) => p.rebuilds && sim.done.find((x) => x.name === p.rebuilds).type === 'skyscraper');
if (firstTop >= 0) {
  const later = sim.done.slice(0, firstTop);
  assert.ok(later.filter((p) => p.rebuilds).length > 50, 'skyscrapers rebuilt before the rest grew');
}
const avgCost = (list) => list.reduce((s, p) => s + CATALOG[p.type].cost, 0) / list.length;
const downtown = (p) => Math.max(Math.abs(p.lot[0]), Math.abs(p.lot[1])) <= 1;
const before = city(150);
before.advance(t0 + 3 * DAY);
const homesThen = [...before.standing.values()].filter((p) => p.kind === 'building' && downtown(p));
const homesNow = [...sim.standing.values()].filter((p) => p.kind === 'building' && downtown(p));
assert.ok(avgCost(homesNow) > avgCost(homesThen), 'downtown did not get denser');
console.log(`city: 150 Blockies, day 30: ${d30.standing} lots built, ${d30.rebuilt} rebuilt, downtown avg cost ${Math.round(avgCost(homesThen))} -> ${Math.round(avgCost(homesNow))}`);

// a whale buying once the land is full still gets a fountain, in place of an old building
sim = city(150, [{ from: '0xwhale', usd: 1500, at: t0 + 10 * DAY }]);
sim.advance(t0 + 12 * DAY);
assert.ok([...sim.standing.values()].some((p) => p.kind === 'wonder'), 'no whale fountain');

// more Blockies still grow the land first
sim = city(150);
sim.advance(t0 + 10 * DAY);
const land = sim.land;
const more = [...cityCrew(t0), ...Array.from({ length: 400 }, (_, i) => makeBlocky(i + 1, i < 150 ? t0 + 60000 : t0 + 10 * DAY, '0x1', i))];
sim.setCrew(more, []);
sim.advance(t0 + 14 * DAY);
assert.ok(sim.land > land, 'new Blockies did not grow the land');

// a year of replay stays quick, in one call
const t = performance.now();
sim = city(1000);
sim.advance(t0 + 365 * DAY);
const ms = performance.now() - t;
assert.ok(ms < 4000, `a year took ${Math.round(ms)}ms`);
assert.ok(sim.next.startedAt === undefined && sim.advance(t0 + 365 * DAY).length === 0, 'one call did not catch up');
console.log(`city: a year of 1,000 Blockies replays in ${Math.round(ms)}ms (${sim.done.length} projects)`);
console.log('city: all checks pass');
