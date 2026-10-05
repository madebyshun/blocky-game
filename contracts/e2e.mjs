// End to end: the ledger hands out Blockies, newcomers become citizens after CITIZEN_DAYS, /api/claim
// signs citizens only, the wallet claims them on the contract (in-memory EVM, 20 at most) and they
// trade at once; /api/nft serves the metadata and portraits. Chain reads go to the in-memory EVM;
// $BLOCKY balances are faked.
import assert from 'node:assert/strict';
import { verifyTypedData, getAddress } from 'viem';
import { chain, account } from './evm.mjs';

const DAY = 86400e3;
const evm = await chain();
const [owner, signer, alice, bob, carol, dave] = [11, 12, 13, 14, 15, 18].map(account);
const C = await evm.deploy(owner, [owner.address, signer.address, owner.address, 500, 20n, 'https://basecity.test/api/nft/', '']);
for (const k of Object.keys(process.env)) if (/^(KV_|UPSTASH_)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  NFT_CONTRACT: C, CLAIM_SIGNER_KEY: `0x${'12'.padStart(64, '0')}`, SITE_URL: 'https://basecity.test',
  USD_PER_BLOCKY: '5', CITIZEN_DAYS: '14', TEAM_RESERVE_COUNT: '0', LAUNCH_TIME_MS: String(Date.now() - 30 * DAY),
});

const { client, saveLedger, loadLedger, LEDGER } = await import('../api/_store.js');
const { applyTrade, citizenAt } = await import('../src/ledger.js');
const { claimTypedData } = await import('../api/_sig.js');
const claimApi = (await import('../api/claim.js')).default;
const nftApi = (await import('../api/nft/[id].js')).default;

