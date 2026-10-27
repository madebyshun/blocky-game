// Base Live (api/_baselive.js): decoding logs and summarizing blocks, on logs read from Base mainnet
// (block 53,159,703's neighbourhood), against a stand-in RPC. Run: npm test
import assert from 'node:assert/strict';
import http from 'node:http';
import { summarize, nameOf, bridgeOf, usdcOf, readBlocks, readHour, readTx, readWallet, USDC, BRIDGE, NAMES, T } from '../api/_baselive.js';

const pad = (a) => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`;
const amt = (n) => `0x${BigInt(n).toString(16).padStart(64, '0')}`;
const A = '0x1111111111111111111111111111111111111111', B = '0x2222222222222222222222222222222222222222';

// real logs: a Basename registered (jessesp), and an ETH deposit from Ethereum (0.4119 ETH)
const NAME_LOG = { address: NAMES, topics: [T.name, '0xef6596d9fd80e02605cde6377f119fa625a4244c939d89adef8ce8652c160e0d', '0x0000000000000000000000005abc3599012cee0244723d818a3fd2f425cf9dd9'], data: '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000006cc1de5600000000000000000000000000000000000000000000000000000000000000076a65737365737000000000000000000000000000000000000000000000000000', blockNumber: '0x32b26f9', transactionHash: '0x5ebc37e2cf5fd6bf286a6f6078174192451bbec0e9ef7eb0599f4a9ab48b9454' };
const ETH_LOG = { address: BRIDGE, topics: [T.ethIn, '0x000000000000000000000000c186fa914353c44b2e33ebe05f21846f1048beda', '0x00000000000000000000000009aea4b2242abc8bb4bb78d537a67a245a7bec64'], data: '0x00000000000000000000000000000000000000000000000005b7840a62d49d3e00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000', blockNumber: '0x32b2659', transactionHash: '0x4836fa549c84585c862a874790fdf1138121e2d4a463676ec269e0294021cf5e' };
assert.equal(nameOf(NAME_LOG), 'jessesp.base.eth');
const dep = bridgeOf(ETH_LOG);
assert.ok(Math.abs(dep.eth - 0.411943) < 0.000001, `deposit ${dep.eth}`);
assert.equal(dep.to, '0x09aea4b2242abc8bb4bb78d537a67a245a7bec64');
// a name that isn't a normalized Basename is dropped (upper case, markup)
const bad = (s) => { const hex = Buffer.from(s).toString('hex'); return { ...NAME_LOG, data: `0x${amt(64).slice(2)}${amt(1).slice(2)}${amt(s.length).slice(2)}${hex.padEnd(64, '0')}` }; };
assert.equal(nameOf(bad('Jesse')), null);
assert.equal(nameOf(bad('<b>x')), null);
assert.equal(nameOf(bad('blocky')), 'blocky.base.eth');

// USDC transfers: amounts in 6 decimals, big ones listed biggest first
const usdc = (n, from, to, usd) => ({ address: USDC, topics: [T.transfer, pad(from), pad(to)], data: amt(Math.round(usd * 1e6)), blockNumber: `0x${n.toString(16)}`, transactionHash: `0x${String(usd).padStart(64, '0')}` });
assert.deepEqual(usdcOf(usdc(1, A, B, 12.5)), { from: A, to: B, usd: 12.5, tx: `0x${'12.5'.padStart(64, '0')}` });
const HEAD = 53159703;
const header = (n, tx) => ({ number: `0x${n.toString(16)}`, timestamp: `0x${(1793108753 + (n - HEAD) * 2).toString(16)}`, gasUsed: '0x3aa5625', gasLimit: '0x17d78400', baseFeePerGas: '0x4c83fe', transactions: Array.from({ length: tx }, (_, i) => `0x${i}`) });
const s = summarize(header(HEAD, 380), { usdc: [usdc(HEAD, A, B, 5), usdc(HEAD, A, B, 250000), usdc(HEAD, B, A, 2500000), usdc(HEAD - 1, A, B, 9e6)], swaps: [{ blockNumber: `0x${HEAD.toString(16)}` }, { blockNumber: '0x1' }], names: [{ ...NAME_LOG, blockNumber: `0x${HEAD.toString(16)}` }], bridge: [ETH_LOG] });
assert.equal(s.n, HEAD);
assert.equal(s.tx, 380);
assert.ok(Math.abs(s.gas - 0.1538) < 0.001, `gas ${s.gas}`);
assert.ok(Math.abs(s.gwei - 0.005014) < 0.00001, `gwei ${s.gwei}`);
assert.deepEqual([s.usdc.n, s.usdc.usd, s.usdc.big.map((x) => x.usd)], [3, 2750005, [2500000, 250000]]);
assert.equal(s.swaps, 1);
assert.deepEqual(s.names, ['jessesp.base.eth']);
assert.deepEqual(s.bridge, []); // that deposit was in another block
assert.equal(s.t, 1793108753000);

// a stand-in RPC: answers the batches readBlocks / readHour / readTx / readWallet send
const calls = [];
const answer = ({ method, params }) => {
  calls.push(method);
  if (method === 'eth_blockNumber') return `0x${HEAD.toString(16)}`;
  if (method === 'eth_getBlockByNumber') { const n = parseInt(params[0], 16); return header(n, n % 7 + 300); }
  if (method === 'eth_getLogs') {
    const f = params[0];
    if (f.address === USDC) return [usdc(HEAD, A, B, 1500000), usdc(HEAD - 1, A, B, 20)];
    if (f.topics?.[0]?.includes?.(T.swapV3)) return Array.from({ length: 42 }, () => ({ blockNumber: `0x${HEAD.toString(16)}` }));
    if (Array.isArray(f.address)) return [{ ...NAME_LOG, blockNumber: `0x${(HEAD - 1).toString(16)}` }, { ...ETH_LOG, blockNumber: `0x${HEAD.toString(16)}` }];
    if (f.address === NAMES) return [NAME_LOG, NAME_LOG];
    if (f.address === BRIDGE) return [ETH_LOG];
  }
  if (method === 'eth_getTransactionByHash') return { hash: params[0], from: A, to: B, value: '0xde0b6b3a7640000' };
  if (method === 'eth_getTransactionReceipt') return { blockNumber: `0x${HEAD.toString(16)}`, status: '0x1', gasUsed: '0x5208', effectiveGasPrice: '0x4c83fe', l1Fee: '0x0', logs: [usdc(HEAD, A, B, 42)] };
  if (method === 'eth_getBalance') return '0x1bc16d674ec80000';
  if (method === 'eth_getTransactionCount') return '0x2a';
  if (method === 'eth_call') return params[0].to === USDC ? amt(1234560000) : amt(10n ** 21n);
  throw new Error(`unexpected ${method}`);
};
const server = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  const q = JSON.parse(body);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(q.map((x) => ({ jsonrpc: '2.0', id: x.id, result: answer(x) }))));
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}`;

