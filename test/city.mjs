// The city sim (src/sim.js): with a fixed number of Blockies it never runs out of work (when the land
// is full it rebuilds the oldest homes, shops and offices denser), a whale still gets its fountain,
// and a long replay stays fast. Run: npm test
import assert from 'node:assert/strict';
import { CitySim, cityCrew, makeBlocky, CATALOG, LANDMARKS, AVENUE, RENEW, setProjects, isWater } from '../src/sim.js';

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

// Blockies leaving: the site loses the blocks they placed on it, and a big exit leaves the newest
// home, shop or office abandoned until the crew rebuilds it, first thing
const leaving = (n, gone, when) => {
  const crew = [...cityCrew(t0), ...Array.from({ length: n }, (_, i) => makeBlocky(i + 1, t0 + 60000, '0x1', i))];
  for (const b of crew.slice(-gone)) b.leftAt = when;
  const s = new CitySim(t0);
  s.setCrew(crew, []);
  return s;
};
const stay = city(150);
stay.advance(t0 + 6 * DAY);
const site = stay.next, T = t0 + 6 * DAY; // mid-project: the crew is on this site at T
assert.ok(site.startedAt === undefined && stay.placed > 0, 'no site in progress at T');
const per = stay.perAt(T) - stay.perAt(stay.startOf(site)); // blocks one Blocky placed on it so far
for (const [gone, ruins] of [[5, 0], [30, 1], [65, 3]]) {
  const s = leaving(150, gone, T);
  s.advance(T);
  assert.equal(s.next.name, site.name, 'same site');
  assert.ok(Math.abs(stay.placed - s.placed - gone * per) < 1e-6, `${gone} leaving: site lost ${stay.placed - s.placed}, expected ${gone * per}`);
  const ev = s.events.filter((e) => e.at === T);
  assert.equal(ev.filter((e) => e.kind === 'setback').length, gone * per >= 0.5 ? 1 : 0, 'one setback logged');
  assert.equal(ev.filter((e) => e.kind === 'ruin').length, ruins, `${gone} leaving: ${ruins} ruins`);
  if (!ruins) continue;
  const ruined = ev.filter((e) => e.kind === 'ruin').map((e) => e.p);
  for (const r of ruined) assert.ok(r.kind === 'building' && r.ruinedAt === T && s.standing.get(r.lot.join(',')) === r, `${r.name} is not a standing ruin`);
  assert.equal(s.ruinCount, ruins);
  // the newest homes, shops or offices go; landmarks, parks and services never do
  const newest = [...s.standing.values()].filter((b) => b.kind === 'building' && RENEW.has(b.type)).sort((a, b) => b.at - a.at)[0];
  assert.ok(ruined.includes(newest) || !newest, 'the newest building was spared');
  // the crew finishes its site, then rebuilds every ruin before anything else
  s.advance(T + 10 * DAY);
  const after = s.done.filter((p) => p.k > site.k);
  assert.deepEqual(after.slice(0, ruins).map((p) => p.restores && p.rebuilds), ruined.map((r) => r.name), 'ruins are not rebuilt first');
  for (const r of ruined) {
    const p = after.find((x) => x.rebuilds === r.name);
    assert.ok(p.type === r.type && p.lot.join(',') === r.lot.join(','), `${r.name} was not rebuilt as the same kind of building`);
    assert.notEqual(s.standing.get(r.lot.join(',')), r, `${r.name} still stands in ruins`);
  }
  assert.equal(s.ruinCount, 0);
}
// the site takes longer to finish, by exactly the lost blocks
{
  const s = leaving(150, 30, T);
  s.advance(T + 10 * DAY);
  const a = s.done.find((p) => p.name === site.name), b = stay.done.find((p) => p.name === site.name) || (stay.advance(T + 10 * DAY), stay.done.find((p) => p.name === site.name));
  assert.ok(a.at > b.at && a.lost > 0, 'losing blocks did not delay the site');
}
// replaying in small steps gives the same city as one big step (departures are handled as time passes)
{
  const two = () => { // 120 leave at T, 25 more a day and a bit later
    const s = leaving(400, 120, T);
    s.builders.filter((b) => b.kind === 'blocky' && !b.leftAt).slice(-25).forEach((b) => (b.leftAt = T + 31 * HOUR));
    s.setCrew(s.builders, []);
    return s;
  };
  const one = two(), steps = two(), end = t0 + 10 * DAY;
  for (let x = t0; x <= end; x += 37 * 60000) steps.advance(x);
  steps.advance(end);
  one.advance(end);
  assert.equal(one.events.filter((e) => e.kind === 'ruin').length, 4);
  assert.equal(steps.done.length, one.done.length);
  assert.equal(steps.done.at(-1).at, one.done.at(-1).at);
  assert.equal(steps.placed, one.placed);
  assert.equal(steps.events.length, one.events.length);
}
console.log('city: leaving Blockies take their blocks off the site; a big exit leaves ruins, rebuilt first');

// every landmark and Base Avenue plot has a lot of its own on dry land
const lots = [...LANDMARKS.map((l) => l.lot), ...AVENUE].map((lot) => lot.join(','));
assert.equal(new Set(lots).size, lots.length, 'two landmarks or plots share a lot');
for (const lot of [...LANDMARKS.map((l) => l.lot), ...AVENUE]) assert.ok(!isWater(...lot), `${lot} is in the river`);
// Base Avenue: a project's HQ goes up on its plot once its goal is reached, never before the day it
// was added; plots no project has taken are never built on
{
  const sample = (id, plot, at, added) => ({ id, name: id, tagline: 'test', url: 'https://example.com', color: '#0052ff', style: 'tower', plot, at, added });
  setProjects([sample('early', 1, 50, '2026-09-01'), sample('later', 2, 0, '2026-10-11'), sample('goal', 3, 5000, '2026-09-01')]);
  const s = city(300), at = (id) => s.done.find((p) => p.type === `hq-${id}`)?.at;
  s.advance(t0 + 30 * DAY);
  assert.ok(at('early') > t0, 'an HQ whose goal was reached was not built');
  assert.ok(at('later') >= Date.parse('2026-10-11'), `an HQ went up before the day it was added: ${new Date(at('later')).toISOString()}`);
  assert.equal(at('goal'), undefined, 'an HQ went up before its goal');
  for (const lot of AVENUE.slice(3)) assert.ok(!s.standing.has(lot.join(',')), `free plot ${lot} was built on`);
  // adding a project later leaves what the city built before that day as it was
  const before = city(300);
  setProjects([]);
  const without = city(300);
  without.advance(Date.parse('2026-10-11'));
  setProjects([sample('later', 2, 0, '2026-10-11')]);
  before.setCrew(before.builders, []);
  before.advance(Date.parse('2026-10-11'));
  assert.deepEqual(before.done.map((p) => p.name), without.done.map((p) => p.name), 'adding a project changed the past');
  setProjects([]);
  console.log('city: Base Avenue HQs wait for their goal and the day they were added; free plots stay free');
}

// a year of replay stays quick, in one call
const t = performance.now();
sim = city(1000);
sim.advance(t0 + 365 * DAY);
const ms = performance.now() - t;
assert.ok(ms < 4000, `a year took ${Math.round(ms)}ms`);
assert.ok(sim.next.startedAt === undefined && sim.advance(t0 + 365 * DAY).length === 0, 'one call did not catch up');
console.log(`city: a year of 1,000 Blockies replays in ${Math.round(ms)}ms (${sim.done.length} projects)`);
console.log('city: all checks pass');
