// The live ledger API (api/colony.js, buys mode) against a fake trade feed, Base and KV: a trade whose
// receipt can't be read waits (with every later one) instead of going to the bundler, one instance at
// a time updates the ledger, and the ledger freezes when the NFT contract does (with a last balance
// check at the freeze block) and learns who opened the market.
// Run: npm test
import assert from 'node:assert/strict';

for (const k of Object.keys(process.env)) if (/^(KV_|UPSTASH_)/.test(k)) delete process.env[k];
Object.assign(process.env, {
  KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 'test', KV_KEY: 'test',
  NFT_CONTRACT: '0x00000000000000000000000000000000000000c1', USD_PER_BLOCKY: '10', TEAM_RESERVE_COUNT: '0',
  CACHE_MS: '0', LAUNCH_TIME_MS: String(Date.now() - 86400e3),
});
const TOKEN = '0xe72a0c42b584a3e7a4503a82d1337deb52ade885';
const { client } = await import('../api/_store.js');
const colony = (await import('../api/colony.js')).default;

// KV: a tiny Redis (GET, SET with NX, DEL); the trade feed: `feed`; everything else: not found
const redis = new Map();
let feed = [];
globalThis.fetch = async (url, opts) => {
  if (String(url) === 'https://kv.test') {
    const [cmd, key, value, ...rest] = JSON.parse(opts.body);
    let result = null;
    if (cmd === 'GET') result = redis.get(key) ?? null;
    else if (cmd === 'SET' && !(rest.includes('NX') && redis.has(key))) { redis.set(key, value); result = 'OK'; }
    else if (cmd === 'DEL') result = Number(redis.delete(key));
    return { ok: true, json: async () => ({ result }) };
  }
  if (String(url).endsWith('/trades')) return { ok: true, json: async () => ({ data: feed }) };
  return { ok: false, status: 404, json: async () => ({}) };
};

// Base: receipts move the $BLOCKY to the real wallet (`real`) on a buy, from it on a sell; `failing`
// receipts can't be read
const failing = new Set();
const nft = { frozenAt: 0n, frozenBlock: 0n, unlockAt: 0n, unlocked: false };
const balances = {}, atFreeze = {}; // $BLOCKY held now and at the freeze block (not listed: plenty)
const balanceReads = [];
const topic = (a) => `0x${a.slice(2).padStart(64, '0')}`;
client.getTransactionReceipt = async ({ hash }) => {
  if (failing.has(hash)) throw new Error('RPC down');
  const t = feed.find((d) => d.attributes.tx_hash === hash).attributes;
  const transfer = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', pool = topic('0x000000000000000000000000000000000000b001');
  const [from, to] = t.to_token_address === TOKEN ? [pool, topic(t.real)] : [topic(t.real), pool];
  return { blockHash: `0xb${hash.slice(3)}`, logs: [{ address: TOKEN, topics: [transfer, from, to], data: '0x3635c9adc5dea00000' }] };
};
client.readContract = async ({ functionName }) => {
  if (functionName === 'decimals') return 18;
  throw new Error(`unexpected read ${functionName}`);
};
client.multicall = async ({ contracts, blockNumber }) => contracts.map(({ functionName, args }) => {
  if (functionName in nft) return { status: 'success', result: nft[functionName] };
  if (functionName !== 'balanceOf') return { status: 'failure', error: new Error('not here') };
  balanceReads.push(blockNumber);
  const held = (blockNumber ? atFreeze : balances)[args[0]] ?? 1e6;
  return { status: 'success', result: BigInt(held) * 10n ** 18n };
});
client.getBlock = async () => ({ hash: '0xhead' });
const OPENER = '0x00000000000000000000000000000000000000e1';
client.getContractEvents = async ({ eventName }) => (eventName === 'Unlocked' ? [{ args: { by: OPENER } }] : []);

