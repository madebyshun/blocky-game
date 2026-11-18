// One Blocky's work profile (src/skills.js) from its NFT metadata and its paid work. The metadata is
// read from BaseCity's own /api/nft/<n> and cached for an hour; paid work and the owner's price setting
// come from the agent entry (api/agent.js).
import { useKv, kv, KEY_BASE } from './_store.js';
import { profileOf } from '../src/skills.js';

const SITE = process.env.SITE_URL || 'https://www.basecity.space';
const ATTR_KEY = `${KEY_BASE}:nftattrs:v1`;
const memo = new Map();

export async function attrsOf(n) {
  if (memo.has(n) && Date.now() - memo.get(n).at < 3600e3) return memo.get(n).a;
  let hit = null;
  if (useKv()) { try { hit = JSON.parse((await kv('HGET', ATTR_KEY, String(n))) || 'null'); } catch { /* none */ } }
  if (hit && Date.now() - hit.at < 3600e3) { memo.set(n, hit); return hit.a; }
  const r = await fetch(`${SITE}/api/nft/${n}`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`No metadata for Blocky #${n}`);
  const a = Object.fromEntries(((await r.json()).attributes || []).map((x) => [x.trait_type, x.value]));
  const row = { at: Date.now(), a: { Role: a.Role, Rarity: a.Rarity, Trait: a.Trait } };
  memo.set(n, row);
  if (useKv()) await kv('HSET', ATTR_KEY, String(n), JSON.stringify(row)).catch(() => {});
  return row.a;
}

export async function profileFor(n, entry) {
  const a = await attrsOf(String(n));
  if (entry === undefined && useKv()) { try { entry = JSON.parse((await kv('HGET', `${KEY_BASE}:agent:v1`, String(n))) || 'null'); } catch { entry = null; } }
  const paid = (entry?.soldCalls || 0) + (entry?.jobsPaid || 0);
  return { ...profileOf(n, a, paid), mult: entry?.priceMult || 1, onDuty: !!entry?.active };
}

// a Blue Agent job paid to this Blocky (verified on chain by the worker): counts toward its level
export async function bumpJobsPaid(n) {
  if (!useKv()) return;
  const k = `${KEY_BASE}:agent:v1`;
  const e = JSON.parse((await kv('HGET', k, String(n))) || '{}');
  e.jobsPaid = (e.jobsPaid || 0) + 1;
  await kv('HSET', k, String(n), JSON.stringify(e));
}
