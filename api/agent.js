// Vercel serverless function: the Blocky Agent (src/blockyagent.js, brief in docs/BLOCKY-AGENT.md).
//   GET  /api/agent?address=0x…   the wallet's agent state: { enabled, agents: { [tokenId]: {...} }, totals }
//   POST /api/agent               { address, tokenId, signature, message } → switch the agent on
//                                 { address, tokenId, jobId, args, payment } (x-agent-action: run) → run a job
//   PUT  /api/agent               { address, tokenId, signature, message } → switch the agent off
//
// Only a wallet that actually owns the token onchain can switch its agent on or off, and it proves that
// by signing a short message (no transaction, no gas): the same viem verifyMessage the vote API uses.
// A job is then run only for a token whose agent is on — the server re-reads ownerOf on every call, so
// selling the NFT takes the agent with it.
//
// Jobs read Blue Agent's x402 API (https://blueagent.dev). The server holds no keys and never pays:
// `payment` is an X-PAYMENT header the owner's wallet signed itself. With no paying wallet configured
// the call still goes out and Blue Agent's free tier answers; the result is delivered but not paid.
//
// State lives in KV: `blocky:colony:agent:v1` (a hash, tokenId -> JSON).
import { getAddress, isAddress } from 'viem';
import { client, NFT, useKv, kv, KEY_BASE, loadLedger } from './_store.js';
import { JOB_SPECS, callBlue } from './blueagent.js';

const KEY = `${KEY_BASE}:agent:v1`;
const OWNER_ABI = [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] }];
const memory = new Map(); // no KV (dev): tokenId -> entry

// ---------- state ----------

async function readAll() {
  if (!useKv()) return new Map(memory);
  const flat = (await kv('HGETALL', KEY)) || [];
  const out = new Map();
  for (let i = 0; i < flat.length; i += 2) { try { out.set(flat[i], JSON.parse(flat[i + 1])); } catch { /* skip */ } }
  return out;
}
async function writeOne(tokenId, entry) {
  if (!useKv()) { memory.set(String(tokenId), entry); return; }
  if (entry) await kv('HSET', KEY, String(tokenId), JSON.stringify(entry));
  else await kv('HDEL', KEY, String(tokenId));
}

const EMPTY = { active: false, jobsDone: 0, earnedUsdc: 0, lastJobAt: null, since: null };

// The agent state one wallet should see: its own tokens only. `owned` is what ownerOf says now, so an
// agent whose NFT was sold simply isn't listed (its entry stays keyed by token, not by wallet).
function viewFor(all, owned) {
  const agents = {};
  let jobsDone = 0, earnedUsdc = 0, activeCount = 0;
  for (const id of owned) {
    const e = all.get(String(id));
    if (!e || !e.active) continue;
    agents[id] = { active: true, jobsDone: e.jobsDone || 0, earnedUsdc: e.earnedUsdc || 0, lastJobAt: e.lastJobAt ?? null, since: e.since ?? null, soldCalls: e.soldCalls || 0, soldUsdc: e.soldUsdc || 0 };
    jobsDone += e.jobsDone || 0;
    earnedUsdc += e.earnedUsdc || 0;
    activeCount += 1;
  }
  // payments are signed by the owner's own wallet (src/x402.js): no server key exists, ever
  return { enabled: true, paidBy: 'owner', agents, totals: { active: activeCount, jobsDone, earnedUsdc: Math.round(earnedUsdc * 1e6) / 1e6 } };
}

// ---------- ownership ----------

// a wallet's Blockies, read from chain (ownerOf on each id the ledger says the wallet brought). The
// ledger check keeps it to IDs that exist; ownerOf alone would be 10,000 calls.
let holderCache = null; // { at, byWallet: Map }
async function ownedIds(address) {
  if (!NFT) return [];
  const me = address.toLowerCase();
  // cheap enough without a ledger import: a single eth_call per candidate is too many, so the agent API
  // asks only about the tokens the caller names and checks them individually below.
  return me ? null : [];
}
async function ownerOf(tokenId) {
  if (!NFT) return null;
  try {
    const a = await client.readContract({ address: NFT, abi: OWNER_ABI, functionName: 'ownerOf', args: [BigInt(tokenId)] });
    return String(a).toLowerCase();
  } catch { return null; } // burned / nonexistent
}

