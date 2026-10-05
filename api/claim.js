// Vercel serverless function: claim BaseCity Blockies as NFTs (contracts/BaseCityBlockies.sol).
//   GET  /api/claim              whether claims are open: { open, contract, chainId, frozenAt,
//                                unlockAt, unlocked, market } (market: null, 'settling' or 'ready')
//   GET  /api/claim?address=0x…  the wallet's Blockies: in the city (claimed or not), waiting, gone,
//                                and its Basename. address may also be a Basename (name.base.eth).
//   GET  /api/claim?evictions=1  Blockies that left the city but are still NFTs: for the owner's
//                                evict(ids) on the contract while the collection is locked.
//   GET  /api/claim?market=1     once the city is frozen: a signed openMarket(evict, deadline,
//                                signature) that burns every one of those and opens transfers. Anyone
//                                can send it (and pays the gas, a few cents).
//   POST /api/claim { address }  a signed claim for up to 50 of its unclaimed Blockies. The wallet
//                                sends it to the contract itself and pays the gas.
// The ledger (api/colony.js) decides who owns which Blocky; this signs exactly that. The signer key
// (CLAIM_SIGNER_KEY) stays on the server, and the contract only accepts claims it signed, sent by the
// wallet named in them. While the collection is locked, each claim also burns up to 20 Blockies whose
// wallets sold after claiming (their places went to the next buyers). On Vercel, claims need KV: every
// instance must sign from the same ledger.

import { getAddress, isAddress, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { allowance, walletBlockies, isFrozen } from '../src/ledger.js';
import { env, client, TOKEN, LEDGER, NFT, KEY_BASE, kv, useKv, loadLedger } from './_store.js';
import { claimTypedData, openMarketTypedData, CLAIM_ABI } from './_sig.js';
import { namesFor, addressOf } from './_names.js';

const SIGNER = /^0x[0-9a-fA-F]{64}$/.test(env.CLAIM_SIGNER_KEY || '') ? privateKeyToAccount(env.CLAIM_SIGNER_KEY) : null;
const CHAIN_ID = 8453;
const MAX_IDS = 50, MAX_EVICT = 20, MAX_LIST = 200;
const TTL = 30 * 60; // a signature lasts 30 minutes
const SETTLE_MS = (TTL + 10 * 60) * 1000; // a Blocky that left longer ago can't be claimed with an old signature
const EVICT_KEY = `${KEY_BASE}:evict:v1`;
const MAX_MARKET_EVICT = 400; // Blockies one openMarket burns at most (more: the owner burns some first)
const SYNC_WAIT_MS = 15 * 60000; // the market opens with what the ledger knows if it can't catch up by then
// Signing needs the one shared ledger (KV): without it, every serverless instance has its own.
const shared = () => useKv() || !['production', 'preview'].includes(env.VERCEL_ENV);
const isOpen = () => Boolean(NFT && SIGNER && shared());

// which of these Blockies exist on-chain (claimed and not burned). Throws if any read fails.
async function onchain(ids) {
  const out = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const res = await client.multicall({ allowFailure: true, contracts: chunk.map((n) => ({ address: NFT, abi: CLAIM_ABI, functionName: 'exists', args: [BigInt(n)] })) });
    res.forEach((r, k) => {
      if (r.status !== 'success') throw new Error(`couldn't read Blocky #${chunk[k]} on-chain`);
      if (r.result) out.add(chunk[k]);
    });
  }
  return out;
}

// The collection now: read (false if the contract couldn't be read), when the city froze and when
// transfers open (ms, null before the freeze), whether they are open, and how many more Blockies fit.
async function collection() {
  if (!NFT) return { read: false, frozenAt: null, unlockAt: null, unlocked: false, room: Infinity, max: LEDGER.supply };
  const fns = ['frozenAt', 'unlockAt', 'unlocked', 'totalSupply', 'MAX_SUPPLY'];
  const res = await client.multicall({ allowFailure: true, contracts: fns.map((functionName) => ({ address: NFT, abi: CLAIM_ABI, functionName })) }).catch(() => []);
  const read = res.length === fns.length && res.every((r) => r.status === 'success');
  const [frozenAt, unlockAt, unlocked, supply, max] = fns.map((_, k) => (read ? res[k].result : null));
  return {
    read,
    frozenAt: frozenAt ? Number(frozenAt) * 1000 : null,
    unlockAt: unlockAt ? Number(unlockAt) * 1000 : null,
    unlocked: unlocked === true,
    room: read ? Number(max - supply) : Infinity,
    max: read ? Number(max) : LEDGER.supply,
  };
}
// what the ledger says, with the contract's freeze and unlock even before api/colony.js has read them
function withChain(L, c) {
  if (c.frozenAt && !L.frozenAt) L.frozenAt = c.frozenAt;
  if (c.unlocked) L.unlocked = true;
  return L;
}
// Once the city is frozen: whether the market can open, i.e. the ledger has applied every trade before
// the freeze and its last balance check (or has had long enough to).
const marketState = (L, c) => {
  if (!c.frozenAt || c.unlocked) return null;
  const synced = L.frozenAt === c.frozenAt && L.finalCheck && L.syncedTo >= c.frozenAt;
  return synced || Date.now() > c.frozenAt + SYNC_WAIT_MS ? 'ready' : 'settling';
};

