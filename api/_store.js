// Shared by the API routes (files starting with _ are not routes on Vercel): settings, the Base
// client and the Blocky ledger's storage. Upstash Redis / Vercel KV (KV_REST_API_URL +
// KV_REST_API_TOKEN) keeps the ledger; without KV it lives in this process's memory (fine for
// `npm run dev`, not for production).

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { newLedger } from '../src/ledger.js';
import { CONFIG } from '../src/config.js';

export const env = process.env;
export const RPC = env.BASE_RPC_URL || 'https://mainnet.base.org';
export const TOKEN = (env.TOKEN_ADDRESS || '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885').toLowerCase();
export const LEDGER = {
  per: Number(env.USD_PER_BLOCKY || CONFIG.usdPerBlocky), // USD of $BLOCKY per Blocky
  supply: Number(env.MAX_SUPPLY || 10000),
  whaleUsd: Number(env.WHALE_USD || 1000),
  unlockUsd: Number(env.UNLOCK_USD || CONFIG.unlockUsd), // total bought that opens trading
  citizenDays: Number(env.CITIZEN_DAYS || CONFIG.citizenDays), // then a Blocky is a citizen (an NFT) after this many days
};
export const LAUNCH = Number(env.LAUNCH_TIME_MS || 0) || null; // when the city starts from empty land
export const BACKFILL_MS = Number(env.BACKFILL_HOURS || 0) * 3600000;
export const SITE = (env.SITE_URL || CONFIG.siteUrl || '').replace(/\/$/, '');
// the team's reserve: Blockies #1 to #count for this wallet from the start (src/config.js nft.reserve)
export const RESERVE = {
  wallet: env.TEAM_RESERVE_WALLET || CONFIG.nft.reserve?.wallet || '',
  count: Number(env.TEAM_RESERVE_COUNT ?? CONFIG.nft.reserve?.count ?? 0),
};
export const NFT = env.NFT_CONTRACT || CONFIG.nft.contract || ''; // the BaseCity Blockies contract

export const client = createPublicClient({ chain: base, transport: http(RPC, { retryCount: 2 }) });

const KV_URL = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
export const KEY_BASE = env.KV_KEY || 'blocky:colony';
const LEDGER_KEY = `${KEY_BASE}:ledger:v5`;
export const useKv = () => Boolean(KV_URL && KV_TOKEN);

export async function kv(...cmd) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${KV_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  return (await res.json()).result;
}

// several commands in one round trip (Upstash's /pipeline): their results, in order
export async function kvPipe(cmds) {
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${KV_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  return (await res.json()).map((r) => r.result);
}

let memory = null;
// The ledger, created empty (0 Blockies) the first time: from LAUNCH_TIME_MS, or now.
export async function loadLedger() {
  const saved = useKv() ? JSON.parse((await kv('GET', LEDGER_KEY)) || 'null') : memory;
  if (saved) return { ledger: saved, fresh: false };
  const start = LAUNCH ?? Date.now() - BACKFILL_MS;
  return { ledger: { ...newLedger(start, RESERVE), seen: [], checkedAt: 0 }, fresh: true };
}
export async function saveLedger(ledger) {
  if (useKv()) await kv('SET', LEDGER_KEY, JSON.stringify(ledger));
  else memory = ledger;
}
