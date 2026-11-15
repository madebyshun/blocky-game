// IPO Day: a stock Coinbase lists after BaseCity's first snapshot is an IPO; the first run seeds silently.
import assert from 'node:assert/strict';
import { stampFirstSeen, isSeeding, iposOf, isLive, IPO_DAYS } from '../src/ipoday.js';

const list = [{ ticker: 'NVDA' }, { ticker: 'TSLA' }];

// the first run: every ticker is stamped, nothing is announced (no 300 cranes on launch day)
const seed = stampFirstSeen(list, {}, 1000, { seeding: isSeeding({}) });
assert.equal(seed.fresh.length, 0);
assert.deepEqual(seed.known, { NVDA: 1000, TSLA: 1000 });

// later, one new listing: that one is fresh
const next = stampFirstSeen([...list, { ticker: 'NEWCO' }], seed.known, 5000, { seeding: isSeeding(seed.known) });
assert.deepEqual(next.fresh, ['NEWCO']);
assert.equal(next.known.NEWCO, 5000);
assert.equal(next.known.NVDA, 1000); // first sightings are never rewritten

// newest first
assert.deepEqual(iposOf([...list, { ticker: 'NEWCO' }], next.known).map((s) => s.ticker), ['NEWCO', 'NVDA', 'TSLA']);

// live for a day, then not
const ipo = { firstSeenAt: 5000 };
assert.equal(isLive(ipo, 5000 + 1000), true);
assert.equal(isLive(ipo, 5000 + IPO_DAYS * 864e5 + 1), false);
assert.equal(isLive({ firstSeenAt: null }, 5000), false);

// a ticker missing from the list keeps its stamp: a paused stock isn't a new IPO when it returns
const back = stampFirstSeen([{ ticker: 'NVDA' }], next.known, 9000);
assert.deepEqual(back.fresh, []);
assert.equal(back.known.NEWCO, 5000);

console.log('ipoday: all checks pass');