// Blockies that left the city but were claimed before their wallets sold: burn them with the next
// claims. Departures are checked once, then again only while an old signature could still claim them.
let memory = null;
async function evictions(L, scan = 400) { // scan: departures to check for the first time
  const saved = (useKv() ? JSON.parse((await kv('GET', EVICT_KEY)) || 'null') : memory) || { checked: 0, pending: [] };
  const fresh = L.departures.slice(saved.checked, saved.checked + scan).map(([n, s]) => [n, L.start + s * 1000]);
  const candidates = [...new Map([...saved.pending, ...fresh].map((d) => [d[0], d])).values()];
  if (!candidates.length) return [];
  const live = await onchain(candidates.map((d) => d[0]));
  const settled = Date.now() - SETTLE_MS;
  const next = { checked: saved.checked + fresh.length, pending: candidates.filter(([n, at]) => live.has(n) || at > settled) };
  if (useKv()) await kv('SET', EVICT_KEY, JSON.stringify(next));
  else memory = next;
  return candidates.filter(([n]) => live.has(n)).map(([n]) => n);
}

// the wallet's Blockies, and how many it may still keep (its $BLOCKY balance, read now)
async function wallet(L, address) {
  const { active, left } = walletBlockies(L, address);
  const wi = L.wallets.indexOf(address.toLowerCase());
  const a = wi >= 0 ? L.acct[wi] : null;
  return { a, active, left, owed: a ? Math.max(0, allowance(a) - a.ids.length) : 0 };
}
async function holding(L, a, address) {
  if (isFrozen(L, Date.now())) return Infinity;
  const decimals = L.decimals ?? Number(await client.readContract({ address: TOKEN, abi: erc20Abi, functionName: 'decimals' }));
  const bal = Number(await client.readContract({ address: TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [address] })) / 10 ** decimals;
  return allowance({ ...a, bal });
}

