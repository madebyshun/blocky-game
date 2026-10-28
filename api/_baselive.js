// Base Live (src/baselive.js): what Base is doing right now, read straight from the chain.
// The pure parts (decoding and summing logs, a block's summary) are here so they can be tested on
// real blocks (test/baselive.mjs); the routes are api/baselive.js, api/basestats.js, api/basetx.js
// and api/baseme.js. Every number comes from Base's RPC (BASE_RPC_URL), except TVL (DefiLlama).

import { RPC } from './_store.js';
import { cleanName } from './_names.js';
import { bankHours } from '../src/bankhours.js';

// contracts and event topics, checked against Base mainnet
export const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // native USDC (6 decimals)
export const BRIDGE = '0x4200000000000000000000000000000000000010'; // L2StandardBridge: deposits from Ethereum land here
export const NAMES = '0xa7d2607c6bd39ae9521e514026cbb078405ab322'; // Basenames registrar controller
export const T = {
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer(address,address,uint256)
  swapV3: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67', // Uniswap v3 / Aerodrome Slipstream pools
  swapV2: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822', // Uniswap v2-style pools
  swapAero: '0xb3e2773606abfd36b5bd91394b3a54d1398336c65005baf7bf7a05efeffaf75b', // Aerodrome v2 pools
  swapV4: '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f', // Uniswap v4 pool manager
  name: '0x0667086d08417333ce63f40d5bc2ef6fd330e25aaaf317b7c489541f8fe600fa', // NameRegistered(string,bytes32,address,uint256)
  ethIn: '0x31b2166ff604fc5672ea5df08a78081d2bc6d746cadce880747f3643d819e83d', // ETHBridgeFinalized(from,to,amount,extraData)
  tokenIn: '0xd59c65b35445225835c83f50b6ede06a7be047d22e357073e250d9af537518cd', // ERC20BridgeFinalized(...)
};
export const SWAPS = [T.swapV3, T.swapV2, T.swapAero, T.swapV4];
// Four of the biggest apps on Base, each with a number we can read live (and its TVL on Base from
// DefiLlama): Aerodrome's pools' swaps (its v2 pools' own Swap event), Uniswap v4's swaps (its
// PoolManager), and every action on Morpho and on Aave (their core contracts' events).
export const MORPHO = '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb'; // Morpho Blue
export const AAVE = '0xa238dd80c259a72e81d7e4664a9801593f98d1c5'; // Aave v3 Pool on Base
export const UNIV4 = '0x498581ff718922c3f8e6a244956af099b2652b2b'; // Uniswap v4 PoolManager on Base
export const APPS = [
  { id: 'aerodrome', name: 'Aerodrome', parent: 'parent#aerodrome' },
  { id: 'uniswap', name: 'Uniswap', parent: 'parent#uniswap' },
  { id: 'morpho', name: 'Morpho', parent: 'parent#morpho' },
  { id: 'aave', name: 'Aave', parent: 'parent#aave' },
];
export const BIG_USDC = 100000; // a big transfer: a boat on the river
export const WHALE_USDC = 1000000; // a whale: the ship, and a line in the city log

const hex = (n) => `0x${Number(n).toString(16)}`;
const num = (h) => (h ? parseInt(h, 16) : 0);
const big = (h) => (h && h !== '0x' ? BigInt(h) : 0n);
const word = (data, i) => `0x${String(data).slice(2 + i * 64, 2 + (i + 1) * 64)}`;
const addr = (topic) => `0x${String(topic).slice(-40)}`.toLowerCase();
export const units = (v, decimals) => Number(v) / 10 ** decimals; // fine for display (no sums of huge raw values)

