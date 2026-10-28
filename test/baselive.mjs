// Base Live (api/_baselive.js): decoding logs and summarizing blocks, on logs read from Base mainnet
// (block 53,159,703's neighbourhood), against a stand-in RPC. Run: npm test
import assert from 'node:assert/strict';
import http from 'node:http';
import { readAppTvl, readFlow, HOUR_MS, readFees, ETH_USD_FEED, GAS_ORACLE, summarize, nameOf, bridgeOf, usdcOf, readBlocks, readHour, readTx, readWallet, USDC, BRIDGE, NAMES, MORPHO, AAVE, UNIV4, T } from '../api/_baselive.js';

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
const calls = [], ranges = [];
const answer = ({ method, params }) => {
  calls.push(method);
  if (method === 'eth_blockNumber') return `0x${HEAD.toString(16)}`;
  if (method === 'eth_getBlockByNumber') { const n = parseInt(params[0], 16); return header(n, n % 7 + 300); }
  if (method === 'eth_getLogs') {
    const f = params[0];
    if (f.address === USDC) return [usdc(HEAD, A, B, 1500000), usdc(HEAD - 1, A, B, 20)];
    if (f.topics?.[0]?.includes?.(T.swapV3)) return Array.from({ length: 42 }, (_, i) => ({ blockNumber: `0x${HEAD.toString(16)}`, address: i < 5 ? UNIV4 : '0x9', topics: [i < 5 ? T.swapV4 : i < 12 ? T.swapAero : T.swapV3] }));
    if (Array.isArray(f.address) && f.address.includes(MORPHO)) return [MORPHO, MORPHO, AAVE].map((address) => ({ address, blockNumber: `0x${HEAD.toString(16)}`, topics: ['0x1'] }));
    if (Array.isArray(f.address)) return [{ ...NAME_LOG, blockNumber: `0x${(HEAD - 1).toString(16)}` }, { ...ETH_LOG, blockNumber: `0x${HEAD.toString(16)}` }];
    const inRange = (l) => parseInt(l.blockNumber, 16) >= parseInt(f.fromBlock, 16) && parseInt(l.blockNumber, 16) <= parseInt(f.toBlock, 16);
    if (f.address === NAMES) { ranges.push([f.fromBlock, f.toBlock]); return [NAME_LOG, NAME_LOG].filter(inRange); }
    if (f.address === BRIDGE) return [ETH_LOG].filter(inRange);
  }
  if (method === 'eth_getTransactionByHash') return { hash: params[0], from: A, to: B, value: '0xde0b6b3a7640000' };
  if (method === 'eth_getTransactionReceipt') return { blockNumber: `0x${HEAD.toString(16)}`, status: '0x1', gasUsed: '0x5208', effectiveGasPrice: '0x4c83fe', l1Fee: '0x0', logs: [usdc(HEAD, A, B, 42)] };
  if (method === 'eth_getBalance') return '0x1bc16d674ec80000';
  if (method === 'eth_getTransactionCount') return '0x2a';
  if (method === 'eth_getCode') return params[0] === B ? '0x363d3d373d3d' : params[0] === A ? '0x' : '0xef0100aa';
  // real answers from Base (block 0x32b317e's neighbourhood): Chainlink ETH/USD, the L1 fee bound, the tip
  if (method === 'eth_call' && params[0].to === ETH_USD_FEED) return '0x000000000000000000000000000000000000000000000003000000000000288200000000000000000000000000000000000000000000000000000036e681f78e000000000000000000000000000000000000000000000000000000006ae17233000000000000000000000000000000000000000000000000000000006ae172410000000000000000000000000000000000000000000000030000000000002882';
  if (method === 'eth_call' && params[0].to === GAS_ORACLE) return '0x0000000000000000000000000000000000000000000000000000000025a1caf4';
  if (method === 'eth_maxPriorityFeePerGas') return '0xf4240';
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
assert.deepEqual(live.blocks[1].apps, { aerodrome: 7, uniswap: 5, morpho: 2, aave: 1 });
assert.deepEqual(live.blocks[0].apps, { aerodrome: null, uniswap: null, morpho: 0, aave: 0 });
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
// the hour's logs are read in ranges of at most 450 blocks (RPC plans cap eth_getLogs)
assert.ok(ranges.length === 4 && ranges.every(([a, b]) => parseInt(b, 16) - parseInt(a, 16) < 450), JSON.stringify(ranges));
assert.equal(parseInt(ranges[0][0], 16), HEAD - 1799);
assert.equal(parseInt(ranges.at(-1)[1], 16), HEAD);

const tx = await readTx(`0x${'ab'.repeat(32)}`, url);
assert.deepEqual([tx.from, tx.to, tx.eth, tx.ok, tx.block, tx.gasUsed, tx.usdc[0].usd], [A, B, 1, true, HEAD, 21000, 42]);
assert.ok(Math.abs(tx.feeEth - 21000 * 5014526e-18) < 1e-15);

const w = await readWallet(A, '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885', url);
assert.deepEqual(w, { eth: 2, txs: 42, smart: false, usdc: 1234.56, blocky: 1000 });
assert.deepEqual(await readWallet(B, '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885', url).then((x) => [x.smart, x.txs]), [true, null]); // a smart wallet: no tx count
assert.deepEqual(await readWallet('0x3333333333333333333333333333333333333333', '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885', url).then((x) => [x.smart, x.txs]), [false, 42]); // EIP-7702: still an account
const fees = await readFees(url);
assert.deepEqual(fees, { ethUsd: 2357.96, ethUsdAt: 0x6ae17241 * 1000, l1FeeWei: 631360244, prioWei: 1000000, gas: 62000 });
// the week's USDC flow: sampled hours, kept, filled in a few per call; the share moved while banks were shut
{
  const { bankHours } = await import('../src/bankhours.js');
  const NOW = Date.UTC(2026, 9, 28, 15, 20); // a Wednesday, 11:20 in New York
  const headT = Math.floor(NOW / 1000), HEADN = 53200000;
  let sampled = 0;
  const flowSrv = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const q = JSON.parse(body);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(q.map((x) => {
      if (x.method === 'eth_getBlockByNumber') return { jsonrpc: '2.0', id: x.id, result: header(HEADN, 1) && { ...header(HEADN, 1), timestamp: `0x${headT.toString(16)}` } };
      const b = parseInt(x.params[0].fromBlock, 16), t = (headT - (HEADN - b) * 2) * 1000;
      sampled++;
      const k = bankHours(t).open ? 1 : 3; // three times the USDC while banks are shut
      return { jsonrpc: '2.0', id: x.id, result: Array.from({ length: k }, () => usdc(b, A, B, 1000)) };
    })));
  });
  await new Promise((r) => flowSrv.listen(0, r));
  const furl = `http://127.0.0.1:${flowSrv.address().port}`;
  const kept = new Map(), store = { get: async (hs) => Object.fromEntries(hs.filter((h) => kept.has(h)).map((h) => [h, kept.get(h)])), set: async (h, v) => { kept.set(h, v); } };
  let f = await readFlow(store, { url: furl, now: NOW });
  assert.equal(f.hours, 6); assert.equal(f.usd24h, null); assert.equal(f.closedShare, null); // a cold start: 6 hours so far
  for (let i = 0; i < 30; i++) f = await readFlow(store, { url: furl, now: NOW });
  assert.equal(f.hours, 168);
  assert.equal(sampled, 168 * 4, 'each hour sampled once, 4 blocks');
  const shut = [...kept.keys()].filter((h) => !bankHours(h * HOUR_MS + HOUR_MS / 2).open).length;
  assert.equal(f.closedHours, shut);
  assert.ok(shut > 120 && shut < 135, `${shut} closed hours in a week`); // 168 - 5 days x 8 h = 128
  const expect = (3 * shut) / (3 * shut + (168 - shut));
  assert.ok(Math.abs(f.closedShare - expect) < 0.0001, `${f.closedShare} vs ${expect}`);
  const open24 = [...Array(24)].map((_, i) => Math.floor(NOW / HOUR_MS) - 1 - i).filter((h) => bankHours(h * HOUR_MS + HOUR_MS / 2).open).length;
  assert.equal(f.usd24h, (open24 * 1 + (24 - open24) * 3) * 1000 * 1800);
  flowSrv.close();
}
// each app's TVL on Base: its parent's protocols however DefiLlama names the parent, or its slugs
{
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => [
    { slug: 'aerodrome-v1', parentProtocol: 'parent#aerodrome-finance', chainTvls: { Base: 300e6 } },
    { slug: 'aerodrome-slipstream', parentProtocol: 'parent#aerodrome-finance', chainTvls: { Base: 250e6 } },
    { slug: 'uniswap-v3', parentProtocol: 'parent#uniswap', chainTvls: { Base: 400e6, Ethereum: 3e9 } },
    { slug: 'morpho-blue', parentProtocol: 'parent#morpho', chainTvls: { Base: 4.5e9 } },
    { slug: 'aave-v3', parentProtocol: 'parent#aave', chainTvls: { Base: 562e6 } },
    { slug: 'aavegotchi', chainTvls: { Base: 1e6 } },
  ] });
  assert.deepEqual(await readAppTvl(), { aerodrome: 550e6, uniswap: 400e6, morpho: 4.5e9, aave: 562e6 });
  globalThis.fetch = real;
}
server.close();
console.log('baselive: ok');