const BUNDLER = '0x000000000000000000000000000000000000beef';
let n = 0;
function trade(real, usd, ago, kind = 'buy') {
  const tx = `0x${String(++n).padStart(4, '0')}`;
  feed.push({ id: `t${n}`, attributes: {
    tx_hash: tx, tx_from_address: BUNDLER, real, to_token_address: kind === 'buy' ? TOKEN : '0x01', from_token_address: kind === 'buy' ? '0x01' : TOKEN,
    volume_in_usd: String(usd), to_token_amount: '1000', from_token_amount: '1000', block_timestamp: new Date(Date.now() - ago).toISOString(),
  } });
  return tx;
}
const get = () => new Promise((wait) => setTimeout(wait, 5)).then(() => new Promise((resolve) => {
  colony({ method: 'GET', url: '/api/colony', query: {}, headers: {} }, { setHeader() {}, status: (code) => ({ json: (body) => resolve({ code, body }) }) });
}));
const owners = (r) => r.body.blockies.map((b) => b[0]);

const A = '0x00000000000000000000000000000000000000a1', B = '0x00000000000000000000000000000000000000b1';
trade(A, 20, 120e3);
const late = trade(B, 30, 60e3);
trade(A, 10, 30e3);
failing.add(late);
let r = await get();
assert.equal(r.code, 200, JSON.stringify(r.body));
assert.deepEqual(owners(r), [A, A], 'only the trades before the unreadable receipt count');
failing.clear();
r = await get();
assert.deepEqual(owners(r), [A, A, B, B, B, A], 'then the rest, in order, each with its real wallet');

// another instance is updating the ledger: this one serves the saved one
redis.set('test:ledger:lock', '1');
trade(A, 10, 1000);
r = await get();
assert.equal(r.body.issued, 6);
redis.delete('test:ledger:lock');
r = await get();
assert.equal(r.body.issued, 7);
assert.equal(redis.has('test:ledger:lock'), false, 'the lock is released');

// a receipt still unreadable after 10 minutes: the trade counts as its sender's
failing.add(trade(B, 10, 11 * 60e3));
r = await get();
assert.equal(owners(r).at(-1), BUNDLER);
failing.clear();

// the city freezes (the claim of the last Blocky, 3 minutes ago): trades before it still count, the
// ones after it don't, and the last balance check reads the freeze block, between the two
assert.deepEqual([r.body.frozenAt, r.body.unlockAt, r.body.unlocked], [null, null, false]);
trade(A, 5, 1000, 'sell');
r = await get();
assert.equal(r.body.departed, 2, 'before the freeze a sell still costs Blockies');
const frozenAt = Math.floor(Date.now() / 1000) - 180;
Object.assign(nft, { frozenAt: BigInt(frozenAt), frozenBlock: 123n, unlockAt: BigInt(frozenAt + 6 * 3600) });
trade(A, 5, 190e3, 'sell'); // 10 s before the freeze: one more of A's leaves
trade(A, 5, 170e3, 'sell'); // 10 s after: free
atFreeze[B] = 0; // B moved its $BLOCKY away before the freeze: its 3 Blockies leave
balanceReads.length = 0;
r = await get();
assert.deepEqual([r.body.frozenAt, r.body.unlockAt, r.body.unlocked], [frozenAt * 1000, (frozenAt + 6 * 3600) * 1000, false]);
assert.ok(balanceReads.length && balanceReads.every((b) => b === 123n), 'the last balance check reads the freeze block');
assert.equal(r.body.departed, 6);
assert.deepEqual(r.body.departures.slice(-4).map((d) => owners({ body: { blockies: [r.body.blockies[d[0] - 1]] } })[0]), [A, B, B, B]);
const saved = JSON.parse(redis.get('test:ledger:v5'));
assert.ok(saved.finalCheck && saved.syncedTo >= frozenAt * 1000, 'the ledger is synced past the freeze: the market can open');
trade(A, 5, 1000, 'sell');
balances[A] = 0;
r = await get();
assert.equal(r.body.departed, 6, 'a sell after the freeze kept its Blockies');

// someone opens the market: the ledger learns who, and a sell from before the freeze reported late is free
Object.assign(nft, { unlockAt: BigInt(Math.floor(Date.now() / 1000)), unlocked: true });
trade(BUNDLER, 10, 200e3, 'sell'); // its one Blocky would leave
r = await get();
assert.deepEqual([r.body.unlocked, r.body.openedBy, r.body.departed], [true, OPENER, 6]);
console.log('colony: waits for receipts, one writer, freezes with the contract: all checks pass');
