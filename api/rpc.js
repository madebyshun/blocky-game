// Vercel serverless function: Base JSON-RPC for listing on OpenSea from the claim page (src/listing.js).
// OpenSea's SDK reads the chain through an ethers provider (owner of a Blocky, approvals, the Seaport
// counter); the public endpoint rate-limits those reads, and ethers reports any RPC error on a call as
// "missing revert data". This relays them to BASE_RPC_URL: reads only, and calls only to the
// contracts a listing touches. Batches pass through.
import { RPC, NFT } from './_store.js';

const READ = new Set(['eth_chainId', 'net_version', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_call', 'eth_getCode', 'eth_getBalance', 'eth_getTransactionReceipt', 'eth_getTransactionCount', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory']);
const CONTRACTS = new Set([
  NFT,
  '0x0000000000000068F116a894984e2DB1123eB395', // Seaport 1.6
  '0x00000000F9490004C11Cef243f5400493c00Ad63', // Seaport's conduit controller
  '0x1E0049783F008A0085193E00003D00cd54003c71', // OpenSea's conduit
].map((a) => a.toLowerCase()));

// why a request may not go through, or null
export function refuse(q) {
  if (!q || typeof q !== 'object' || !READ.has(q.method)) return `${q?.method ?? 'that'} is not available here`;
  if (q.method === 'eth_call' || q.method === 'eth_estimateGas') {
    const to = String(q.params?.[0]?.to || '').toLowerCase();
    if (!CONTRACTS.has(to)) return `calls to ${to || 'nothing'} are not available here`;
  }
  return null;
}

function body(req) {
  if (typeof req.body !== 'string') return req.body ?? null;
  try { return JSON.parse(req.body); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST JSON-RPC' });
  const b = body(req), list = Array.isArray(b) ? b : [b];
  if (!list.length || list.length > 50) return res.status(400).json({ error: 'Send 1 to 50 requests' });
  const bad = list.map((q) => [q, refuse(q)]).filter(([, why]) => why);
  if (bad.length) {
    const err = bad.map(([q, why]) => ({ jsonrpc: '2.0', id: q?.id ?? null, error: { code: -32601, message: why } }));
    return res.status(200).json(Array.isArray(b) ? err : err[0]);
  }
  try {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b), signal: AbortSignal.timeout(15000) });
    res.status(r.status).setHeader('content-type', 'application/json');
    res.send(await r.text());
  } catch (e) {
    res.status(502).json({ jsonrpc: '2.0', id: Array.isArray(b) ? null : b?.id ?? null, error: { code: -32603, message: String(e.message || e) } });
  }
}
