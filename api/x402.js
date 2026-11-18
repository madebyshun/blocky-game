// Vercel serverless function: a Blocky sells its stock research as an x402 service (x402 v2, "exact"
// scheme, USDC on Base). Any agent or person can call it, pay a fixed price per call, and get the answer
// at once. The USDC goes straight from the caller's wallet to the Blocky owner's wallet: the payment is
// verified and settled by Coinbase's CDP x402 facilitator, and BaseCity never holds funds or keys.
//
//   GET  /api/x402                          the catalog: tools, prices, inputs (machine-readable)
//   POST /api/x402?tool=<id>&blocky=<n>     body { ticker } -> 402 challenge, or the result once paid
//
// Only a Blocky whose agent is on (api/agent.js) sells; the owner is read from chain on every call, so a
// sold NFT stops paying its old owner. Sales are counted per Blocky (soldCalls, soldUsdc) for the P&L.
// Payment is charged only when the research succeeded: research runs first, settle happens after.
import { createFacilitatorConfig } from '@coinbase/x402';
import { client, NFT, useKv, kv, KEY_BASE } from './_store.js';
import { researchStock } from './_worker-stock.js';
import { recordWork } from './_workfeed.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const NETWORK = 'eip155:8453';
const AGENT_KEY = `${KEY_BASE}:agent:v1`;
const OWNER_ABI = [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] }];

// task-named tools, priced per call (USDC, 6 decimals)
export const TOOLS = {
  'nav-premium': { skill: 'stock-nav-premium', priceUnits: 20000, task: 'How far a tokenized stock on Base trades from its Chainlink NAV, pool and oracle read at one block' },
  'after-hours-volume': { skill: 'stock-after-hours-volume', priceUnits: 10000, task: "A tokenized stock's on-chain volume on Base over 24h and 7d, and how much ran while NYSE was shut" },
  'weekend-gap': { skill: 'stock-weekend-gap', priceUnits: 10000, task: "How far a tokenized stock's Base DEX price moved over the weekend vs Friday's NYSE close (weekends only)" },
};
const INPUT = { type: 'object', properties: { ticker: { type: 'string', description: 'Ticker without the "c" suffix, e.g. NVDA' } }, required: ['ticker'] };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));

export function requirement(tool, payTo, resource) {
  const t = TOOLS[tool];
  return { scheme: 'exact', network: NETWORK, asset: USDC, amount: String(t.priceUnits), payTo, maxTimeoutSeconds: 120, extra: { name: 'USD Coin', version: '2' }, resource };
}
export function challenge(tool, payTo, resource, error = 'Payment Required') {
  return {
    x402Version: 2, error,
    resource: { url: resource, description: TOOLS[tool].task, mimeType: 'application/json', serviceName: 'BaseCity Blocky' },
    accepts: [requirement(tool, payTo, resource)],
    tool: { id: tool, price: `$${(TOOLS[tool].priceUnits / 1e6).toFixed(2)}`, input: INPUT },
    // x402 v2 discovery ("bazaar" extension): lets the CDP facilitator list this route in the x402 Bazaar
    // under the Blocky owner's payTo once a call settles
    extensions: { bazaar: {
      info: { input: { type: 'http', method: 'POST', bodyType: 'json', body: { ticker: 'NVDA' } }, output: { type: 'json', example: { blocky: 718, tool, ticker: 'NVDA', preview: '…', result: '…', paid: { tx: '0x…', amountUnits: TOOLS[tool].priceUnits } } } },
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { input: { type: 'object', properties: { type: { const: 'http' }, method: { const: 'POST' }, bodyType: { const: 'json' }, body: INPUT }, required: ['type', 'method', 'body'] } }, required: ['input'] },
    } },
  };
}

async function agentEntry(tokenId) {
  if (!useKv()) return null;
  try { return JSON.parse((await kv('HGET', AGENT_KEY, String(tokenId))) || 'null'); } catch { return null; }
}
async function recordSale(tokenId, units) {
  if (!useKv()) return;
  const e = (await agentEntry(tokenId)) || {};
  e.soldCalls = (e.soldCalls || 0) + 1;
  e.soldUsdc = Math.round(((e.soldUsdc || 0) + units / 1e6) * 1e6) / 1e6;
  e.lastSaleAt = Date.now();
  await kv('HSET', AGENT_KEY, String(tokenId), JSON.stringify(e));
}

