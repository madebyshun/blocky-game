// Vercel serverless function: claim BaseCity Blockies as NFTs (contracts/BaseCityBlockies.sol).
//   GET  /api/claim              whether claims are open: { open, contract, chainId, unlockUsd, bought,
//                                openedAt, citizenDays, claimed, max } (trading opens at unlockUsd
//                                bought; claimed of max NFTs exist, null if the chain can't be read)
//   GET  /api/claim?address=0x…  the wallet's Blockies: in the city (each with the time it becomes a
//                                citizen, and whether it's claimed), waiting, gone, and its Basename.
//                                address may also be a Basename (name.base.eth). With a suggested
//                                price for each (src/pricing.js), its OpenSea listing, and the floor.
//   POST /api/claim { address }  a signed claim for up to 50 of its citizens not claimed yet. The
//                                wallet sends it to the contract itself and pays the gas.
// The ledger (api/colony.js) decides who owns which Blocky and when it becomes a citizen (src/ledger.js:
// once trading is open (`unlockUsd` bought; 0: now), a Blocky a `citizenDays` old; newcomers leave if their wallets sell). This signs citizens only: they
// never leave, so a claimed Blocky never has to be taken back and trades freely from the start. The
// signer key (CLAIM_SIGNER_KEY) stays on the server, and the contract only accepts claims it signed,
// sent by the wallet named in them. On Vercel, claims need KV: every instance must sign from the same
// ledger.