function body(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const param = (k) => req.query?.[k] ?? new URL(req.url, 'http://x').searchParams.get(k);
  const raw = req.method === 'POST' ? body(req).address : param('address');
  if (!raw && req.method !== 'POST') {
    const c = await collection();
    const state = { contract: NFT || null, chainId: CHAIN_ID, frozenAt: c.frozenAt, unlockAt: c.unlockAt, unlocked: c.unlocked };
    const list = param('evictions') != null, market = param('market') != null;
    if (!list && !market) {
      // frozen and locked (minutes, once): whether the ledger is ready to open the market
      const L = c.frozenAt && !c.unlocked ? await loadLedger().then((r) => r.ledger).catch(() => null) : null;
      return res.status(200).json({ open: isOpen(), ...state, market: L ? marketState(L, c) : null });
    }
    if (!NFT || !SIGNER || !shared()) return res.status(503).json({ error: 'Needs the contract, the signer and the shared ledger (KV)' });
    if (market && !c.frozenAt) return res.status(409).json({ ...state, error: 'The city is not full yet: the market opens once every Blocky is claimed' });
    if (market && c.unlocked) return res.status(409).json({ ...state, error: 'The market is already open' });
    try {
      const L = withChain((await loadLedger()).ledger, c);
      if (list) {
        // for the owner: evict(ids) on the contract burns these (Basescan, Write Contract)
        const ids = c.unlocked ? [] : await evictions(L, 2000);
        return res.status(200).json({ ...state, evict: ids.slice(0, MAX_LIST), more: Math.max(0, ids.length - MAX_LIST) });
      }
      if (marketState(L, c) !== 'ready') return res.status(409).json({ ...state, market: 'settling', error: 'The city just froze: the ledger is catching up with the last trades. Try again in a minute' });
      const evict = await evictions(L, Infinity);
      if (evict.length > MAX_MARKET_EVICT) return res.status(409).json({ ...state, error: `${evict.length} Blockies to burn first: the owner burns some, then the market opens` });
      const deadline = Math.floor(Date.now() / 1000) + TTL;
      const signature = await SIGNER.signTypedData(openMarketTypedData({ chainId: CHAIN_ID, contract: NFT, evict, deadline }));
      return res.status(200).json({ ...state, evict, deadline, signature });
    } catch (e) {
      return res.status(502).json({ error: String(e.shortMessage || e.message || e) });
    }
  }
  let address = isAddress(raw || '', { strict: false }) ? getAddress(raw) : null;
  if (!address && req.method !== 'POST' && /\.base\.eth$/i.test(String(raw || '').trim())) {
    const a = await addressOf(raw).catch(() => null);
    if (!a) return res.status(404).json({ error: `${String(raw).trim().slice(0, 80)} doesn't point to a wallet` });
    address = getAddress(a);
  }
  if (!address) return res.status(400).json({ error: 'Send a wallet address' });
  try {
    const c = await collection();
    const L = withChain((await loadLedger()).ledger, c);
    const w = await wallet(L, address);
    const claimed = NFT && w.active.length ? await onchain(w.active).catch(() => new Set()) : new Set();

    if (req.method !== 'POST') {
      const seedOf = (n) => L.blockies[n - 1][3] ?? null, atOf = (n) => L.start + L.blockies[n - 1][1] * 1000;
      const name = (await namesFor([address]).catch(() => ({})))[address.toLowerCase()] || null;
      return res.status(200).json({
        address,
        name, // its Basename
        contract: NFT || null,
        chainId: CHAIN_ID,
        open: isOpen(),
        frozenAt: c.frozenAt, // when the city froze (ms): selling no longer sends Blockies away
        unlockAt: c.unlockAt, // when transfers open (ms): sooner if anyone opens the market
        unlocked: c.unlocked, // transfers are open
        price: LEDGER.per, // USD of $BLOCKY per Blocky
        boughtUsd: Math.round((w.a?.usd ?? 0) * 100) / 100,
        toNext: Math.round((1 - ((w.a?.credits ?? 0) % 1)) * LEDGER.per * 100) / 100, // USD more for the next Blocky
        blockies: w.active.map((n) => ({ n, at: atOf(n), seed: seedOf(n), claimed: claimed.has(n) })),
        left: w.left.map((n) => ({ n, at: atOf(n), seed: seedOf(n) })),
        waiting: w.owed, // owed a place: the city is full
      });
    }

    if (!isOpen()) return res.status(503).json({ error: 'Claims open soon: your Blockies are saved in the ledger' });
    if (!c.read) return res.status(502).json({ error: "Couldn't read the contract: try again in a moment" });
    const unclaimed = w.active.filter((n) => !claimed.has(n));
    if (!unclaimed.length) return res.status(409).json({ error: w.active.length ? 'Every Blocky of this wallet is already claimed' : 'This wallet has no Blockies in the city' });
    // keep the oldest Blockies the wallet still holds $BLOCKY for (the newest leave first)
    const keep = await holding(L, w.a, address);
    const mine = w.active.slice(0, keep);
    let ids = unclaimed.filter((n) => mine.includes(n)).slice(0, MAX_IDS);
    if (!ids.length) return res.status(409).json({ error: 'This wallet sold its $BLOCKY: its Blockies are leaving the city' });
    const evict = c.unlocked ? [] : (await evictions(L).catch(() => [])).slice(0, MAX_EVICT);
    // the contract mints only while fewer than MAX_SUPPLY exist: don't make the wallet pay gas for nothing
    const fit = c.room + evict.length;
    if (fit < 1) return res.status(409).json({ error: c.unlocked ? `All ${c.max.toLocaleString('en-US')} Blockies are claimed: the collection is complete` : 'The collection is full right now: try again in a few minutes' });
    ids = ids.slice(0, fit);
    const deadline = Math.floor(Date.now() / 1000) + TTL;
    const signature = await SIGNER.signTypedData(claimTypedData({ chainId: CHAIN_ID, contract: NFT, to: address, ids, evict, deadline, frozen: Boolean(c.frozenAt) }));
    res.status(200).json({ contract: NFT, chainId: CHAIN_ID, to: address, ids, evict, deadline, signature, more: unclaimed.length - ids.length });
  } catch (e) {
    console.warn('[claim]', e.shortMessage || e.message);
    res.status(502).json({ error: String(e.shortMessage || e.message || e) });
  }
}