const live = await readBlocks(HEAD - 2, 4, url);
assert.equal(live.head, HEAD);
assert.deepEqual(live.blocks.map((b) => b.n), [HEAD - 1, HEAD]);
assert.deepEqual(live.blocks.map((b) => b.swaps), [null, 42]); // swaps: newest block only
assert.deepEqual(live.blocks.map((b) => b.usdc.usd), [20, 1500000]);
assert.deepEqual(live.blocks[1].usdc.big.map((x) => x.usd), [1500000]);
assert.deepEqual(live.blocks[0].names, ['jessesp.base.eth']);
assert.equal(live.blocks[1].bridge.length, 1);
assert.deepEqual((await readBlocks(HEAD, 4, url)).blocks, []); // nothing new
assert.equal((await readBlocks(0, 4, url)).blocks.length, 4); // first call: the last 4

const hour = await readHour(url);
assert.deepEqual(hour.names, { n: 2, last: ['jessesp.base.eth', 'jessesp.base.eth'] });
assert.equal(hour.bridge.n, 1);
assert.equal(hour.bridge.eth, 0.412);
assert.ok(hour.txPerBlock >= 300 && hour.txPerBlock <= 306);
assert.equal(hour.txPerDay, hour.txPerBlock * 43200);

const tx = await readTx(`0x${'ab'.repeat(32)}`, url);
assert.deepEqual([tx.from, tx.to, tx.eth, tx.ok, tx.block, tx.gasUsed, tx.usdc[0].usd], [A, B, 1, true, HEAD, 21000, 42]);
assert.ok(Math.abs(tx.feeEth - 21000 * 5014526e-18) < 1e-15);

const w = await readWallet(A, '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885', url);
assert.deepEqual(w, { eth: 2, txs: 42, usdc: 1234.56, blocky: 1000 });
server.close();
console.log('baselive: ok');