import { getAddress, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { allowance, citizenAt, citizensOf, walletBlockies } from '../src/ledger.js';
import { env, client, LEDGER, NFT, RESERVE, useKv, loadLedger } from './_store.js';
import { claimTypedData, CLAIM_ABI } from './_sig.js';
import { holdText } from '../src/config.js';
import { namesFor, addressOf } from './_names.js';
import { getMarket } from './_market.js';
import { suggestEth, PRICING } from '../src/pricing.js';

const SIGNER = /^0x[0-9a-fA-F]{64}$/.test(env.CLAIM_SIGNER_KEY || '') ? privateKeyToAccount(env.CLAIM_SIGNER_KEY) : null;
const CHAIN_ID = 8453;
const MAX_IDS = 50;
const TTL = 30 * 60; // a signature lasts 30 minutes
// Signing needs the one shared ledger (KV): without it, every serverless instance has its own.
const shared = () => useKv() || !['production', 'preview'].includes(env.VERCEL_ENV);
const isOpen = () => Boolean(NFT && SIGNER && shared());
const dollars = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const ms = (t) => (Number.isFinite(t) ? t : null); // a time, or null for "not yet

// which of these Blockies exist on-chain (claimed). Throws if any read fails.
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

// How many more Blockies the contract can mint (Infinity if it couldn't be read: the contract has the
// last word), and its cap.
async function room() {
  const res = NFT ? await client.multicall({ allowFailure: true, contracts: ['totalSupply', 'MAX_SUPPLY'].map((functionName) => ({ address: NFT, abi: CLAIM_ABI, functionName })) }).catch(() => []) : [];
  if (res.length !== 2 || res.some((r) => r.status !== 'success')) return { left: Infinity, max: LEDGER.supply, claimed: null };
  return { left: Number(res[1].result - res[0].result), max: Number(res[1].result), claimed: Number(res[0].result) };
}

function body(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const raw = req.method === 'POST' ? body(req).address : req.query?.address ?? new URL(req.url, 'http://x').searchParams.get('address');
  if (!raw && req.method !== 'POST') {
    const [L, { claimed, max }] = await Promise.all([loadLedger().then((r) => r.ledger).catch(() => null), room()]);
    return res.status(200).json({ open: isOpen(), contract: NFT || null, chainId: CHAIN_ID, unlockUsd: LEDGER.unlockUsd, bought: L ? Math.round(L.bought * 100) / 100 : null, openedAt: L?.openedAt ?? null, citizenDays: LEDGER.citizenDays, claimed, max });
  }
  let address = isAddress(raw || '', { strict: false }) ? getAddress(raw) : null;
  if (!address && req.method !== 'POST' && /\.base\.eth$/i.test(String(raw || '').trim())) {
    const a = await addressOf(raw).catch(() => null);
    if (!a) return res.status(404).json({ error: `${String(raw).trim().slice(0, 80)} doesn't point to a wallet` });
    address = getAddress(a);
  }
  if (!address) return res.status(400).json({ error: 'Send a wallet address' });
  try {
    const { ledger: L } = await loadLedger();
    const now = Date.now();
    const { active, left } = walletBlockies(L, address);
    const wi = L.wallets.indexOf(address.toLowerCase());
    const a = wi >= 0 ? L.acct[wi] : null;
    const claimed = NFT && active.length ? await onchain(active).catch(() => new Set()) : new Set();
    const citizen = (n) => citizenAt(L, n, LEDGER);

    if (req.method !== 'POST') {
      const seedOf = (n) => L.blockies[n - 1][3] ?? null, atOf = (n) => L.start + L.blockies[n - 1][1] * 1000;
      const [names, mk] = await Promise.all([namesFor([address]).catch(() => ({})), getMarket(NFT).catch(() => null)]);
      const name = names[address.toLowerCase()] || null;
      // market: OpenSea's floor, ETH in USD, a suggested price for each Blocky and its live listing
      const me = address.toLowerCase();
      const priced = (n) => ({
        suggested: suggestEth(n, seedOf(n), { floor: mk?.floor, ethUsd: mk?.ethUsd, reserveCount: RESERVE.count }),
        listed: mk?.listings?.[n]?.maker === me ? mk.listings[n].eth : null, // its price on OpenSea, listed by this wallet
      });
      return res.status(200).json({
        address,
        name, // its Basename
        contract: NFT || null,
        chainId: CHAIN_ID,
        open: isOpen(),
        citizenDays: LEDGER.citizenDays,
        unlockUsd: LEDGER.unlockUsd,
        openedAt: L.openedAt ?? null,
        price: LEDGER.per, // USD of $BLOCKY per Blocky
        boughtUsd: Math.round((a?.usd ?? 0) * 100) / 100,
        toNext: Math.round((1 - ((a?.credits ?? 0) % 1)) * LEDGER.per * 100) / 100, // USD more for the next Blocky
        blockies: active.map((n) => ({ n, at: atOf(n), seed: seedOf(n), citizenAt: ms(citizen(n)), claimed: claimed.has(n), ...priced(n) })), // citizenAt null: trading isn't open yet
        market: { floor: mk?.floor ?? null, ethUsd: mk?.ethUsd ?? null, live: mk?.listings != null, days: PRICING.days, lowWarn: PRICING.lowWarn },
        left: left.map((n) => ({ n, at: atOf(n), seed: seedOf(n) })),
        waiting: a ? Math.max(0, allowance(a, citizensOf(L, a, now, LEDGER)) - a.ids.length) : 0, // owed a place: the city is full
        tokens: a ? { bought: a.tin, sold: a.tout, balance: a.bal } : null, // $BLOCKY the ledger counted (balance: its last check)
      });
    }

    if (!isOpen()) return res.status(503).json({ error: 'Claims open soon: your Blockies are saved in the ledger' });
    if (!active.length) return res.status(409).json({ error: 'This wallet has no Blockies in the city' });
    const unclaimed = active.filter((n) => !claimed.has(n));
    if (!unclaimed.length) return res.status(409).json({ error: 'Every citizen of this wallet is already claimed' });
    const citizens = unclaimed.filter((n) => citizen(n) <= now);
    if (L.openedAt == null) return res.status(409).json({ error: L.bought >= LEDGER.unlockUsd ? 'Claims open at the next ledger update, in a minute or so. Try again shortly' : `Trading opens when ${dollars(LEDGER.unlockUsd)} of $BLOCKY has been bought: ${dollars(L.bought)} so far. Keep holding: your Blockies become NFTs then` });
    if (!citizens.length) {
      const next = Math.min(...unclaimed.map(citizen));
      return res.status(409).json({ error: `Your Blockies are newcomers: the first becomes a citizen on ${new Date(next).toUTCString()}, ${holdText(LEDGER.citizenDays)} after it arrived, then you can claim it`, citizenAt: next });
    }
    const { left: free, max } = await room();
    if (free < 1) return res.status(409).json({ error: `All ${max.toLocaleString('en-US')} Blockies are claimed: the collection is complete` });
    const ids = citizens.slice(0, Math.min(MAX_IDS, free));
    const deadline = Math.floor(now / 1000) + TTL;
    const signature = await SIGNER.signTypedData(claimTypedData({ chainId: CHAIN_ID, contract: NFT, to: address, ids, deadline }));
    res.status(200).json({ contract: NFT, chainId: CHAIN_ID, to: address, ids, deadline, signature, more: citizens.length - ids.length });
  } catch (e) {
    console.warn('[claim]', e.shortMessage || e.message);
    res.status(502).json({ error: String(e.shortMessage || e.message || e) });
  }
}
