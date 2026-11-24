// The write APIs that speak for a wallet: tasks, stock intel, game saves. Every case here is an attack that worked
// before (impersonating a requester, marking a task paid with a made-up hash, unlocking a paid report for free,
// overwriting someone else's save) and must now be refused, plus the honest path that must still work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { verifyMessage, toHex, pad } from 'viem';
import { taskMessage, intelMessage, rpgMessage } from '../src/signed.js';
import { USDC_PRICES } from '../src/shop-prices.js';

const sigauth = await import('../api/_sigauth.js');
sigauth.deps.verify = (a) => verifyMessage(a); // offline: plain ecrecover
const tasks = await import('../api/city-tasks.js');
tasks.deps.retryMs = 1;
const intel = await import('../api/stock-intel.js');
const rpg = await import('../api/rpg-state.js');

const call = async (handler, { method = 'POST', body = {}, query = {}, headers = {} } = {}) => {
  let status = 200, out;
  await handler({ method, body, query, headers, url: `/x?${new URLSearchParams(query)}` }, { setHeader() {}, status(c) { status = c; return this; }, json(j) { out = j; return this; } });
  return { status, body: out };
};
const wallet = () => privateKeyToAccount(generatePrivateKey());
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const transferLog = (token, from, to, value) => ({ address: token, topics: [TRANSFER, pad(from), pad(to)], data: toHex(value, { size: 32 }) });

// ---- signed messages: bound to the action, the wallet and every field ----
const base = { title: 'NVDA NAV premium', brief: 'Ticker: NVDA, how far from NAV', category: 'Research', mode: 'bounty', audience: 'all', expiryHours: 24, rewardToken: 'USDC', rewardAmount: 1, rewardUsdc: 1, requester: '0x' + '1'.repeat(40) };
assert.notEqual(taskMessage('create', base, 'T'), taskMessage('create', { ...base, rewardAmount: 2 }, 'T'));
assert.notEqual(taskMessage('create', base, 'T'), taskMessage('create', { ...base, brief: base.brief + '!' }, 'T'));
assert.notEqual(taskMessage('claim', { taskId: 'a', worker: base.requester }, 'T'), taskMessage('claim', { taskId: 'b', worker: base.requester }, 'T'));
assert.throws(() => taskMessage('approve', {}, 'T'));

// ---- BaseCity Tasks ----
const requester = wallet(), worker = wallet(), mallory = wallet();
const sign = (acct, action, b) => { const issuedAt = new Date().toISOString(); return acct.signMessage({ message: taskMessage(action, { ...b, action }, issuedAt) }).then((signature) => ({ ...b, action, issuedAt, signature })); };
const post = (b) => call(tasks.default, { body: b });
const newTask = { ...base, requester: requester.address };

assert.equal((await post({ action: 'create', ...newTask })).status, 401, 'create without a signature');
let created = await post(await sign(mallory, 'create', newTask));
assert.equal(created.status, 401, "posting a task as someone else's wallet");
const good = await sign(requester, 'create', newTask);
assert.equal((await post({ ...good, title: 'Pay me instead' })).status, 401, 'text changed after signing');
created = await post(good);
assert.equal(created.status, 200, 'the honest create works');
assert.equal((await post(good)).status, 409, 'a signature cannot be replayed');
const id = created.body.task.id;
assert.equal(created.body.task.rewardUsdc, 1);

assert.equal((await post(await sign(mallory, 'cancel', { taskId: id, requester: requester.address }))).status, 401, "cancelling someone else's task");
const sub = await post(await sign(worker, 'submit', { taskId: id, worker: worker.address, blockyName: 'Blocky #1', actorType: 'agent', agentId: '1', summary: 'NVDA trades 0.1% above NAV', proofUrl: '' }));
assert.equal(sub.status, 200, 'the worker submits');
const subId = sub.body.submission.id;

