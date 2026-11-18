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
import { LOGS_RPC } from './_baselive.js';

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
    if (prev && prev.owner === lower && !prev.signature) continue; // an agent registered for this Blocky on chain wins over a signed link
    if (prev && prev.owner === lower && Date.parse(prev.proof?.issuedAt) > t) continue; // a newer link from the same owner wins
    entries.push([p.blocky, { agentId: p.agentId, owner: lower, proof, signature: body.signature }]);
  }
  await write(entries);
  return { owner, linked: entries.map(([b, e]) => ({ blocky: Number(b), agentId: Number(e.agentId) })) };
}

// The live (Blocky, agent) pairs of one wallet: signed links and agents registered for a Blocky's card.
export async function linksOf(owner, { ownersOf = owners } = {}) {
  const lower = String(owner).toLowerCase();
  let all = [];
  if (useKv()) { const flat = (await kv('HGETALL', KEY)) || []; for (let i = 0; i < flat.length; i += 2) { try { const e = JSON.parse(flat[i + 1]); if (e.owner === lower) all.push([flat[i], e]); } catch { /* skip */ } } }
  else all = [...memory.entries()].filter(([, e]) => e.owner === lower);
  if (!all.length) return [];
  const got = await ownersOf(all.flatMap(([b, e]) => [[NFT, b], [IDENTITY, e.agentId]]));
  return all.filter((_, i) => got[2 * i] === lower && got[2 * i + 1] === lower).map(([b, e]) => ({ blocky: Number(b), agentId: String(e.agentId), via: e.signature ? 'owner-signature' : 'onchain-register' })).sort((a, b) => a.blocky - b.blocky);
}

// Agents just registered for Blockies (batch `register(cardURI)` from the claim page): read each mint from
// its receipt, check its tokenURI is the card of a Blocky the same wallet owns, and link them. No signature:
// the on-chain registration by the owner is the proof.
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const URI_ABI = [{ type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] }];
export function blockyOfCard(uri) {
  try { const u = new URL(uri); return /(^|\.)basecity\.space$/.test(u.hostname) && u.pathname === '/api/agent-card' && /^\d{1,5}$/.test(u.searchParams.get('blocky') || '') ? u.searchParams.get('blocky') : null; } catch { return null; }
}
export async function linkMinted(owner, txs, { ownersOf = owners, receipt = (hash) => client.getTransactionReceipt({ hash }), uriOf = (id) => client.readContract({ address: IDENTITY, abi: URI_ABI, functionName: 'tokenURI', args: [BigInt(id)] }), write = putLinks } = {}) {
  const lower = String(owner).toLowerCase(), minted = [];
  for (const hash of [...new Set(txs)].slice(0, 60)) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) continue;
    const r = await receipt(hash).catch(() => null);
    if (!r || r.status !== 'success') continue;
    for (const l of r.logs) if (l.address.toLowerCase() === IDENTITY.toLowerCase() && l.topics[0] === TRANSFER && BigInt(l.topics[1]) === 0n && `0x${l.topics[2].slice(26)}`.toLowerCase() === lower) minted.push(BigInt(l.topics[3]).toString());
  }
  const pairs = [];
  for (const id of minted) { const b = blockyOfCard(await uriOf(id).catch(() => '')); if (b) pairs.push({ blocky: b, agentId: id }); }
  if (!pairs.length) return { owner: lower, linked: [] };
  const got = await ownersOf(pairs.flatMap((p) => [[NFT, p.blocky], [IDENTITY, p.agentId]]));
  const ok = pairs.filter((_, i) => got[2 * i] === lower && got[2 * i + 1] === lower);
  await write(ok.map((p) => [p.blocky, { agentId: p.agentId, owner: lower, proof: null, signature: null, registeredAt: Date.now() }]));
  return { owner: lower, linked: ok.map((p) => ({ blocky: Number(p.blocky), agentId: Number(p.agentId) })) };
}

// Find this wallet's recent agent mints on chain (last ~3 hours) and link those registered for a Blocky.
// Lets the claim page finish linking even when the wallet never reports the batch's receipts.
export async function scanMinted(owner, { blocks = 54000n } = {}) {
  const head = await client.getBlockNumber(), hashes = new Set();
  const topicTo = `0x${String(owner).toLowerCase().slice(2).padStart(64, '0')}`;
  for (let to = head; to > head - blocks; to -= 9000n) {
    const from = to - 8999n;
    const r = await fetch(LOGS_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ address: IDENTITY, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [TRANSFER, `0x${'0'.repeat(64)}`, topicTo] }] }) }).then((x) => x.json()).catch(() => null);
    for (const l of r?.result || []) hashes.add(l.transactionHash);
  }
  return linkMinted(owner, [...hashes]);
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      if (body.scan) { if (!isAddress(String(body.owner || ''))) return res.status(400).json({ error: 'owner must be an address' }); return res.status(200).json(await scanMinted(body.owner)); }
      if (Array.isArray(body.minted)) { if (!isAddress(String(body.owner || ''))) return res.status(400).json({ error: 'owner must be an address' }); return res.status(200).json(await linkMinted(body.owner, body.minted)); }
      return res.status(200).json(await verifyAndStore(body));
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET or POST' });
    if (req.query.blocky) {
      if (!/^\d{1,5}$/.test(String(req.query.blocky))) return res.status(400).json({ error: 'invalid_blocky' });
      const e = await liveLink(String(req.query.blocky));
      return res.status(200).json(e ? { blocky: Number(req.query.blocky), agentId: Number(e.agentId), owner: e.owner, ...(e.signature ? { ownerProof: { ...e.proof, signature: e.signature } } : { via: 'onchain-register' }) } : { blocky: Number(req.query.blocky), agentId: null });
    }
    // ?all: every Blocky with its own agent registered on chain whose BaseCity agent is on (for directories)
    if (req.query.all !== undefined) {
      res.setHeader('cache-control', 's-maxage=120, stale-while-revalidate=600');
      const flat = useKv() ? (await kv('HGETALL', KEY)) || [] : [...memory.entries()].flatMap(([b, e]) => [b, JSON.stringify(e)]);
      const act = useKv() ? (await kv('HGETALL', `${KEY_BASE}:agent:v1`)) || [] : [];
      const on = new Set(); for (let i = 0; i < act.length; i += 2) { try { if (JSON.parse(act[i + 1])?.active) on.add(act[i]); } catch { /* skip */ } }
      const rows = []; for (let i = 0; i < flat.length; i += 2) { try { const e = JSON.parse(flat[i + 1]); if (!e.signature) rows.push([flat[i], e]); } catch { /* skip */ } }
      const got = rows.length ? await owners(rows.flatMap(([b, e]) => [[NFT, b], [IDENTITY, e.agentId]])) : [];
      const live = rows.filter(([, e], i) => got[2 * i] === e.owner && got[2 * i + 1] === e.owner);
      return res.status(200).json({ blockies: live.map(([b, e]) => ({ blocky: Number(b), agentId: Number(e.agentId), owner: e.owner, onDuty: on.has(b), card: `https://www.basecity.space/api/agent-card?blocky=${b}` })).sort((a, b) => a.blocky - b.blocky) });
    }
    if (req.query.owner && isAddress(String(req.query.owner))) return res.status(200).json({ owner: String(req.query.owner).toLowerCase(), links: await linksOf(req.query.owner) });
    return res.status(400).json({ error: 'blocky or owner required' });
  } catch (e) {
    return res.status(e.status || 500).json({ error: String(e.message || e).slice(0, 300) });
  }
}