// JSON-RPC, batched: [[method, params], ...] -> results (an error in any one throws)
export async function rpc(calls, url = RPC) {
  const body = calls.map(([method, params], id) => ({ jsonrpc: '2.0', id, method, params }));
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`RPC ${r.status}`);
  const out = await r.json();
  const list = Array.isArray(out) ? out : [out];
  const byId = new Map(list.map((x) => [x.id, x]));
  return calls.map((_, id) => {
    const x = byId.get(id);
    if (!x || x.error) throw new Error(x?.error?.message || 'RPC: no answer');
    return x.result;
  });
}
export const getLogs = (from, to, filter) => ['eth_getLogs', [{ fromBlock: hex(from), toBlock: hex(to), ...filter }]];
export const getBlock = (n) => ['eth_getBlockByNumber', [n === 'latest' ? n : hex(n), false]];

// a USDC Transfer log -> { from, to, usd, tx }
export const usdcOf = (l) => ({ from: addr(l.topics[1]), to: addr(l.topics[2]), usd: units(big(l.data), 6), tx: l.transactionHash });
// a NameRegistered log -> "name.base.eth" (the name is the first word of the data: an offset, then a string)
export function nameOf(l) {
  try {
    const at = num(word(l.data, 0)) / 32, len = num(word(l.data, at));
    const bytes = String(l.data).slice(2 + (at + 1) * 64, 2 + (at + 1) * 64 + len * 2);
    const s = new TextDecoder().decode(Uint8Array.from(bytes.match(/../g) || [], (b) => parseInt(b, 16)));
    return cleanName(`${s}.base.eth`); // normalized names only: nothing a page could trip on
  } catch { return null; }
}
// a bridge log (a deposit from Ethereum) -> { eth, token, tx }: ETH in ether, a token deposit only counted
export function bridgeOf(l) {
  if (l.topics[0] === T.ethIn) return { eth: units(big(word(l.data, 0)), 18), token: null, to: addr(l.topics[2]), tx: l.transactionHash };
  if (l.topics[0] === T.tokenIn) return { eth: 0, token: addr(l.topics[1]), to: addr(word(l.data, 0)), tx: l.transactionHash };
  return null;
}

// one block's summary for the city, from its header and its logs
export function summarize(block, { usdc = [], swaps = null, names = [], bridge = [], apps = [] } = {}) {
  const n = num(block.number);
  const mine = (l) => num(l.blockNumber) === n;
  const transfers = usdc.filter(mine).map(usdcOf);
  const vol = transfers.reduce((s, x) => s + x.usd, 0);
  const sorted = transfers.filter((x) => x.usd >= BIG_USDC).sort((a, b) => b.usd - a.usd).slice(0, 6);
  return {
    n,
    t: num(block.timestamp) * 1000,
    tx: block.transactions?.length ?? 0,
    gas: num(block.gasLimit) ? num(block.gasUsed) / num(block.gasLimit) : 0,
    gwei: num(block.baseFeePerGas) / 1e9,
    usdc: { n: transfers.length, usd: Math.round(vol), big: sorted.map((x) => ({ usd: Math.round(x.usd), from: x.from, to: x.to, tx: x.tx })) },
    swaps: swaps === null ? null : swaps.filter(mine).length,
    // per app: Aerodrome and Uniswap swaps (newest block only, like swaps), Morpho and Aave events
    apps: {
      aerodrome: swaps === null ? null : swaps.filter((l) => mine(l) && l.topics?.[0] === T.swapAero).length,
      uniswap: swaps === null ? null : swaps.filter((l) => mine(l) && l.topics?.[0] === T.swapV4 && l.address?.toLowerCase() === UNIV4).length,
      morpho: apps.filter((l) => mine(l) && l.address.toLowerCase() === MORPHO).length,
      aave: apps.filter((l) => mine(l) && l.address.toLowerCase() === AAVE).length,
    },
    names: names.filter(mine).map(nameOf).filter(Boolean),
    bridge: bridge.filter(mine).map(bridgeOf).filter(Boolean),
  };
}

