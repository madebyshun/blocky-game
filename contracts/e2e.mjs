// End to end: the ledger hands out Blockies, /api/claim signs them, the wallet claims them on the
// contract (in-memory EVM), sellers' claimed Blockies get burned by the next claims, and /api/nft
// serves the metadata and portraits. Chain reads go to the in-memory EVM; $BLOCKY balances are faked.
import assert from 'node:assert/strict';
import { verifyTypedData, getAddress } from 'viem';
import { chain, account } from './evm.mjs';

const evm = await chain();
const [owner, signer, alice, bob, dave] = [11, 12, 13, 14, 18].map(account);
const C = await evm.deploy(owner, [owner.address, signer.address, owner.address, 500, 10000n, 'https://basecity.test/api/nft/', '']);
for (const k of Object.keys(process.env)) if (/^(KV_|UPSTASH_)/.test(k)) delete process.env[k];
Object.assign(process.env, { NFT_CONTRACT: C, CLAIM_SIGNER_KEY: `0x${'12'.padStart(64, '0')}`, SITE_URL: 'https://basecity.test' });

const { client, saveLedger, loadLedger, LEDGER } = await import('../api/_store.js');
const { newLedger, applyTrade } = await import('../src/ledger.js');
const { claimTypedData } = await import('../api/_sig.js');
const claimApi = (await import('../api/claim.js')).default;
const nftApi = (await import('../api/nft/[id].js')).default;

// chain reads: the contract from the EVM, $BLOCKY balances from this table (18 decimals)
const balances = {};
const contractRead = async ({ address, functionName, args = [] }) => {
  if (address.toLowerCase() === C.toLowerCase()) { const r = await evm.read(functionName, args); if (r?.error) throw new Error(r.error); return r; }
  if (functionName === 'decimals') return 18;
  if (functionName === 'balanceOf') return BigInt(Math.round((balances[args[0].toLowerCase()] ?? 0) * 1e6)) * 10n ** 12n;
  throw new Error(`unexpected read ${functionName}`);
};
client.readContract = contractRead;
client.multicall = async ({ contracts }) => Promise.all(contracts.map((c) => contractRead(c).then((result) => ({ status: 'success', result }), (error) => ({ status: 'failure', error }))));

const call = (handler, { method = 'GET', url, query = {}, body } = {}) => new Promise((resolve) => {
  const headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v), status: (code) => ({ json: (b) => resolve({ code, body: b, headers }), send: (b) => resolve({ code, body: b, headers }) }) };
  handler({ method, url, query, body, headers: { host: 'localhost' } }, res).catch((e) => resolve({ code: 'throw', body: e }));
});
const get = (address) => call(claimApi, { url: `/api/claim?address=${address}`, query: { address } });
const post = (address) => call(claimApi, { method: 'POST', url: '/api/claim', body: { address } });
const submit = async (who, r) => evm.send(who, 'claim', [r.ids.map(BigInt), r.evict.map(BigInt), BigInt(r.deadline), r.signature]);

// the ledger: alice buys $50 (10 Blockies), bob $25 (5)
evm.now = Math.floor(Date.now() / 1000);
const { ledger: L } = await loadLedger();
const t0 = Date.now() - 3600e3;
applyTrade(L, { who: alice.address, kind: 'buy', usd: 50, tokens: 1000, at: t0, tx: '0x01', block: '0xb1' }, LEDGER);
applyTrade(L, { who: bob.address, kind: 'buy', usd: 25, tokens: 500, at: t0 + 1000, tx: '0x02', block: '0xb2' }, LEDGER);
Object.assign(balances, { [alice.address.toLowerCase()]: 1000, [bob.address.toLowerCase()]: 500 });
await saveLedger(L);

let r = await get(alice.address.toLowerCase());
assert.equal(r.code, 200);
assert.equal(r.body.open, true);
assert.equal(r.body.address, getAddress(alice.address));
assert.deepEqual(r.body.blockies.map((b) => [b.n, b.claimed]), Array.from({ length: 10 }, (_, i) => [i + 1, false]));
assert.equal(typeof r.body.blockies[0].seed, 'number');