async function facilitatorCall(path, body, fetchImpl = fetch) {
  const f = createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET);
  const headers = { 'content-type': 'application/json', ...((await f.createAuthHeaders?.())?.[path] || {}) };
  const r = await fetchImpl(`${f.url}/${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.errorMessage || j.error || `Facilitator ${path} HTTP ${r.status}`);
  return j;
}

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, payment-signature, x-payment');
  res.setHeader('access-control-expose-headers', 'payment-response, payment-required');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const base = `https://${req.headers.host || 'www.basecity.space'}/api/x402`;

  if (req.method === 'GET' && !req.query.tool) {
    return res.status(200).json({
      service: 'BaseCity Blocky research', network: NETWORK, asset: USDC, payment: 'x402 v2 exact (EIP-3009), settled by the CDP facilitator; USDC goes to the Blocky owner',
      call: 'POST /api/x402?tool=<id>&blocky=<tokenId> with JSON { ticker }', chargedOnlyOnSuccess: true,
      tools: Object.entries(TOOLS).map(([id, t]) => ({ id, task: t.task, priceUsd: t.priceUnits / 1e6, input: INPUT })),
      note: 'Research only, not financial advice. Coinbase tokenized stocks are not offered to U.S. persons.',
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });

  const tool = String(req.query.tool || '');
  let tokenId = String(req.query.blocky || '');
  // blocky=any: the city picks an on-duty Blocky (fewest calls sold so far), so a caller needs no number
  if (tokenId === 'any' && useKv()) {
    const flat = (await kv('HGETALL', AGENT_KEY)) || [], on = [];
    for (let i = 0; i < flat.length; i += 2) { try { const e = JSON.parse(flat[i + 1]); if (e?.active) on.push([flat[i], e.soldCalls || 0]); } catch { /* skip */ } }
    on.sort((a, b) => a[1] - b[1] || Number(a[0]) - Number(b[0]));
    if (!on.length) return res.status(404).json({ error: 'agent_off', message: 'No Blocky is on duty right now' });
    // the same Blocky for the 402 and the paid retry: the resource URL carries its number
    tokenId = on[0][0];
  }
  if (!TOOLS[tool]) return res.status(404).json({ error: 'unknown_tool', tools: Object.keys(TOOLS) });
  if (!/^\d{1,5}$/.test(tokenId) || !NFT) return res.status(400).json({ error: 'invalid_blocky' });
  const entry = await agentEntry(tokenId);
  if (!entry?.active) return res.status(404).json({ error: 'agent_off', message: `Blocky #${tokenId} has not switched its agent on` });
  let payTo;
  try { payTo = await client.readContract({ address: NFT, abi: OWNER_ABI, functionName: 'ownerOf', args: [BigInt(tokenId)] }); }
  catch { return res.status(404).json({ error: 'invalid_blocky' }); }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const ticker = String(body.ticker || '').trim().replace(/c$/, '').toUpperCase(); // NVDAc -> NVDA
  if (!/^[A-Z]{1,6}$/.test(ticker)) return res.status(400).json({ error: 'invalid_ticker' });
  const resource = `${base}?tool=${tool}&blocky=${tokenId}`;
  const header = req.headers['payment-signature'] || req.headers['x-payment'];
  if (!header) { res.setHeader('payment-required', b64(challenge(tool, payTo, resource))); return res.status(402).json(challenge(tool, payTo, resource)); }

  let paymentPayload;
  try { paymentPayload = unb64(header); } catch { return res.status(402).json(challenge(tool, payTo, resource, 'invalid_payment_header')); }
  const paymentRequirements = requirement(tool, payTo, resource);
  // the Bazaar learns a route from what reaches the facilitator: the payload's resource and extensions.
  // Not every client echoes them back from the 402, so the server fills in what it advertised.
  const offer = challenge(tool, payTo, resource);
  paymentPayload = { ...paymentPayload, resource: paymentPayload.resource || offer.resource, extensions: { ...(offer.extensions || {}), ...(paymentPayload.extensions || {}) } };
  try {
    const v = await facilitatorCall('verify', { x402Version: 2, paymentPayload, paymentRequirements });
    if (!v.isValid) return res.status(402).json(challenge(tool, payTo, resource, v.invalidReason || 'payment_invalid'));
  } catch (e) { return res.status(503).json({ error: 'facilitator_unavailable', message: String(e.message).slice(0, 200) }); }

  // research first: a failed answer is never charged
  let report;
  try { report = await researchStock({ brief: `Ticker: ${ticker}`, contract: { skill: TOOLS[tool].skill, inputs: { ticker } } }, { client }); }
  catch (e) { return res.status(422).json({ error: 'insufficient_data', message: String(e.message).slice(0, 300), charged: false }); }

  let settle;
  try { settle = await facilitatorCall('settle', { x402Version: 2, paymentPayload, paymentRequirements }); }
  catch (e) { return res.status(503).json({ error: 'settle_failed', message: String(e.message).slice(0, 200), charged: false }); }
  if (!settle.success) return res.status(402).json(challenge(tool, payTo, resource, settle.errorReason || 'settle_failed'));
  await recordSale(tokenId, TOOLS[tool].priceUnits).catch(() => {});
  await recordWork({ kind: 'x402-sale', blocky: tokenId, usd: TOOLS[tool].priceUnits / 1e6, tx: settle.transaction, tool, ticker }).catch(() => {});
  res.setHeader('payment-response', b64(settle));
  return res.status(200).json({ blocky: Number(tokenId), tool, ticker, preview: report.preview, result: report.result, evidence: report.evidence, paid: { tx: settle.transaction, payTo, amountUnits: TOOLS[tool].priceUnits } });
}
