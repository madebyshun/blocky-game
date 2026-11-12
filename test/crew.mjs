// Street Crew (api/_crew.js): who joins, who stays a citizen, who leaves, and that no dollars leak out.
import assert from 'node:assert/strict';
import { crewEntry, crewView, dueForCheck, CITIZEN_MS, RECHECK_MS } from '../api/_crew.js';

const a = '0x1234567890abcdef1234567890abcdef12345678';
const H = (usd, t = 'NVDA') => [{ ticker: t, usd }];
assert.equal(crewEntry(null, { address: a, holdings: H(9.99) }, 1), null); // under $10: not on the crew
const e = crewEntry(null, { address: a, name: 'shun.base.eth', holdings: [...H(37), ...H(20, 'TSLA'), ...H(0, 'AAPL')] }, 1000);
assert.deepEqual([e.blockies, e.since, e.tickers], [5, 1000, ['NVDA', 'TSLA']]);
assert.equal(crewEntry(null, { address: a, holdings: H(25) }, 0).blockies, 2);
const later = crewEntry(e, { address: a, holdings: H(12) }, 5000); // still holding: keeps its date, name
assert.deepEqual([later.since, later.blockies, later.name], [1000, 1, 'shun.base.eth']);
assert.equal(crewEntry(e, { address: a, holdings: H(3) }, 5000), null); // sold under $10: leaves

const v = crewView([e], 1000 + CITIZEN_MS);
assert.equal(v[0].citizen, true);
assert.equal(crewView([e], 1000 + CITIZEN_MS - 1)[0].citizen, false);
assert.ok(!JSON.stringify(v).includes('usd'));
assert.equal(crewView([{ ...e, name: null }])[0].label, '0x1234…5678');

const old = { ...e, a: '0xb', checked: 0 }, fresh = { ...e, checked: RECHECK_MS };
assert.deepEqual(dueForCheck([fresh, old], RECHECK_MS).map((x) => x.a), ['0xb']);
console.log('crew ok');