// approving needs the payment itself on chain
const approve = (tx) => post({ action: 'approve', taskId: id, submissionId: subId, requester: requester.address, payTxHash: tx });
const tx1 = '0x' + 'a'.repeat(64);
tasks.deps.getReceipt = async () => null;
assert.equal((await approve(tx1)).status, 409, 'a hash Base has never seen');
tasks.deps.getReceipt = async () => ({ status: 'success', logs: [] });
assert.equal((await approve(tx1)).status, 409, 'a real transaction that paid nothing');
tasks.deps.getReceipt = async () => ({ status: 'success', logs: [transferLog(USDC, mallory.address, worker.address, 5_000_000n)] });
assert.equal((await approve(tx1)).status, 409, 'paid by someone other than the requester');
tasks.deps.getReceipt = async () => ({ status: 'success', logs: [transferLog(USDC, requester.address, worker.address, 500_000n)] });
assert.equal((await approve(tx1)).status, 409, 'paid less than the reward');
tasks.deps.getReceipt = async () => ({ status: 'success', logs: [transferLog('0x' + '9'.repeat(40), requester.address, worker.address, 5_000_000n)] });
assert.equal((await approve(tx1)).status, 409, 'paid in a different token');
tasks.deps.getReceipt = async () => ({ status: 'success', logs: [transferLog(USDC, requester.address, worker.address, 1_000_000n)] });
const paid = await approve(tx1);
assert.equal(paid.status, 200, 'the honest payment is accepted');
assert.equal(paid.body.task.paidVerified, true); assert.equal(paid.body.task.verifiedUsdc, 1);
// the same payment cannot settle a second task
const t2 = (await post(await sign(requester, 'create', { ...newTask, title: 'Second task' }))).body.task;
const s2 = (await post(await sign(worker, 'submit', { taskId: t2.id, worker: worker.address, blockyName: 'B', actorType: 'agent', summary: 'another report here', proofUrl: '' }))).body.submission;
assert.equal((await post({ action: 'approve', taskId: t2.id, submissionId: s2.id, requester: requester.address, payTxHash: tx1 })).status, 409, 'one payment, one task');
const board = await call(tasks.default, { method: 'GET' });
assert.equal(board.body.stats.paid, 1); assert.equal(board.body.stats.totalUsdcPaid, 1);

// ---- Stock Intel ----
const author = wallet(), buyer = wallet();
const pub = { author: author.address, blockyName: 'Analyst', ticker: 'NVDA', stance: 'BULLISH', title: 'Why NVDA', preview: 'A short public preview', fullReport: 'The full paid thesis, long enough.', priceUsdc: 0.5 };
const signIntel = async (acct, b) => { const issuedAt = new Date().toISOString(); return { ...b, issuedAt, signature: await acct.signMessage({ message: intelMessage(b, issuedAt) }) }; };
assert.equal((await call(intel.default, { body: pub })).status, 401, 'publishing unsigned');
assert.equal((await call(intel.default, { body: await signIntel(mallory, pub) })).status, 401, "publishing as someone else");
const published = await call(intel.default, { body: await signIntel(author, pub) });
assert.equal(published.status, 200);
const rid = published.body.item.id;
assert.equal((await call(intel.default, { method: 'GET', query: { id: rid, viewer: author.address } })).status, 402, 'no free read by naming the author');
assert.equal(JSON.stringify((await call(intel.default, { method: 'GET' })).body).includes('full paid thesis'), false, 'the list never carries the report');

const payHeader = async (acct, payTo, value) => {
  const req = (await call(intel.default, { method: 'GET', query: { id: rid } })).body.accepts[0];
  const auth = { from: acct.address, to: payTo, value: String(value), validAfter: '0', validBefore: String(Math.floor(Date.now() / 1000) + 600), nonce: '0x' + 'b'.repeat(64) };
  const signature = await acct.signTypedData({ domain: { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: USDC }, types: { TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] }, primaryType: 'TransferWithAuthorization', message: { ...auth, value: BigInt(value), validAfter: 0n, validBefore: BigInt(auth.validBefore) } });
  return Buffer.from(JSON.stringify({ x402Version: 2, accepted: req, payload: { authorization: auth, signature } })).toString('base64');
};
const unlock = async (h) => call(intel.default, { method: 'GET', query: { id: rid }, headers: { 'payment-signature': h } });
// a signature with no money behind it (the facilitator says the balance isn't there)
intel.deps.facilitator = async (path) => (path === 'verify' ? { isValid: false, invalidReason: 'insufficient_funds' } : { success: false });
let r = await unlock(await payHeader(buyer, author.address.toLowerCase(), 500000));
assert.equal(r.status, 402, 'a signature without funds unlocks nothing'); assert.equal(r.body.item, undefined);
// the transfer must pay the author the price
intel.deps.facilitator = async () => ({ isValid: true, success: true, transaction: '0x' + 'c'.repeat(64) });
assert.equal((await unlock(await payHeader(buyer, buyer.address, 500000))).status, 402, 'paying yourself is not paying the author');
assert.equal((await unlock(await payHeader(buyer, author.address.toLowerCase(), 1))).status, 402, 'paying too little');
assert.equal((await unlock(await payHeader(author, author.address.toLowerCase(), 500000))).status, 409, 'the author cannot pay themselves');
// the facilitator settles: the report is released and the earnings count
let calls = [];
intel.deps.facilitator = async (path) => { calls.push(path); return path === 'verify' ? { isValid: true } : { success: true, transaction: '0x' + 'd'.repeat(64) }; };
r = await unlock(await payHeader(buyer, author.address.toLowerCase(), 500000));
assert.equal(r.status, 200); assert.deepEqual(calls, ['verify', 'settle'], 'verify then settle, in that order');
assert.ok(r.body.item.fullReport.includes('full paid thesis')); assert.equal(r.body.paid.tx, '0x' + 'd'.repeat(64));
assert.equal((await call(intel.default, { method: 'GET' })).body.stats.totalUsdc, 0.5);
// a settle that fails after a valid verify releases nothing
intel.deps.facilitator = async (path) => (path === 'verify' ? { isValid: true } : { success: false, errorReason: 'nonce_used' });
r = await unlock(await payHeader(buyer, author.address.toLowerCase(), 500000));
assert.equal(r.status, 402); assert.equal(r.body.item, undefined);