// the blocks after `since` (at most `max`, newest last), summarized. Swaps are counted on the newest
// block only (there are hundreds per block); USDC, names and bridge deposits on all of them.
// (`max`: on a first call the last 4; after that up to 24, so when Base moves to 200 ms blocks the city
// still gets every one)
export async function readBlocks(since, max = Number(since) ? 24 : 4, url = RPC) {
  const [headHex] = await rpc([['eth_blockNumber', []]], url);
  const head = num(headHex), from = Math.max(head - max + 1, (Number(since) || 0) + 1);
  if (from > head) return { head, blocks: [] };
  const ns = Array.from({ length: head - from + 1 }, (_, i) => from + i);
  const res = await rpc([
    ...ns.map(getBlock),
    getLogs(from, head, { address: USDC, topics: [T.transfer] }),
    getLogs(head, head, { topics: [SWAPS] }),
    getLogs(from, head, { address: [NAMES, BRIDGE], topics: [[T.name, T.ethIn, T.tokenIn]] }),
    getLogs(from, head, { address: [MORPHO, AAVE] }),
  ], url);
  const blocks = res.slice(0, ns.length), [usdc, swaps, misc, apps] = res.slice(ns.length);
  const names = misc.filter((l) => l.topics[0] === T.name && l.address.toLowerCase() === NAMES);
  const bridge = misc.filter((l) => l.address.toLowerCase() === BRIDGE);
  return {
    head,
    blocks: blocks.filter(Boolean).map((b) => summarize(b, { usdc, swaps: num(b.number) === head ? swaps : null, names, bridge, apps })),
  };
}

// the last hour: Basenames registered, deposits bridged in, the pace of transactions (sampled blocks)
export const HOUR_BLOCKS = 1800; // 2 s blocks
export const LOG_RANGE = 450; // blocks per eth_getLogs: many RPC plans cap the range (often at 500)
// logs over [from, to] in ranges of LOG_RANGE blocks, a few ranges per batch
// (if the RPC still refuses, smaller ranges: 100 blocks)
async function logsOver(from, to, filter, url, size = LOG_RANGE) {
  const ranges = [];
  for (let a = from; a <= to; a += size) ranges.push([a, Math.min(to, a + size - 1)]);
  const out = [];
  try {
    for (let i = 0; i < ranges.length; i += 4) out.push(...(await rpc(ranges.slice(i, i + 4).map(([a, b]) => getLogs(a, b, filter)), url)).flat());
  } catch (e) {
    if (size > 100) return logsOver(from, to, filter, url, 100);
    throw e;
  }
  return out;
}
export async function readHour(url = RPC) {
  // each part on its own, so one that fails (a limit, a timeout) leaves the others: null where it
  // failed, and why in `errors` (open /api/basestats to see it)
  const errors = {};
  const part = (name, p) => p.catch((e) => { errors[name] = String(e.message || e).slice(0, 200); console.warn('[basestats]', name, e.message); return null; });
  const [headHex] = await rpc([['eth_blockNumber', []]], url);
  const head = num(headHex), from = head - HOUR_BLOCKS + 1;
  const samples = Array.from({ length: 12 }, (_, i) => head - i * 150);
  const [names, bridge, blocks] = await Promise.all([
    part('names', logsOver(from, head, { address: NAMES, topics: [T.name] }, url)),
    part('bridge', logsOver(from, head, { address: BRIDGE, topics: [[T.ethIn, T.tokenIn]] }, url)),
    part('blocks', Promise.all([0, 4, 8].map((i) => rpc(samples.slice(i, i + 4).map(getBlock), url))).then((x) => x.flat())),
  ]);
  const deposits = bridge ? bridge.map(bridgeOf).filter(Boolean) : null;
  const txs = (blocks || []).filter(Boolean).map((b) => b.transactions.length);
  const perBlock = txs.length ? txs.reduce((s, x) => s + x, 0) / txs.length : null;
  return {
    head,
    names: names ? { n: names.length, last: names.slice(-6).map(nameOf).filter(Boolean).reverse() } : null,
    bridge: deposits ? { n: deposits.length, eth: +deposits.reduce((s, d) => s + d.eth, 0).toFixed(3) } : null,
    txPerBlock: perBlock === null ? null : Math.round(perBlock), // sampled every 5 minutes over the hour
    txPerDay: perBlock === null ? null : Math.round(perBlock * 43200), // that pace for a day
    errors,
  };
}

