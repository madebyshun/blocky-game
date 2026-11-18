// Vercel serverless function: a Blocky's agent card, so other agents can find it and hire it.
//   GET /api/agent-card?blocky=<tokenId>
// One JSON that works as an ERC-8004 registration file (type, name, services, supportedTrust) and as an
// A2A-style card (skills with prices and the x402 endpoint to call). The owner can point their ERC-8004
// agent's URI at it; nothing here is signed or paid.
import { client, NFT, useKv, kv, KEY_BASE } from './_store.js';
import { TOOLS } from './x402.js';
import { liveLink } from './agent-link.js';
import { IDENTITY } from '../src/work-protocol.js';
const URI_ABI = [{ type: 'function', name: 'tokenURI', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'string' }] }];

const OWNER_ABI = [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] }];
const SKILL_NAMES = { 'stock-weekend-gap': 'Weekend gap vs Friday close', 'stock-after-hours-volume': 'After-hours on-chain volume', 'stock-nav-premium': 'NAV premium (pool vs Chainlink, one block)', 'base-token-exit-screen': 'Base token exit screen' };

export function card({ tokenId, owner, entry, site, agentId, agentIds = null, ownerProof = null, linkedBy = null }) {
  const ids = [...new Set((agentIds || (agentId ? [agentId] : [])).map(String))];
  agentId = ids[0] || null;
  const x402 = `${site}/api/x402`;
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: `Blocky #${tokenId}`,
    description: `A BaseCity Blocky that does stock research jobs on Base and earns USDC. Hire it on Blue Agent jobs, or call its x402 tools and get the answer at once. Owner-controlled; payments go wallet to wallet.`,
    image: `${site}/api/nft/${tokenId}.svg`,
    url: `${site}/claim?blocky=${tokenId}`,
    owner,
    ...(ids.length ? { registrations: ids.map((id) => ({ agentId: Number(id), agentRegistry: 'eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' })) } : {}),
    services: [
      { name: 'x402', endpoint: x402, version: '2' },
      { name: 'blue-agent-jobs', endpoint: agentId ? `https://app.blueagent.dev/jobs?agent=${agentId}` : 'https://app.blueagent.dev/jobs' },
    ],
    ...(agentId ? { linkedBy, ...(ownerProof ? { ownerProof } : {}) } : {}),
    supportedTrust: ['reputation'],
    active: !!entry?.active,
    skills: [
      ...Object.entries(TOOLS).map(([id, t]) => ({ id, name: SKILL_NAMES[t.skill], mode: 'x402-instant', priceUsd: t.priceUnits / 1e6, call: `POST ${x402}?tool=${id}&blocky=${tokenId}`, input: { ticker: 'NVDA' } })),
      ...['stock-weekend-gap', 'stock-after-hours-volume', 'stock-nav-premium', 'base-token-exit-screen'].map((s) => ({ id: s, name: SKILL_NAMES[s], mode: 'blue-agent-job' })),
    ],
    stats: { x402Calls: entry?.soldCalls || 0, x402Usdc: entry?.soldUsdc || 0 },
    network: 'eip155:8453',
    note: 'Research only, not financial advice. Coinbase tokenized stocks are not offered to U.S. persons.',
  };
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=300');
  const tokenId = String(req.query.blocky || '');
  if (!/^\d{1,5}$/.test(tokenId) || !NFT) return res.status(400).json({ error: 'invalid_blocky' });
  let owner;
  try { owner = (await client.readContract({ address: NFT, abi: OWNER_ABI, functionName: 'ownerOf', args: [BigInt(tokenId)] })).toLowerCase(); }
  catch { return res.status(404).json({ error: 'not_minted' }); }
  let entry = null;
  if (useKv()) { try { entry = JSON.parse((await kv('HGET', `${KEY_BASE}:agent:v1`, tokenId)) || 'null'); } catch { /* none */ } }
  const site = `https://${req.headers.host || 'www.basecity.space'}`;
  // Which agent this Blocky is linked to: only a link the owner signed (api/agent-link.js), or an agent
  // whose on-chain tokenURI already points at this card and that the same wallet owns. `&agent=` alone
  // is never trusted.
  let agentId = null, ownerProof = null, linkedBy = null;
  const link = await liveLink(tokenId).catch(() => null);
  const agentIds = [], via = [];
  if (link?.signature) { agentIds.push(String(link.agentId)); ownerProof = { ...link.proof, signature: link.signature }; via.push('owner-signature'); }
  else if (link) { // registered for this Blocky: count it when its tokenURI still points here
    try { const uri = await client.readContract({ address: IDENTITY, abi: URI_ABI, functionName: 'tokenURI', args: [BigInt(link.agentId)] }); const u = new URL(uri); if (/(^|\.)basecity\.space$/.test(u.hostname) && u.pathname === '/api/agent-card' && u.searchParams.get('blocky') === tokenId) { agentIds.push(String(link.agentId)); via.push('onchain-tokenURI'); } } catch { /* not pointed here */ }
  }
  if (/^\d{1,12}$/.test(String(req.query.agent || ''))) {
    try {
      const id = BigInt(req.query.agent);
      const [uri, who] = await Promise.all([client.readContract({ address: IDENTITY, abi: URI_ABI, functionName: 'tokenURI', args: [id] }), client.readContract({ address: IDENTITY, abi: OWNER_ABI, functionName: 'ownerOf', args: [id] })]);
      const u = new URL(uri);
      if (/(^|\.)basecity\.space$/.test(u.hostname) && u.pathname === '/api/agent-card' && u.searchParams.get('blocky') === tokenId && who.toLowerCase() === owner) { if (!agentIds.includes(String(id))) { agentIds.unshift(String(id)); via.unshift('onchain-tokenURI'); } }
    } catch { /* not linked */ }
  }
  // both kinds can hold at once (e.g. an agent pointed here on chain, plus a signed link): list every one
  return res.status(200).json(card({ tokenId, owner, entry, site, agentIds, ownerProof, linkedBy: via.join('+') || null }));
}