// ---- Game Mode saves ----
const player = wallet(), other = wallet();
const save = (addr, token, state = {}) => call(rpg.default, { body: { address: addr, state, meta: { level: 5, name: 'x' } }, headers: token ? { 'x-rpg-token': token } : {} });
assert.equal((await save(player.address, null, { xp: 999999 })).status, 401, 'saving as a wallet without signing in');
const issuedAt = new Date().toISOString();
const session = await call(rpg.default, { body: { action: 'session', address: player.address, issuedAt, signature: await player.signMessage({ message: rpgMessage(player.address, issuedAt) }) } });
assert.equal(session.status, 200); assert.match(session.body.token, /^[a-f0-9]{64}$/);
const forged = await call(rpg.default, { body: { action: 'session', address: player.address, issuedAt, signature: await other.signMessage({ message: rpgMessage(player.address, issuedAt) }) } });
assert.equal(forged.status, 401, 'a session for a wallet you do not control');
assert.equal((await save(other.address, session.body.token, { xp: 5 })).status, 401, "one wallet's token cannot write another's save");
assert.equal((await save(player.address, session.body.token, { xp: 40 })).status, 200, 'the owner saves');
assert.equal((await call(rpg.default, { method: 'GET', query: { address: player.address } })).body.state.xp, 40);

// shop receipts: real USDC to the vault for the price, once
const VAULT = (await import('../src/config.js')).CONFIG.flywheel.contract;
const rc = (itemId, n) => ({ itemId, txHash: '0x' + String(n).repeat(64), usdcPrice: 0.01, at: Date.now() });
rpg.deps.getReceipt = async () => null;
let st = (await save(player.address, session.body.token, { xp: 50, usdcReceipts: [rc('gold-statue', 1)] })).body.state;
assert.equal(st.usdcReceipts.length, 0, 'a made-up receipt is dropped'); assert.ok(!st.blueprints.includes('gold-statue'));
rpg.deps.getReceipt = async () => ({ status: 'success', logs: [transferLog(USDC, player.address, VAULT, 1_000_000n)] });
st = (await save(player.address, session.body.token, { xp: 60, usdcReceipts: [rc('gold-statue', 2)] })).body.state;
assert.equal(st.usdcReceipts.length, 0, 'paid $1 for a $5 item');
rpg.deps.getReceipt = async () => ({ status: 'success', logs: [transferLog(USDC, player.address, VAULT, 5_000_000n)] });
st = (await save(player.address, session.body.token, { xp: 70, usdcReceipts: [rc('gold-statue', 3)] })).body.state;
assert.equal(st.usdcReceipts.length, 1); assert.equal(st.usdcReceipts[0].verified, true); assert.ok(st.blueprints.includes('gold-statue'));
// the same payment cannot buy for another wallet
const issuedAt2 = new Date().toISOString();
const s2b = await call(rpg.default, { body: { action: 'session', address: other.address, issuedAt: issuedAt2, signature: await other.signMessage({ message: rpgMessage(other.address, issuedAt2) }) } });
rpg.deps.getReceipt = async () => ({ status: 'success', logs: [transferLog(USDC, other.address, VAULT, 5_000_000n)] });
assert.equal((await save(other.address, s2b.body.token, { usdcReceipts: [rc('gold-statue', 3)] })).body.state.usdcReceipts.length, 0, 'a payment already spent by another wallet');

// the price table is the shop's
const src = fs.readFileSync(new URL('../src/game-world.js', import.meta.url), 'utf8');
const shop = Object.fromEntries([...src.matchAll(/\{ id: '([^']+)'[^\n]*?usdcPrice: ([0-9.]+)/g)].map((m) => [m[1], Number(m[2])]).filter(([, p]) => p > 0));
assert.deepEqual(USDC_PRICES, shop, 'src/shop-prices.js matches SHOP_CATALOG');

console.log('security ok');