// chain reads: the contract from the EVM, $BLOCKY balances from this table (18 decimals)
const balances = {};
let fakeSupply = null; // pretend this many Blockies exist (the collection's room)
const contractRead = async ({ address, functionName, args = [] }) => {
  if (address.toLowerCase() === C.toLowerCase()) {
    if (functionName === 'totalSupply' && fakeSupply != null) return fakeSupply;
    const r = await evm.read(functionName, args);
    if (r?.error) throw new Error(r.error);
    return r;
  }
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
const info = () => call(claimApi, { url: '/api/claim' });
const post = (address) => call(claimApi, { method: 'POST', url: '/api/claim', body: { address } });
const submit = async (who, r) => evm.send(who, 'claim', [r.ids.map(BigInt), BigInt(r.deadline), r.signature]);
const trade = (who, kind, usd, tokens, ago, tx) => applyTrade(L, { who: who.address, kind, usd, tokens, at: Date.now() - ago, tx }, LEDGER);

// the ledger: alice bought $50 (10 Blockies) 20 days ago, bob $25 (5) an hour ago, carol $10 (2) 13 days ago
evm.now = Math.floor(Date.now() / 1000);
const { ledger: L } = await loadLedger();
trade(alice, 'buy', 50, 1000, 20 * DAY, '0x01');
trade(carol, 'buy', 10, 200, 13 * DAY, '0x02');
trade(bob, 'buy', 25, 500, 3600e3, '0x03');
Object.assign(balances, { [alice.address.toLowerCase()]: 1000, [bob.address.toLowerCase()]: 500, [carol.address.toLowerCase()]: 200 });
await saveLedger(L);

let r = await info();
assert.deepEqual([r.body.open, r.body.citizenDays], [true, 14]);
r = await get(alice.address.toLowerCase());
assert.equal(r.code, 200);
assert.equal(r.body.address, getAddress(alice.address));
assert.deepEqual(r.body.blockies.map((b) => [b.n, b.claimed]), Array.from({ length: 10 }, (_, i) => [i + 1, false]));
assert.ok(r.body.blockies.every((b) => b.citizenAt <= Date.now() && b.citizenAt === citizenAt(L, b.n, LEDGER)));
assert.equal(typeof r.body.blockies[0].seed, 'number');

// alice's Blockies are citizens: the signature is the ledger's, the contract mints all 10
r = await post(alice.address);
assert.equal(r.code, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.ids, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.ok(await verifyTypedData({ address: signer.address, ...claimTypedData({ chainId: 8453, contract: C, to: alice.address, ids: r.body.ids, deadline: r.body.deadline }), signature: r.body.signature }));
assert.equal((await submit(bob, r.body)).error, 'BadSignature'); // only alice can send it
assert.equal((await submit(alice, r.body)).error, undefined);
assert.equal(await evm.read('balanceOf', [alice.address]), 10n);
assert.ok((await get(alice.address)).body.blockies.every((b) => b.claimed));
assert.equal((await post(alice.address)).code, 409);

// newcomers can't be claimed yet: the API says when they become citizens
r = await post(bob.address);
assert.equal(r.code, 409);
assert.equal(r.body.citizenAt, citizenAt(L, 13, LEDGER));
assert.ok(Math.abs(r.body.citizenAt - (Date.now() + 14 * DAY - 3600e3)) < 5000); // bought an hour ago
r = await post(carol.address);
assert.equal(r.code, 409);
assert.ok(r.body.citizenAt - Date.now() < DAY + 5000, 'carol: a day to go');

// selling: bob's newcomers leave (newest first); alice's citizens stay, and trade at once
trade(bob, 'sell', 12, 200, 60e3, '0x04');
balances[bob.address.toLowerCase()] = 300;
trade(alice, 'sell', 50, 1000, 30e3, '0x05');
balances[alice.address.toLowerCase()] = 0;
await saveLedger(L);
r = await get(bob.address);
assert.deepEqual(r.body.blockies.map((b) => b.n), [13, 14, 15]);
assert.deepEqual(r.body.left.map((b) => b.n), [16, 17]);
r = await get(alice.address);
assert.equal(r.body.blockies.length, 10);
assert.equal((await evm.send(alice, 'transferFrom', [alice.address, dave.address, 1n])).error, undefined);
assert.equal(await evm.read('ownerOf', [1n]), dave.address);

// a full collection: no signature that would mint nothing; a nearly full one signs what fits
trade(dave, 'buy', 15, 300, 15 * DAY, '0x06'); // 3 citizens: #18-#20
await saveLedger(L);
fakeSupply = 20n;
r = await post(dave.address);
assert.equal(r.code, 409);
assert.match(r.body.error, /complete/);
fakeSupply = 19n;
r = await post(dave.address);
assert.deepEqual([r.body.ids, r.body.more], [[18], 2]);
fakeSupply = null;
r = await post(dave.address);
assert.deepEqual(r.body.ids, [18, 19, 20]);
assert.equal((await submit(dave, r.body)).error, undefined);
assert.equal(await evm.read('totalSupply'), 13n);
assert.equal((await post('0x1234')).code, 400);
assert.equal((await post(account(40).address)).code, 409); // no Blockies

// on Vercel without KV (an in-memory ledger per instance), nothing gets signed
process.env.VERCEL_ENV = 'production';
assert.equal((await info()).body.open, false);
assert.equal((await post(dave.address)).code, 503);
delete process.env.VERCEL_ENV;

// the NFT metadata and portraits
const attrs = (r) => Object.fromEntries(r.body.attributes.map((a) => [a.trait_type, a.value]));
r = await call(nftApi, { url: '/api/nft/3', query: { id: '3' } });
assert.equal(r.code, 200);
assert.match(r.body.name, / #3$/);
assert.equal(r.body.image, `https://basecity.test/api/nft/3.svg?v=${L.blockies[2][3]}`);
const attr = attrs(r);
assert.equal(attr.Status, 'Citizen');
assert.equal(attr['Citizen since'], Math.floor(citizenAt(L, 3, LEDGER) / 1000));
assert.ok(attr['Blocks placed'] > 0);
assert.ok(['Common', 'Uncommon', 'Rare', 'Legendary'].includes(attr.Rarity));
assert.equal(attrs(await call(nftApi, { url: '/api/nft/14', query: { id: '14' } })).Status, 'Newcomer');
assert.equal(attrs(await call(nftApi, { url: '/api/nft/16', query: { id: '16' } })).Status, 'Left the city');
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
assert.match(r.body.description, /after 14 days in the city/);
assert.equal(r.body.seller_fee_basis_points, 500);
assert.equal(r.body.fee_recipient, '0x8eBA37eF94E6b831Fe8bf6a62e79D0DC6FD8C34D');
r = await call(nftApi, { url: '/api/nft/collection.svg', query: { id: 'collection.svg' } });
assert.match(r.body, /^<svg/);
console.log('claim + nft API end to end: all checks pass');
