// The chip economy: silicon in, chips out at the grid's pace, chips to tech buildings in order.
import assert from 'node:assert/strict';
import { chipEconomy } from '../src/chips.js';

const H = 3600000, from = '2026-01-01T00:00:00Z', T0 = Date.parse(from);
const cfg = { from, siliconPerBlocky: 12, dredgePerHour: 6, fabPerHour: 40, powerBase: 12, powerPerPlant: 7, cost: { gpufarm: 120, aistartup: 60 }, tiers: [[0, 'A'], [100, 'B'], [1000, 'C']] };
const run = (o) => chipEconomy({ done: [], standing: new Set(), deliveries: [], cfg, ...o });

// before `from`, or without a Fab: nothing made
assert.equal(run({ now: T0 - H }).made, 0);
assert.equal(run({ now: T0 + 10 * H }).made, 0);
assert.equal(run({ now: T0 + 10 * H }).limit, 'nofab');

// a Fab and no silicon but the dredge: it makes what the dredge brings (6/h)
let e = run({ now: T0 + 10 * H, fabAt: T0 });
assert.ok(Math.abs(e.made - 60) < 1e-6, `dredge only: ${e.made}`);
assert.equal(e.limit, 'silicon');

// plenty of silicon: the grid's power is the limit (12 + 7 per plant), the Fab's 40/h at most
const crates = Array.from({ length: 100 }, () => T0); // 1,200 silicon at the start
e = run({ now: T0 + 10 * H, fabAt: T0, deliveries: crates });
assert.ok(Math.abs(e.made - 120) < 1e-6, `power-limited: ${e.made}`); // 12/h
assert.equal(e.limit, 'power');
const plants = Array.from({ length: 5 }, (_, i) => ({ k: 900 + i, type: 'windmill', at: T0 - H }));
e = run({ now: T0 + 10 * H, fabAt: T0, deliveries: crates, done: plants });
assert.ok(Math.abs(e.made - 400) < 1e-6, `full speed: ${e.made}`); // min(40, 12 + 35)
assert.equal(e.limit, 'full');

// silicon runs out mid-way: full pace until then, the dredge after
e = run({ now: T0 + 10 * H, fabAt: T0, deliveries: [T0, T0], done: plants }); // 24 silicon
// 24 silicon drains at 34/h net: 24/34 h at 40/h, then 6/h
const empty = 24 / 34;
assert.ok(Math.abs(e.made - (40 * empty + 6 * (10 - empty))) < 1e-6, `runs out: ${e.made}`);

// chips go to tech buildings finished since `from`, in order; one short holds the line
const done = [...plants, { k: 1, type: 'gpufarm', at: T0 + H }, { k: 2, type: 'aistartup', at: T0 + 2 * H }, { k: 3, type: 'gpufarm', at: T0 + 3 * H }, { k: 4, type: 'gpufarm', at: T0 - H }];
e = run({ now: T0 + 10 * H, fabAt: T0, deliveries: crates, done, standing: new Set([1, 2, 3, 4]) });
assert.deepEqual([...e.online], [1, 2, 3]); // 400 made: 120 + 60 + 120 fit; #4 came before `from`: always on
assert.equal(e.stock, 100);
assert.equal(e.tier[1], "B");
// not enough: the second GPU farm waits, and holds the line
e = run({ now: T0 + 5 * H, fabAt: T0, deliveries: crates, done, standing: new Set([1, 2, 3]) }); // 200 made
assert.deepEqual([...e.online], [1, 2]);
assert.deepEqual(e.waiting.map((p) => p.k), [3]);
// a building that is gone frees its place
e = run({ now: T0 + 5 * H, fabAt: T0, deliveries: crates, done, standing: new Set([2, 3]) });
assert.deepEqual([...e.online], [2, 3]);
console.log("chips: all checks pass");
