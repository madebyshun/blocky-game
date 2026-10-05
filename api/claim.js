// Vercel serverless function: claim BaseCity Blockies as NFTs (contracts/BaseCityBlockies.sol).
//   GET  /api/claim              whether claims are open: { open, contract, chainId, unlocked }
//   GET  /api/claim?address=0x…  the wallet's Blockies: in the city (claimed or not), waiting, gone
//   POST /api/claim { address }  a signed claim for up to 50 of its unclaimed Blockies. The wallet
//                                sends it to the contract itself and pays the gas.
// The ledger (api/colony.js) decides who owns which Blocky; this signs exactly that. The signer key
// (CLAIM_SIGNER_KEY) stays on the server, and the contract only accepts claims it signed, sent by the
// wallet named in them. While the collection is locked, each claim also burns up to 20 Blockies whose
// wallets sold after claiming (their places went to the next buyers).

import { getAddress, isAddress, erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { allowance, walletBlockies } from '../src/ledger.js';
import { env, client, TOKEN, LEDGER, NFT, KEY_BASE, kv, useKv, loadLedger } from './_store.js';
import { claimTypedData, CLAIM_ABI } from './_sig.js';

const SIGNER = /^0x[0-9a-fA-F]{64}$/.test(env.CLAIM_SIGNER_KEY || '') ? privateKeyToAccount(env.CLAIM_SIGNER_KEY) : null;
const CHAIN_ID = 8453;
const MAX_IDS = 50, MAX_EVICT = 20;
const TTL = 30 * 60; // a signature lasts 30 minutes
const SETTLE_MS = (TTL + 10 * 60) * 1000; // a Blocky that left longer ago can't be claimed with an old signature
const EVICT_KEY = `${KEY_BASE}:evict:v1`;

// which of these Blockies exist on-chain (claimed and not burned)
async function onchain(ids) {
  const out = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const res = await client.multicall({ allowFailure: true, contracts: chunk.map((n) => ({ address: NFT, abi: CLAIM_ABI, functionName: 'exists', args: [BigInt(n)] })) });
    res.forEach((r, k) => { if (r.status === 'success' && r.result) out.add(chunk[k]); });
  }
  return out;
}

// Blockies that left the city but were claimed before their wallets sold: burn them with the next
// claims. Departures are checked once, then again only while an old signature could still claim them.
let memory = null;
async function evictions(L) {
  const saved = (useKv() ? JSON.parse((await kv('GET', EVICT_KEY)) || 'null') : memory) || { checked: 0, pending: [] };
  const fresh = L.departures.slice(saved.checked, saved.checked + 400).map(([n, s]) => [n, L.start + s * 1000]);
  const candidates = [...new Map([...saved.pending, ...fresh].map((d) => [d[0], d])).values()];
  if (!candidates.length) return [];
  const live = await onchain(candidates.map((d) => d[0]));
  const settled = Date.now() - SETTLE_MS;
  const next = { checked: saved.checked + fresh.length, pending: candidates.filter(([n, at]) => live.has(n) || at > settled) };
  if (useKv()) await kv('SET', EVICT_KEY, JSON.stringify(next));
  else memory = next;
  return candidates.filter(([n]) => live.has(n)).map(([n]) => n).slice(0, MAX_EVICT);
}

// the wallet's Blockies, and how many it may still keep (its $BLOCKY balance, read now)
async function wallet(L, address) {
  const { active, left } = walletBlockies(L, address);
  const wi = L.wallets.indexOf(address.toLowerCase());
  const a = wi >= 0 ? L.acct[wi] : null;
  return { a, active, left, owed: a ? Math.max(0, allowance(a) - a.ids.length) : 0 };
}
async function holding(L, a, address) {
  if (L.frozen) return Infinity;
  const decimals = L.decimals ?? Number(await client.readContract({ address: TOKEN, abi: erc20Abi, functionName: 'decimals' }));
  const bal = Number(await client.readContract({ address: TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [address] })) / 10 ** decimals;
  return allowance({ ...a, bal });
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const raw = req.method === 'POST' ? (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}).address : req.query?.address ?? new URL(req.url, 'http://x').searchParams.get('address');
  if (!raw && req.method !== 'POST') {
    const unlocked = NFT ? await client.readContract({ address: NFT, abi: CLAIM_ABI, functionName: 'unlocked' }).catch(() => false) : false;
    return res.status(200).json({ open: Boolean(NFT && SIGNER), contract: NFT || null, chainId: CHAIN_ID, unlocked });
  }
  if (!isAddress(raw || '', { strict: false })) return res.status(400).json({ error: 'Send a wallet address' });
  const address = getAddress(raw);
  try {
    const { ledger: L } = await loadLedger();
    const w = await wallet(L, address);
    const unlocked = NFT ? Boolean(L.frozen || (await client.readContract({ address: NFT, abi: CLAIM_ABI, functionName: 'unlocked' }).catch(() => false))) : false;
    const claimed = NFT && w.active.length ? await onchain(w.active).catch(() => new Set()) : new Set();

    if (req.method !== 'POST') {
      const seedOf = (n) => L.blockies[n - 1][3] ?? null, atOf = (n) => L.start + L.blockies[n - 1][1] * 1000;
      return res.status(200).json({
        address,
        contract: NFT || null,
        chainId: CHAIN_ID,
        open: Boolean(NFT && SIGNER),
        unlocked,
        price: LEDGER.per, // USD of $BLOCKY per Blocky
        boughtUsd: Math.round((w.a?.usd ?? 0) * 100) / 100,
        toNext: Math.round((1 - ((w.a?.credits ?? 0) % 1)) * LEDGER.per * 100) / 100, // USD more for the next Blocky
        blockies: w.active.map((n) => ({ n, at: atOf(n), seed: seedOf(n), claimed: claimed.has(n) })),
        left: w.left.map((n) => ({ n, at: atOf(n), seed: seedOf(n) })),
        waiting: w.owed, // owed a place: the city is full
      });
    }

    if (!NFT || !SIGNER) return res.status(503).json({ error: 'Claims open soon: your Blockies are saved in the ledger' });
    const unclaimed = w.active.filter((n) => !claimed.has(n));
    if (!unclaimed.length) return res.status(409).json({ error: w.active.length ? 'Every Blocky of this wallet is already claimed' : 'This wallet has no Blockies in the city' });
    // keep the oldest Blockies the wallet still holds $BLOCKY for (the newest leave first)
    const keep = await holding(L, w.a, address);
    const mine = w.active.slice(0, keep);
    const ids = unclaimed.filter((n) => mine.includes(n)).slice(0, MAX_IDS);
    if (!ids.length) return res.status(409).json({ error: 'This wallet sold its $BLOCKY: its Blockies are leaving the city' });
    const evict = unlocked ? [] : await evictions(L).catch(() => []);
    const deadline = Math.floor(Date.now() / 1000) + TTL;
    const signature = await SIGNER.signTypedData(claimTypedData({ chainId: CHAIN_ID, contract: NFT, to: address, ids, evict, deadline }));
    res.status(200).json({ contract: NFT, chainId: CHAIN_ID, to: address, ids, evict, deadline, signature, more: unclaimed.length - ids.length });
  } catch (e) {
    console.warn('[claim]', e.shortMessage || e.message);
    res.status(502).json({ error: String(e.shortMessage || e.message || e) });
  }
}