// each app's TVL on Base (DefiLlama: the sum over its protocols, e.g. Aerodrome Slipstream + v1), or {}
export async function readAppTvl() {
  try {
    const r = await fetch('https://api.llama.fi/protocols', { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return {};
    const list = await r.json(), out = {};
    for (const a of APPS) {
      // its parent (whatever DefiLlama calls it: parent#aerodrome-finance, ...) or any of its versions' slugs
      const mine = (p) => p.parentProtocol === a.parent || String(p.parentProtocol || '').startsWith(`${a.parent}-`) || p.slug === a.id || String(p.slug || '').startsWith(`${a.id}-`);
      const tvl = list.filter(mine).reduce((s, p) => s + (Number(p.chainTvls?.Base) || 0), 0);
      if (tvl > 0) out[a.id] = Math.round(tvl);
    }
    return out;
  } catch { return {}; }
}

// What a USDC transfer costs on Base right now, the parts that change slowly: ETH in USD (Chainlink's
// ETH/USD feed on Base), the L1 data fee for a transfer-sized transaction (the GasPriceOracle's upper
// bound for 150 bytes) and the usual priority fee. The base fee comes with every block.
export const ETH_USD_FEED = '0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70';
export const GAS_ORACLE = '0x420000000000000000000000000000000000000f';
export const USDC_TRANSFER_GAS = 62000; // a USDC transfer uses ~40k-62k gas: the high end
export async function readFees(url = RPC) {
  const [round, l1, prio] = await rpc([
    ['eth_call', [{ to: ETH_USD_FEED, data: '0xfeaf968c' }, 'latest']], // latestRoundData()
    ['eth_call', [{ to: GAS_ORACLE, data: `0xf1c7a58b${(150).toString(16).padStart(64, '0')}` }, 'latest']], // getL1FeeUpperBound(150)
    ['eth_maxPriorityFeePerGas', []],
  ], url);
  const answer = Number(big(word(round, 1))) / 1e8, updated = num(word(round, 3)) * 1000;
  return { ethUsd: answer > 0 ? +answer.toFixed(2) : null, ethUsdAt: updated, l1FeeWei: Number(big(l1)), prioWei: Number(big(prio)), gas: USDC_TRANSFER_GAS };
}

// USDC moved on Base, hour by hour, for the last week: each hour estimated from SAMPLES blocks spread
// over it (their USDC transfers, times the hour's 1,800 blocks), computed once and kept (`store`), a
// few missing hours per call so a cold start fills in over a few calls. From it: the last 24 hours, the
// last hour's pace, and the share that moved while US banks were closed (src/bankhours.js).
export const HOUR_MS = 3600000, SAMPLES = 4, WEEK = 168;
export async function readFlow(store, { url = RPC, now = Date.now(), maxNew = 6, blockMs = 2000 } = {}) {
  const [top] = await rpc([getBlock('latest')], url);
  const head = num(top.number), headT = num(top.timestamp) * 1000;
  const blockAt = (t) => head - Math.round((headT - t) / blockMs);
  const perHour = HOUR_MS / blockMs, cur = Math.floor(now / HOUR_MS);
  const hours = Array.from({ length: WEEK }, (_, i) => cur - 1 - i); // finished hours, newest first
  const have = await store.get(hours);
  const missing = hours.filter((h) => !have[h] && blockAt((h + 1) * HOUR_MS) <= head).slice(0, maxNew);
  await Promise.all(missing.map(async (h) => {
    const b0 = blockAt(h * HOUR_MS), picks = Array.from({ length: SAMPLES }, (_, i) => b0 + Math.round(((i + 0.5) * perHour) / SAMPLES));
    try {
      const res = await rpc(picks.map((b) => getLogs(b, b, { address: USDC, topics: [T.transfer] })), url);
      const usd = res.map((logs) => logs.reduce((s, l) => s + usdcOf(l).usd, 0)), n = res.map((logs) => logs.length);
      const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
      have[h] = { usd: Math.round(mean(usd) * perHour), n: Math.round(mean(n) * perHour) };
      await store.set(h, have[h]);
    } catch { /* this hour waits for the next call */ }
  }));
  const day = hours.slice(0, 24).filter((h) => have[h]), week = hours.filter((h) => have[h]);
  const sum = (hs) => hs.reduce((s, h) => s + have[h].usd, 0);
  const closed = week.filter((h) => !bankHours(h * HOUR_MS + HOUR_MS / 2).open);
  return {
    usd24h: day.length === 24 ? sum(day) : null, // only once the whole day is in
    n24h: day.length === 24 ? day.reduce((s, h) => s + have[h].n, 0) : null,
    lastHourUsd: have[hours[0]]?.usd ?? null,
    closedShare: week.length >= 24 ? +(sum(closed) / (sum(week) || 1)).toFixed(4) : null,
    closedHours: closed.length,
    hours: week.length, // hours behind closedShare (up to 168)
    samples: SAMPLES,
  };
}

// Base's TVL (DefiLlama), or null
export async function readTvl() {
  try {
    const r = await fetch('https://api.llama.fi/v2/chains', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const row = (await r.json()).find((c) => c.name === 'Base');
    return row && Number.isFinite(row.tvl) ? Math.round(row.tvl) : null;
  } catch { return null; }
}

// a transaction for "Find my tx": who, what, how much, and the USDC it moved
export async function readTx(hash, url = RPC) {
  const [tx, receipt] = await rpc([['eth_getTransactionByHash', [hash]], ['eth_getTransactionReceipt', [hash]]], url);
  if (!tx) return null;
  const [block] = receipt ? await rpc([getBlock(num(receipt.blockNumber))], url) : [null];
  const usdc = (receipt?.logs || []).filter((l) => l.address.toLowerCase() === USDC && l.topics[0] === T.transfer && l.topics.length === 3).map(usdcOf);
  const fee = receipt ? units(big(receipt.gasUsed) * big(receipt.effectiveGasPrice), 18) + units(big(receipt.l1Fee || '0x0'), 18) : null;
  return {
    hash: tx.hash,
    from: tx.from.toLowerCase(),
    to: tx.to ? tx.to.toLowerCase() : null,
    eth: units(big(tx.value), 18),
    block: receipt ? num(receipt.blockNumber) : null,
    t: block ? num(block.timestamp) * 1000 : null,
    ok: receipt ? receipt.status === '0x1' : null, // null: still pending
    logs: receipt?.logs?.length ?? 0,
    gasUsed: receipt ? num(receipt.gasUsed) : null,
    feeEth: fee,
    usdc: usdc.slice(0, 5).map((x) => ({ from: x.from, to: x.to, usd: +x.usd.toFixed(2) })),
  };
}

// a wallet for "My Base": ETH, USDC, $BLOCKY, how many transactions it has sent
export async function readWallet(address, token, url = RPC) {
  const call = (to) => ['eth_call', [{ to, data: `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}` }, 'latest']]; // balanceOf
  const [eth, nonce, usdc, blocky, code] = await rpc([['eth_getBalance', [address, 'latest']], ['eth_getTransactionCount', [address, 'latest']], call(USDC), call(token), ['eth_getCode', [address, 'latest']]], url);
  // a smart wallet (contract code; an EIP-7702 delegation 0xef0100… is still a plain account) sends
  // through a bundler, so its nonce isn't its transaction count: none is shown for it
  const smart = Boolean(code && code !== '0x' && !String(code).startsWith('0xef0100'));
  return { eth: units(big(eth), 18), txs: smart ? null : num(nonce), smart, usdc: units(big(usdc), 6), blocky: units(big(blocky), 18) };
}
