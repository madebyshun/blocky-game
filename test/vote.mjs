// The citizens' vote (src/votes.js, api/vote.js): the signed message, the checks, the count. Run: npm test
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyMessage } from 'viem';
import { CONFIG } from '../src/config.js';

// a round for the test (the config may have none open)
CONFIG.vote = { id: 'test', title: 'Test', question: 'Which?', ends: '2030-01-01T00:00Z', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] };
const { ROUND, voteMessage, count } = await import('../src/votes.js');
const { castVote, heldBy } = await import('../api/vote.js');

const acc = privateKeyToAccount(`0x${'42'.repeat(32)}`);
const before = Date.parse(ROUND.ends) - 3600e3, time = new Date(before).toISOString(), choice = ROUND.choices[0].id;
const message = voteMessage({ choice, address: acc.address, time });
assert.ok(message.includes(`Round: ${ROUND.id}`) && message.includes(acc.address.toLowerCase()));
const signature = await acc.signMessage({ message });
const deps = { verify: verifyMessage, held: async () => [101, 102], now: before + 60e3 };

assert.deepEqual(await castVote({ address: acc.address, choice, time, signature }, deps), { ok: true, ids: [101, 102] });
assert.equal((await castVote({ address: acc.address, choice: ROUND.choices[1].id, time, signature }, deps)).status, 401, 'a signature for another choice');
assert.equal((await castVote({ address: '0x0000000000000000000000000000000000000001', choice, time, signature }, deps)).status, 401, 'another wallet');
assert.equal((await castVote({ address: acc.address, choice: 'nope', time, signature }, deps)).status, 400);
assert.equal((await castVote({ address: acc.address, choice, time, signature }, { ...deps, now: before + 11 * 60e3 })).status, 400, 'too old');
assert.equal((await castVote({ address: acc.address, choice, time, signature }, { ...deps, now: Date.parse(ROUND.ends) + 1 })).status, 409, 'round over');
assert.equal((await castVote({ address: acc.address, choice, time, signature }, { ...deps, held: async () => [] })).status, 409, 'no NFTs');

// one vote per NFT: a vote follows the NFT
const [a, b] = ROUND.choices.map((c) => c.id);
assert.deepEqual(count({ 101: a, 102: a, 103: b, 104: 'gone' }), { tally: { ...Object.fromEntries(ROUND.choices.map((c) => [c.id, 0])), [a]: 2, [b]: 1 }, total: 3, leader: a });
assert.deepEqual(heldBy({ 1: '0xaa', 2: '0xbb', 3: '0xaa' }, '0xAA'), [1, 3]);
console.log('vote: all checks pass');
