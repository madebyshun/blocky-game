// Basenames (api/_names.js): reverse nodes, which names we show, and the two-way check, against a
// stand-in for Base. Run: npm test
import assert from 'node:assert/strict';
import { namehash, zeroAddress } from 'viem';
import { reverseNode, cleanName, readNames, addressOf } from '../api/_names.js';
import { CONFIG } from '../src/config.js';

const { reverseRegistrar: L2RR, legacyResolver: LEGACY, registry: REGISTRY } = CONFIG.basenames;
const NEW_RESOLVER = '0x426fa03fb86e510d0dd9f70335cf102a98b10875';
const A = '0x1111111111111111111111111111111111111111', B = '0x2222222222222222222222222222222222222222';
const C = '0x3333333333333333333333333333333333333333', D = '0x4444444444444444444444444444444444444444';
const E = '0x5555555555555555555555555555555555555555';

// the legacy reverse node is the namehash of "<address hex>.80002105.reverse"
for (const a of [A, '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045']) assert.equal(reverseNode(a), namehash(`${a.slice(2).toLowerCase()}.80002105.reverse`));
assert.equal(namehash('80002105.reverse'), '0x08d9b0993eb8c4da57c37a4b84a6e384c2623114ff4e9370ed51c9b8935109ba');

// only normalized Basenames are shown
assert.equal(cleanName('jesse.base.eth'), 'jesse.base.eth');
assert.equal(cleanName('🟦blocky.base.eth'), '🟦blocky.base.eth');
for (const bad of ['Jesse.base.eth', 'jesse.eth', '<img src=x>.base.eth', 'a"b.base.eth', '', null, 42, `${'x'.repeat(80)}.base.eth`]) assert.equal(cleanName(bad), null, `showed ${bad}`);

// A: a new name (reverse registrar, new resolver, Base address record)
// B: an old name (legacy reverse record and resolver, plain address record)
// C: claims A's name (spoof); D: none; E: a new primary name plus a stale old one: the new one wins
const reverse = { [A]: 'alice.base.eth', [C]: 'alice.base.eth', [E]: 'erin.base.eth' };
const legacy = { [reverseNode(B)]: 'bob.base.eth', [reverseNode(E)]: 'old-erin.base.eth' };
const resolvers = { [namehash('alice.base.eth')]: NEW_RESOLVER, [namehash('erin.base.eth')]: NEW_RESOLVER, [namehash('bob.base.eth')]: LEGACY, [namehash('old-erin.base.eth')]: LEGACY };
const byCoin = { [namehash('alice.base.eth')]: A, [namehash('erin.base.eth')]: E };
const plain = { [namehash('bob.base.eth')]: B, [namehash('old-erin.base.eth')]: E };
let calls = 0;
const answer = ({ address, functionName, args }) => {
  const a = address.toLowerCase(), [x, coin] = args;
  if (functionName === 'nameForAddr') { assert.equal(a, L2RR.toLowerCase()); return reverse[x] ?? ''; }
  if (functionName === 'name') { assert.equal(a, LEGACY.toLowerCase()); return legacy[x] ?? ''; }
  if (functionName === 'resolver') { assert.equal(a, REGISTRY.toLowerCase()); return resolvers[x] ?? zeroAddress; }
  assert.notEqual(a, zeroAddress, 'asked a missing resolver');
  if (coin !== undefined) { assert.equal(coin, 0x80002105n); return a === NEW_RESOLVER && byCoin[x] ? byCoin[x] : '0x'; }
  return plain[x] ?? zeroAddress;
};
const rpc = {
  async multicall({ contracts }) { calls++; return contracts.map((c) => ({ status: 'success', result: answer(c) })); },
};
const got = await readNames([A, B, C, D, E], rpc);
assert.equal(got.get(A), 'alice.base.eth', 'a name set with the reverse registrar');
assert.equal(got.get(B), 'bob.base.eth', 'a name from before the migration');
assert.equal(got.get(C), null, 'a name that points elsewhere was shown');
assert.equal(got.get(D), null);
assert.equal(got.get(E), 'erin.base.eth', 'the reverse registrar wins over an old record');
assert.equal(calls, 3, 'reverse names, resolvers, address records: one call each');
assert.equal(await addressOf('Alice.base.eth', rpc), A, 'forward lookup normalizes');
assert.equal(await addressOf('bob.base.eth', rpc), B);
assert.equal(await addressOf('nobody.base.eth', rpc), null);
assert.equal(await addressOf('<x>.base.eth', rpc), null);
console.log('names: all checks pass');