// Where the ownership check is read: Base reads the collection through BaseCity's own RPC relay in the
// browser, but a serverless function can be told a different one. Before the contract exists on chain
// every ownerOf reverts, and no agent can be switched on: that is the right answer, not an error.
const CHAIN_READY = Boolean(NFT) && /^0x[0-9a-f]{40}$/i.test(NFT);
// Before the contract answers on chain, the ledger still says who brought every Blocky: that is the
// check, not a bypass. It is only used while ownerOf reverts for the whole collection (a local run, or
// the minute before the contract is live), and it is the same table the claim API signs from.
async function ledgerOwner(tokenId) {
  try {
    const { ledger: L } = await loadLedger();
    const row = L.blockies?.[tokenId - 1];
    return row ? String(L.wallets[row[0]] || '').toLowerCase() : null;
  } catch { return null; }
}
async function ownerIs(tokenId, address) {
  const chain = await ownerOf(tokenId);
  if (chain) return chain === address;
  return (await ledgerOwner(tokenId)) === address; // chain says nothing yet: fall back to the ledger
}
void ownedIds; void holderCache;

// ---------- the request ----------

function body(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}') || {}; } catch { return {}; }
}
// one signature for many Blockies (src/blockyagent.js fleetMessage)
const FLEET = (m) => /^BaseCity: (activate|deactivate) Blocky Agents\n\nWallet (0x[0-9a-fA-F]{40})\nBlockies ([\d,]+)\nIssued (\S+)\n/.exec(m || '');
const ACT = (m) => /^BaseCity: (activate|deactivate) Blocky Agent\n\nBlocky #(\d+)\nWallet (0x[0-9a-fA-F]{40})\n/.exec(m || '');

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);

    // ---- GET: one wallet's agents ----
    if (req.method === 'GET') {
      // ?all: every agent that is on, for the city's builder cards (no wallet detail beyond the id)
      if (q.all !== undefined) {
        const all = await readAll();
        const agents = {};
        for (const [id, e] of all) if (e?.active) agents[id] = { jobsDone: e.jobsDone || 0, earnedUsdc: e.earnedUsdc || 0 };
        return res.status(200).json({ agents, count: Object.keys(agents).length });
      }
      const raw = String(q.address || '').trim();
      if (!isAddress(raw, { strict: false })) return res.status(400).json({ error: 'Send a wallet address' });
      const address = getAddress(raw).toLowerCase();
      const all = await readAll();
      // the ids this wallet is listed under: an entry stores the owner it was activated from
      const mine = [];
      for (const [id, e] of all) if (e?.owner === address && e.active) mine.push(Number(id));
      const live = [];
      await Promise.all(mine.map(async (id) => { if (await ownerIs(id, address)) live.push(id); }));
      return res.status(200).json({ address, ...viewFor(all, live.sort((a, b) => a - b)) });
    }

    const b = body(req);

    // ---- POST with x-agent-action: run a job ----
    if (req.method === 'POST' && req.headers?.['x-agent-action'] === 'run') {
      const raw = String(b.address || '').trim();
      if (!isAddress(raw, { strict: false })) return res.status(400).json({ error: 'Send a wallet address' });
      const address = getAddress(raw).toLowerCase();
      const tokenId = Number(b.tokenId);
      const spec = JOB_SPECS[b.jobId];
      if (!Number.isInteger(tokenId) || tokenId < 1) return res.status(400).json({ error: 'Send a Blocky number' });
      if (!spec) return res.status(400).json({ error: 'Unknown job' });

      if (!(await ownerIs(tokenId, address))) return res.status(403).json({ error: `Blocky #${tokenId} isn't in this wallet` });
      const all = await readAll();
      const entry = all.get(String(tokenId));
      if (!entry?.active || entry.owner !== address) return res.status(403).json({ error: `Blocky #${tokenId}'s agent is off. Switch it on first` });

      const out = await callBlue(spec, b.args || {}, b.payment || null);
      if (out.status === 402) {
        // Blue Agent wants paying and we have no header: hand the accept list back to the wallet
        return res.status(402).json({ error: 'This job needs an x402 payment from your wallet', payment: out.body, job: b.jobId });
      }
      if (!out.ok) return res.status(502).json({ error: out.error || 'Blue Agent did not answer' });

      const paid = out.body?.paid ? spec.price : 0;
      const next = {
        ...entry,
        jobsDone: (entry.jobsDone || 0) + 1,
        earnedUsdc: Math.round(((entry.earnedUsdc || 0) + paid) * 1e6) / 1e6,
        lastJobAt: Date.now(),
      };
      await writeOne(tokenId, next);
      res.status(200).json({ job: b.jobId, result: out.body?.result ?? out.body, paid, jobsDone: next.jobsDone, earnedUsdc: next.earnedUsdc });
      return;
    }

    // ---- POST/PUT with tokenIds: switch many on/off with one signature ----
    if ((req.method === 'POST' || req.method === 'PUT') && Array.isArray(b.tokenIds)) {
      const m = FLEET(b.message), want = req.method === 'POST' ? 'activate' : 'deactivate';
      const ids = [...new Set(b.tokenIds.map(Number))].filter((n) => Number.isInteger(n) && n > 0 && n <= 10000).sort((x, y) => x - y);
      if (!m || m[1] !== want || !ids.length || ids.length > 200 || m[3] !== ids.join(',')) return res.status(400).json({ error: 'The signed message does not match these Blockies' });
      if (Math.abs(Date.now() - Date.parse(m[4])) > 15 * 60000) return res.status(400).json({ error: 'Signature expired: sign again' });
      const address = m[2].toLowerCase();
      const okSign = await client.verifyMessage({ address: getAddress(address), message: b.message, signature: b.signature }).catch(() => false);
      if (!okSign) return res.status(401).json({ error: 'That signature is not for this wallet' });
      const owned = await Promise.all(ids.map((id) => ownerIs(id, address)));
      const mineIds = ids.filter((_, i) => owned[i]);
      const all = await readAll();
      for (const id of mineIds) {
        const prev = all.get(String(id)) || { ...EMPTY };
        await writeOne(id, want === 'activate' ? { ...prev, active: true, owner: address, since: prev.since ?? Date.now() } : { ...prev, active: false, owner: address });
      }
      return res.status(200).json({ [want === 'activate' ? 'activated' : 'deactivated']: mineIds, skipped: ids.filter((_, i) => !owned[i]) });
    }

    // ---- POST: activate; PUT: deactivate ----
    if (req.method === 'POST' || req.method === 'PUT') {
      const raw = String(b.address || '').trim();
      if (!isAddress(raw, { strict: false })) return res.status(400).json({ error: 'Send a wallet address' });
      const address = getAddress(raw).toLowerCase();
      const tokenId = Number(b.tokenId);
      const m = ACT(b.message);
      if (!Number.isInteger(tokenId) || tokenId < 1 || !m || Number(m[2]) !== tokenId || m[3].toLowerCase() !== address) {
        return res.status(400).json({ error: 'The signed message does not match this Blocky and wallet' });
      }
      const want = req.method === 'POST' ? 'activate' : 'deactivate';
      if (m[1] !== want) return res.status(400).json({ error: `Sign the "${want}" message` });
      if (!(await ownerIs(tokenId, address))) return res.status(403).json({ error: `Blocky #${tokenId} isn't in this wallet` });

      const okSign = await client.verifyMessage({ address: getAddress(address), message: b.message, signature: b.signature }).catch(() => false);
      if (!okSign) return res.status(401).json({ error: 'That signature is not for this wallet' });

      const all = await readAll();
      const prev = all.get(String(tokenId)) || { ...EMPTY };
      const entry = want === 'activate'
        ? { ...prev, active: true, owner: address, since: prev.since ?? Date.now() }
        : { ...prev, active: false, owner: address };
      await writeOne(tokenId, entry);
      return res.status(200).json({ tokenId, active: entry.active, jobsDone: entry.jobsDone || 0, earnedUsdc: entry.earnedUsdc || 0 });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.warn('[agent]', e.shortMessage || e.message);
    return res.status(502).json({ error: String(e.shortMessage || e.message || e) });
  }
}
