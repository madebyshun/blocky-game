import assert from 'node:assert/strict';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { verifyTypedData } from 'viem';
process.env.NFT_ADDRESS ||= '0x' + 'a'.repeat(40);
const { linkTypedData, cleanLinks, pairsFrom, onchainPairs } = await import('../src/agent-link.js');
const { verifyAndStore } = await import('../api/agent-link.js');

const acct = privateKeyToAccount(generatePrivateKey()), me = acct.address.toLowerCase();
const links = [{ blocky: '718', agentId: '1205445' }, { blocky: '717', agentId: '1205445' }];
const issuedAt = new Date().toISOString();
const t = linkTypedData(acct.address, links, issuedAt);
const signature = await acct.signTypedData({ domain: t.domain, types: t.types, primaryType: t.primaryType, message: t.message });
const store = new Map();
const deps = { verify: (a) => verifyTypedData(a), read: async (b) => store.get(b) || null, write: async (es) => es.forEach(([b, e]) => store.set(b, e)) };
const nft = (await import('../api/_store.js')).NFT;
if (nft) {
  const r = await verifyAndStore({ owner: acct.address, links, issuedAt, signature }, { ...deps, ownersOf: async (c) => c.map(() => me) });
  assert.equal(r.linked.length, 2); assert.equal(store.get('718').agentId, '1205445');
  await assert.rejects(verifyAndStore({ owner: acct.address, links: [...links, { blocky: '1', agentId: '2' }], issuedAt, signature }, { ...deps, ownersOf: async (c) => c.map(() => me) }), /Signature/);
  await assert.rejects(verifyAndStore({ owner: acct.address, links, issuedAt, signature }, { ...deps, ownersOf: async (c) => c.map((_, i) => (i === 1 ? '0xother' : me)) }), /does not own/);
  await assert.rejects(verifyAndStore({ owner: acct.address, links, issuedAt: '2020-01-01T00:00:00Z', signature }, deps), /15 minutes/);
} else console.log('(NFT unset: store checks skipped)');
assert.throws(() => cleanLinks([{ blocky: '1', agentId: '2' }, { blocky: '1', agentId: '3' }]), /twice/);
{ const p = pairsFrom([1, 2, 3], { 3: '9' }, '5'); assert.deepEqual(onchainPairs(p).map((x) => x.blocky), ['3']); }
console.log('agent-link ok');
