// Basenames: the primary name (name.base.eth) a wallet set for itself on Base, read straight from
// Base (Multicall3) and checked both ways: the name must resolve back to the wallet, or it's ignored.
// - Reverse: ENS's L2 reverse registrar (nameForAddr, ENSIP-19: where every primary name is set
//   since 2025), else the older Basenames resolver's reverse record (names set before that).
// - Forward: the name's resolver from the Base registry, its Base address (coin type 0x80002105),
//   else its plain address record (names from before the migration).
// Names are cached (KV, else memory): a new wallet is looked up right away, known ones once a day.

import { namehash, keccak256, encodePacked, stringToBytes, parseAbi, isAddress, zeroAddress } from 'viem';
import { normalize } from 'viem/ens';
import { client, kv, useKv, KEY_BASE } from './_store.js';
import { CONFIG } from '../src/config.js';

const { reverseRegistrar: L2RR, legacyResolver: LEGACY, registry: REGISTRY } = CONFIG.basenames;
const BASE_COIN = 0x80002105n; // ENSIP-11 coin type of Base (chain 8453)
const BASE_REVERSE_NODE = namehash('80002105.reverse');
const ABI = parseAbi([
  'function nameForAddr(address addr) view returns (string)',
  'function name(bytes32 node) view returns (string)',
  'function resolver(bytes32 node) view returns (address)',
  'function addr(bytes32 node) view returns (address)',
  'function addr(bytes32 node, uint256 coinType) view returns (bytes)',
]);
const KEY = `${KEY_BASE}:names:v2`;
const TTL = 24 * 3600000; // re-check a known wallet once a day
const REFRESH_MS = 10 * 60000; // and at most every 10 minutes (new wallets: right away)
const MAX_LOOKUPS = 600; // per call, so one request never stalls on a huge backlog
const CHUNK = 200; // wallets per multicall

// the legacy reverse record's node for an address: namehash("<address hex>.80002105.reverse")
export const reverseNode = (address) =>
  keccak256(encodePacked(['bytes32', 'bytes32'], [BASE_REVERSE_NODE, keccak256(stringToBytes(address.slice(2).toLowerCase()))]));

// A name we show: a Basename, ENS-normalized (no lookalike tricks, nothing HTML can trip on).
export function cleanName(name) {
  if (typeof name !== 'string' || name.length > 72 || !name.endsWith('.base.eth')) return null;
  try { return normalize(name) === name ? name : null; } catch { return null; }
}

const ok = (r) => (r?.status === 'success' ? r.result : undefined);
const call = (rpc, contracts) => rpc.multicall({ allowFailure: true, batchSize: 0, contracts });

// The address each name points to on Base (lowercase), or null: [name, ...] -> [address|null, ...]
async function forward(names, rpc) {
  if (!names.length) return [];
  const nodes = names.map((n) => namehash(n));
  const res = await call(rpc, nodes.map((node) => ({ address: REGISTRY, abi: ABI, functionName: 'resolver', args: [node] })));
  const resolvers = res.map((r) => (isAddress(ok(r) || '') ? ok(r) : zeroAddress));
  const live = nodes.map((_, k) => resolvers[k] !== zeroAddress);
  const asks = nodes.flatMap((node, k) => (live[k] ? [
    { address: resolvers[k], abi: ABI, functionName: 'addr', args: [node, BASE_COIN] },
    { address: resolvers[k], abi: ABI, functionName: 'addr', args: [node] },
  ] : []));
  const got = asks.length ? await call(rpc, asks) : [];
  let at = 0;
  return nodes.map((_, k) => {
    if (!live[k]) return null;
    const byCoin = ok(got[at++]), plain = ok(got[at++]);
    const a = typeof byCoin === 'string' && /^0x[0-9a-f]{40}$/i.test(byCoin) ? byCoin : plain;
    return a && isAddress(a) && a !== zeroAddress ? a.toLowerCase() : null;
  });
}

// address -> its Basename, or null, read from Base now (three multicalls per 200 wallets)
export async function readNames(addresses, rpc = client) {
  const out = new Map();
  for (let i = 0; i < addresses.length; i += CHUNK) {
    const chunk = addresses.slice(i, i + CHUNK).map((a) => a.toLowerCase());
    const rev = await call(rpc, chunk.flatMap((a) => [
      { address: L2RR, abi: ABI, functionName: 'nameForAddr', args: [a] },
      { address: LEGACY, abi: ABI, functionName: 'name', args: [reverseNode(a)] },
    ]));
    // candidates in order of trust: the reverse registrar's name first, then the legacy one
    const cands = chunk.flatMap((a, k) => [...new Set([cleanName(ok(rev[2 * k])), cleanName(ok(rev[2 * k + 1]))])].filter(Boolean).map((n) => ({ a, n })));
    const to = await forward(cands.map((c) => c.n), rpc);
    for (const a of chunk) out.set(a, null);
    cands.forEach((c, k) => { if (!out.get(c.a) && to[k] === c.a) out.set(c.a, c.n); }); // it points back
  }
  return out;
}

// The wallet a Basename points to, or null.
export async function addressOf(name, rpc = client) {
  let n;
  try { n = normalize(String(name).trim()); } catch { return null; }
  if (!cleanName(n)) return null;
  const [a] = await forward([n], rpc);
  return a;
}

let memory = null;
// { address: 'name.base.eth' } for the ones of these wallets that have a Basename (cached).
export async function namesFor(addresses, rpc = client) {
  const now = Date.now();
  const cache = (useKv() ? JSON.parse((await kv('GET', KEY)) || 'null') : memory) || { at: 0, m: {} };
  const list = [...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase()))];
  const due = now - cache.at > REFRESH_MS;
  const look = list.filter((a) => !cache.m[a] || (due && now - cache.m[a][1] > TTL)).slice(0, MAX_LOOKUPS);
  if (look.length) {
    try {
      const got = await readNames(look, rpc);
      for (const a of look) cache.m[a] = [got.get(a) || '', now];
      if (due) cache.at = now;
      if (useKv()) await kv('SET', KEY, JSON.stringify(cache));
      else memory = cache;
    } catch (e) {
      console.warn('[names] lookup skipped:', e.shortMessage || e.message);
    }
  }
  const names = {};
  for (const a of list) if (cache.m[a]?.[0]) names[a] = cache.m[a][0];
  return names;
}