// alice claims: the signature is the ledger's, the contract mints her 10 Blockies
r = await post(alice.address);
assert.equal(r.code, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.ids, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.ok(await verifyTypedData({ address: signer.address, ...claimTypedData({ chainId: 8453, contract: C, to: alice.address, ids: r.body.ids, evict: r.body.evict, deadline: r.body.deadline }), signature: r.body.signature }));
assert.equal((await submit(bob, r.body)).error, 'BadSignature'); // only alice can send it
assert.equal((await submit(alice, r.body)).error, undefined);
assert.equal(await evm.read('balanceOf', [alice.address]), 10n);
r = await get(alice.address);
assert.ok(r.body.blockies.every((b) => b.claimed));
assert.equal((await post(alice.address)).code, 409);

// alice sells half: #6-#10 leave the city; bob's claim burns them on the way
L.recent = [];
applyTrade(L, { who: alice.address, kind: 'sell', usd: 30, tokens: 500, at: Date.now() - 1000, tx: '0x03' }, LEDGER);
balances[alice.address.toLowerCase()] = 500;
await saveLedger(L);
r = await get(alice.address);
assert.deepEqual(r.body.blockies.map((b) => b.n), [1, 2, 3, 4, 5]);
assert.deepEqual(r.body.left.map((b) => b.n), [6, 7, 8, 9, 10]);
r = await post(bob.address);
assert.equal(r.code, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.ids, [11, 12, 13, 14, 15]);
assert.deepEqual([...r.body.evict].sort((a, b) => a - b), [6, 7, 8, 9, 10]);
assert.equal((await submit(bob, r.body)).error, undefined);
assert.equal(await evm.read('balanceOf', [alice.address]), 5n);
assert.equal(await evm.read('balanceOf', [bob.address]), 5n);
assert.equal(await evm.read('totalSupply'), 10n);
assert.equal(await evm.read('evicted', [8n]), true);

// dave buys, then moves his $BLOCKY away before the ledger's next balance check: no claim
applyTrade(L, { who: dave.address, kind: 'buy', usd: 25, tokens: 500, at: Date.now(), tx: '0x04' }, LEDGER);
await saveLedger(L);
balances[dave.address.toLowerCase()] = 0;
r = await post(dave.address);
assert.equal(r.code, 409);
balances[dave.address.toLowerCase()] = 250; // half: he may claim the oldest half
r = await post(dave.address);
assert.equal(r.code, 200);
assert.deepEqual(r.body.ids, [16, 17]);
assert.equal((await post('0x1234')).code, 400);
assert.equal((await post(account(40).address)).code, 409); // no Blockies

// the NFT metadata and portraits
r = await call(nftApi, { url: '/api/nft/3', query: { id: '3' } });
assert.equal(r.code, 200);
assert.match(r.body.name, / #3$/);
assert.equal(r.body.image, `https://basecity.test/api/nft/3.svg?v=${L.blockies[2][3]}`);
const attr = Object.fromEntries(r.body.attributes.map((a) => [a.trait_type, a.value]));
assert.equal(attr.Status, 'In the city');
assert.ok(attr['Blocks placed'] > 0);
assert.ok(['Common', 'Uncommon', 'Rare', 'Legendary'].includes(attr.Rarity));
r = await call(nftApi, { url: '/api/nft/8', query: { id: '8' } });
assert.equal(Object.fromEntries(r.body.attributes.map((a) => [a.trait_type, a.value])).Status, 'Left the city');
r = await call(nftApi, { url: `/api/nft/3.svg?v=${L.blockies[2][3]}`, query: { id: '3.svg' } });
assert.equal(r.code, 200);
assert.match(r.body, /^<svg/);
assert.match(r.headers['cache-control'], /immutable/);
r = await call(nftApi, { url: '/api/nft/3.svg?v=1', query: { id: '3.svg' } });
assert.doesNotMatch(r.headers['cache-control'], /immutable/);
assert.equal((await call(nftApi, { url: '/api/nft/999', query: { id: '999' } })).code, 404);
assert.equal((await call(nftApi, { url: '/api/nft/abc', query: { id: 'abc' } })).code, 404);
r = await call(nftApi, { url: '/api/nft/collection', query: { id: 'collection' } });
assert.equal(r.body.name, 'BaseCity Blockies');
assert.equal(r.body.seller_fee_basis_points, 500);
assert.equal(r.body.fee_recipient, '0x699eacc348852de429ac3e9a28238e5906ec75d6');
r = await call(nftApi, { url: '/api/nft/collection.svg', query: { id: 'collection.svg' } });
assert.match(r.body, /^<svg/);
console.log('claim + nft API end to end: all checks pass');
