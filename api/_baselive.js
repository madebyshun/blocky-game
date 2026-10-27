// Base Live (src/baselive.js): what Base is doing right now, read straight from the chain.
// The pure parts (decoding and summing logs, a block's summary) are here so they can be tested on
// real blocks (test/baselive.mjs); the routes are api/baselive.js, api/basestats.js, api/basetx.js
// and api/baseme.js. Every number comes from Base's RPC (BASE_RPC_URL), except TVL (DefiLlama).

import { RPC } from './_store.js';
import { cleanName } from './_names.js';

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
export function summarize(block, { usdc = [], swaps = null, names = [], bridge = [] } = {}) {
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
    names: names.filter(mine).map(nameOf).filter(Boolean),
    bridge: bridge.filter(mine).map(bridgeOf).filter(Boolean),
  };
}

// the blocks after `since` (at most `max`, newest last), summarized. Swaps are counted on the newest
// block only (there are hundreds per block); USDC, names and bridge deposits on all of them.
export async function readBlocks(since, max = 4, url = RPC) {
  const [headHex] = await rpc([['eth_blockNumber', []]], url);
  const head = num(headHex), from = Math.max(head - max + 1, (Number(since) || 0) + 1);
  if (from > head) return { head, blocks: [] };
  const ns = Array.from({ length: head - from + 1 }, (_, i) => from + i);
  const res = await rpc([
    ...ns.map(getBlock),
    getLogs(from, head, { address: USDC, topics: [T.transfer] }),
    getLogs(head, head, { topics: [SWAPS] }),
    getLogs(from, head, { address: [NAMES, BRIDGE], topics: [[T.name, T.ethIn, T.tokenIn]] }),
  ], url);
  const blocks = res.slice(0, ns.length), [usdc, swaps, misc] = res.slice(ns.length);
  const names = misc.filter((l) => l.topics[0] === T.name && l.address.toLowerCase() === NAMES);
  const bridge = misc.filter((l) => l.address.toLowerCase() === BRIDGE);
  return {
    head,
    blocks: blocks.filter(Boolean).map((b) => summarize(b, { usdc, swaps: num(b.number) === head ? swaps : null, names, bridge })),
  };
}

// the last hour: Basenames registered, deposits bridged in, the pace of transactions (sampled blocks)
export const HOUR_BLOCKS = 1800; // 2 s blocks
export const LOG_RANGE = 450; // blocks per eth_getLogs: many RPC plans cap the range (often at 500)
// logs over [from, to] in ranges of LOG_RANGE blocks, a few ranges per batch
async function logsOver(from, to, filter, url) {
  const ranges = [];
  for (let a = from; a <= to; a += LOG_RANGE) ranges.push([a, Math.min(to, a + LOG_RANGE - 1)]);
  const out = [];
  for (let i = 0; i < ranges.length; i += 4) out.push(...(await rpc(ranges.slice(i, i + 4).map(([a, b]) => getLogs(a, b, filter)), url)).flat());
  return out;
}
// each part on its own, so one that fails (a limit, a timeout) leaves the others: null where it failed
const part = (p) => p.catch((e) => { console.warn('[basestats]', e.message); return null; });
export async function readHour(url = RPC) {
  const [headHex] = await rpc([['eth_blockNumber', []]], url);
  const head = num(headHex), from = head - HOUR_BLOCKS + 1;
  const samples = Array.from({ length: 12 }, (_, i) => head - i * 150);
  const [names, bridge, blocks] = await Promise.all([
    part(logsOver(from, head, { address: NAMES, topics: [T.name] }, url)),
    part(logsOver(from, head, { address: BRIDGE, topics: [[T.ethIn, T.tokenIn]] }, url)),
    part(Promise.all([0, 4, 8].map((i) => rpc(samples.slice(i, i + 4).map(getBlock), url))).then((x) => x.flat())),
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
