// Vercel serverless function: link many Blockies to ERC-8004 agents with one signature.
//   POST /api/agent-link  { owner, links: [{blocky, agentId}], issuedAt, signature }
//        verifies the EIP-712 AgentLink (EOA or smart wallet, via viem verifyTypedData), checks on chain
//        that `owner` owns every Blocky and every agent named, and stores each link with the proof.
//   GET  /api/agent-link?blocky=718     the stored link for a Blocky, re-checked against chain now
//   GET  /api/agent-link?owner=0x…      the links this wallet signed that still hold
// No gas, nothing custodied. A link stops counting the moment either NFT leaves the signer's wallet.
import { getAddress, isAddress } from 'viem';
import { client, NFT, useKv, kv, KEY_BASE } from './_store.js';
import { linkTypedData, cleanLinks } from '../src/agent-link.js';
import { IDENTITY, OWNER_ABI } from '../src/work-protocol.js';

const KEY = `${KEY_BASE}:agentlink:v1`; // hash: blocky -> { agentId, owner, proof: {owner, links, issuedAt}, signature }
const memory = new Map();
const FRESH_MS = 15 * 60000;

async function getLink(blocky) {
  if (!useKv()) return memory.get(String(blocky)) || null;
  try { return JSON.parse((await kv('HGET', KEY, String(blocky))) || 'null'); } catch { return null; }
}
async function putLinks(entries) {
  if (!useKv()) { for (const [b, e] of entries) memory.set(b, e); return; }
  const flat = entries.flatMap(([b, e]) => [b, JSON.stringify(e)]);
  if (flat.length) await kv('HSET', KEY, ...flat);
}

// ownerOf for many tokens in one multicall; null where the token doesn't exist
async function owners(calls) {
  const res = await client.multicall({ contracts: calls.map(([address, id]) => ({ address, abi: OWNER_ABI, functionName: 'ownerOf', args: [BigInt(id)] })), allowFailure: true });
  return res.map((r) => (r.status === 'success' ? String(r.result).toLowerCase() : null));
}

// A stored link still holds if its signer owns both sides right now.
export async function liveLink(blocky, { read = getLink, ownersOf = owners } = {}) {
  const e = await read(blocky);
  if (!e) return null;
  const [b, a] = await ownersOf([[NFT, blocky], [IDENTITY, e.agentId]]);
  return b && b === e.owner && a === e.owner ? e : null;
}

export async function verifyAndStore(body, { ownersOf = owners, verify = (args) => client.verifyTypedData(args), read = getLink, write = putLinks, now = Date.now() } = {}) {
  if (!NFT) throw Object.assign(new Error('NFT contract unavailable'), { status: 503 });
  if (!isAddress(String(body?.owner || ''))) throw Object.assign(new Error('owner must be an address'), { status: 400 });
  const owner = getAddress(body.owner), lower = owner.toLowerCase();
  const issuedAt = String(body.issuedAt || ''), t = Date.parse(issuedAt);
  if (!Number.isFinite(t) || Math.abs(now - t) > FRESH_MS) throw Object.assign(new Error('issuedAt must be within 15 minutes of now'), { status: 400 });
  let links;
  try { links = cleanLinks(body.links); } catch (e) { throw Object.assign(e, { status: 400 }); }
  const typed = linkTypedData(owner, links, issuedAt);
  const ok = await verify({ address: owner, domain: typed.domain, types: typed.types, primaryType: typed.primaryType, message: typed.message, signature: body.signature }).catch(() => false);
  if (!ok) throw Object.assign(new Error('Signature does not match the owner and links'), { status: 401 });
  const got = await ownersOf(links.flatMap((p) => [[NFT, p.blocky], [IDENTITY, p.agentId]]));
  const bad = links.filter((p, i) => got[2 * i] !== lower || got[2 * i + 1] !== lower);
  if (bad.length) throw Object.assign(new Error(`This wallet does not own: ${bad.slice(0, 5).map((p) => (got[links.indexOf(p) * 2] !== lower ? `Blocky #${p.blocky}` : `agent #${p.agentId}`)).join(', ')}${bad.length > 5 ? '…' : ''}`), { status: 403 });
  const proof = typed.json, entries = [];
  for (const p of links) {
    const prev = await read(p.blocky);
    if (prev && prev.owner === lower && Date.parse(prev.proof.issuedAt) > t) continue; // a newer link from the same owner wins
    entries.push([p.blocky, { agentId: p.agentId, owner: lower, proof, signature: body.signature }]);
  }
  await write(entries);
  return { owner, linked: entries.map(([b, e]) => ({ blocky: Number(b), agentId: Number(e.agentId) })) };
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      return res.status(200).json(await verifyAndStore(body));
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET or POST' });
    if (req.query.blocky) {
      if (!/^\d{1,5}$/.test(String(req.query.blocky))) return res.status(400).json({ error: 'invalid_blocky' });
      const e = await liveLink(String(req.query.blocky));
      return res.status(200).json(e ? { blocky: Number(req.query.blocky), agentId: Number(e.agentId), owner: e.owner, ownerProof: { ...e.proof, signature: e.signature } } : { blocky: Number(req.query.blocky), agentId: null });
    }
    if (req.query.owner && isAddress(String(req.query.owner))) {
      const lower = String(req.query.owner).toLowerCase();
      let all = [];
      if (useKv()) { const flat = (await kv('HGETALL', KEY)) || []; for (let i = 0; i < flat.length; i += 2) { try { const e = JSON.parse(flat[i + 1]); if (e.owner === lower) all.push([flat[i], e]); } catch { /* skip */ } } }
      else all = [...memory.entries()].filter(([, e]) => e.owner === lower);
      const got = all.length ? await owners(all.flatMap(([b, e]) => [[NFT, b], [IDENTITY, e.agentId]])) : [];
      return res.status(200).json({ owner: lower, links: all.filter((_, i) => got[2 * i] === lower && got[2 * i + 1] === lower).map(([b, e]) => ({ blocky: Number(b), agentId: Number(e.agentId) })) });
    }
    return res.status(400).json({ error: 'blocky or owner required' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: String(e.message || e).slice(0, 300) });
  }
}
