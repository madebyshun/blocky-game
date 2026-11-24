// Checking a wallet-signed action (src/signed.js): the address is valid, the signature is fresh, it matches the
// message the server rebuilt, and it hasn't been used before (smart-contract wallets work too: viem's
// verifyMessage handles ERC-1271/6492 over RPC).
import { getAddress, isAddress, keccak256, toHex } from 'viem';
import { client, kv, useKv, KEY_BASE } from './_store.js';
import { FRESH_MS } from '../src/signed.js';

export const deps = { verify: (a) => client.verifyMessage(a) }; // tests swap in an offline verifier
const seen = new Map();

// true the first time this key is seen within `ttl` seconds, false after
export async function once(key, ttl = 900) {
  if (useKv()) return (await kv('SET', `${KEY_BASE}:sigseen:${key}`, '1', 'NX', 'EX', String(ttl))) === 'OK';
  const now = Date.now();
  for (const [k, exp] of seen) if (exp < now) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, now + ttl * 1000);
  return true;
}

export async function checkSigned({ wallet, message, signature, issuedAt, now = Date.now(), replay = true }) {
  if (!isAddress(String(wallet || ''), { strict: false })) return { ok: false, status: 400, error: 'A valid wallet address is required.' };
  const t = Date.parse(issuedAt || '');
  if (!signature) return { ok: false, status: 401, error: 'This action needs a wallet signature.' };
  if (!Number.isFinite(t) || Math.abs(now - t) > FRESH_MS) return { ok: false, status: 401, error: 'The signature is too old or its time is missing: sign again.' };
  const ok = await deps.verify({ address: getAddress(wallet), message, signature }).catch(() => false);
  if (!ok) return { ok: false, status: 401, error: 'The signature does not match this wallet and action.' };
  if (replay && !(await once(keccak256(toHex(signature))))) return { ok: false, status: 409, error: 'This signature was already used: sign again.' };
  return { ok: true, wallet: String(wallet).toLowerCase() };
}
