// Vercel serverless function: a Blocky sells its stock research as an x402 service (x402 v2, "exact"
// scheme, USDC on Base). Any agent or person can call it, pay a fixed price per call, and get the answer
// at once. The USDC goes straight from the caller's wallet to the Blocky owner's wallet: the payment is
// verified and settled by Coinbase's CDP x402 facilitator, and BaseCity never holds funds or keys.
//
//   GET  /api/x402                          the catalog: tools, prices, inputs (machine-readable)
//   POST /api/x402?tool=<id>&blocky=<n|any> body { <input> } -> 402 challenge, or the result once paid
//   GET  /api/x402?blocky=<n>               one Blocky's profile: guild, skills, level, its prices
// Each Blocky sells only its own skills (src/skills.js: guild from Role, tier from Rarity, level from paid work).
//
// Only a Blocky whose agent is on (api/agent.js) sells; the owner is read from chain on every call, so a
// sold NFT stops paying its old owner. Sales are counted per Blocky (soldCalls, soldUsdc) for the P&L.
// Payment is charged only when the research succeeded: research runs first, settle happens after.
import { facilitatorCall } from './_facilitator.js';
import { client, NFT, useKv, kv, KEY_BASE } from './_store.js';
import { runSkill } from './_skills.js';
import { SKILLS, INPUTS, inputSchema, priceUnits } from '../src/skills.js';
import { profileFor, payToFor } from './_profile.js';
import { recordWork } from './_workfeed.js';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const NETWORK = 'eip155:8453';
const AGENT_KEY = `${KEY_BASE}:agent:v1`;
const OWNER_ABI = [{ type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'address' }] }];

// every skill, at its base price (USDC, 6 decimals); a Blocky's own price can be higher (its level)
export const TOOLS = Object.fromEntries(Object.entries(SKILLS).map(([id, k]) => [id, { skill: id, priceUnits: k.units, task: k.task, guild: k.guild }]));
// the three stock tools on every Blocky: only while STRICT is off (STRICT_SKILLS=0)
const LEGACY = new Set(['nav-premium', 'after-hours-volume', 'weekend-gap']);
const STRICT = process.env.STRICT_SKILLS !== '0'; // on since Blue Agent reads skills per Blocky (blue-agent #577); STRICT_SKILLS=0 reopens the stock tools

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
const unb64 = (s) => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));

export function requirement(tool, payTo, resource, units = TOOLS[tool].priceUnits) {
  return { scheme: 'exact', network: NETWORK, asset: USDC, amount: String(units), payTo, maxTimeoutSeconds: 120, extra: { name: 'USD Coin', version: '2' }, resource };
}
export function challenge(tool, payTo, resource, error = 'Payment Required', units = TOOLS[tool].priceUnits) {
  const INPUT = inputSchema(tool), k = SKILLS[tool].input, example = k ? { [k]: INPUTS[k].example } : {};
  return {
    x402Version: 2, error,
    resource: { url: resource, description: TOOLS[tool].task, mimeType: 'application/json', serviceName: 'BaseCity Blocky' },
    accepts: [requirement(tool, payTo, resource, units)],
    tool: { id: tool, price: `$${(units / 1e6).toFixed(3).replace(/0$/, '')}`, input: INPUT },
    // x402 v2 discovery ("bazaar" extension): lets the CDP facilitator list this route in the x402 Bazaar
    // under the Blocky owner's payTo once a call settles
    extensions: { bazaar: {
      info: { input: { type: 'http', method: 'POST', bodyType: 'json', body: example }, output: { type: 'json', example: { blocky: 718, tool, input: example, preview: '…', result: '…', paid: { tx: '0x…', amountUnits: units } } } },
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

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, payment-signature, x-payment');
  res.setHeader('access-control-expose-headers', 'payment-response, payment-required');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const base = `https://${req.headers.host || 'www.basecity.space'}/api/x402`;

  if (req.method === 'GET' && req.query.blocky && /^\d{1,5}$/.test(String(req.query.blocky))) {
    const p = await profileFor(String(req.query.blocky));
    return res.status(200).json({ ...p, prices: Object.fromEntries(p.skills.map((s) => [s, priceUnits(s, p, p.mult) / 1e6])) });
  }
  if (req.method === 'GET' && !req.query.tool) {
    return res.status(200).json({
      service: 'BaseCity Blocky research', network: NETWORK, asset: USDC, payment: 'x402 v2 exact (EIP-3009), settled by the CDP facilitator; USDC goes to the Blocky owner',
      call: 'POST /api/x402?tool=<id>&blocky=<tokenId|any> with the JSON input below', chargedOnlyOnSuccess: true,
      specialization: 'Each Blocky sells only its own skills: guild from its Role, how many from its Rarity, price cap from its level. GET /api/x402?blocky=<n> for one Blocky.',
      tools: Object.entries(TOOLS).map(([id, t]) => ({ id, guild: t.guild, task: t.task, priceUsd: t.priceUnits / 1e6, input: inputSchema(id) })),
      note: 'Research only, not financial advice. Coinbase tokenized stocks are not offered to U.S. persons.',
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST' });

  const tool = String(req.query.tool || '');
  let tokenId = String(req.query.blocky || '');
  // blocky=any: the city picks an on-duty Blocky (fewest calls sold so far), so a caller needs no number
  if (tokenId === 'any' && useKv()) {
    if (!TOOLS[tool]) return res.status(404).json({ error: 'unknown_tool', tools: Object.keys(TOOLS) });
    const flat = (await kv('HGETALL', AGENT_KEY)) || [], on = [];
    for (let i = 0; i < flat.length; i += 2) { try { const e = JSON.parse(flat[i + 1]); if (e?.active) on.push([flat[i], e.soldCalls || 0]); } catch { /* skip */ } }
    // the Blockies that know this skill, highest level first, then the least busy
    const cand = [];
    for (const [n, calls] of on.sort((a, b) => a[1] - b[1]).slice(0, 80)) { const p = await profileFor(n).catch(() => null); if (p?.skills.includes(tool)) cand.push([n, p.level, calls]); if (cand.length >= 12) break; }
    cand.sort((a, b) => b[1] - a[1] || a[2] - b[2] || Number(a[0]) - Number(b[0]));
    if (!cand.length && !(LEGACY.has(tool) && !STRICT && on.length)) return res.status(404).json({ error: 'agent_off', message: `No on-duty Blocky knows ${tool} right now` });
    // the same Blocky for the 402 and the paid retry: the resource URL carries its number
    tokenId = cand.length ? cand[0][0] : on[0][0];
  }
  if (!TOOLS[tool]) return res.status(404).json({ error: 'unknown_tool', tools: Object.keys(TOOLS) });
  if (!/^\d{1,5}$/.test(tokenId) || !NFT) return res.status(400).json({ error: 'invalid_blocky' });
  const entry = await agentEntry(tokenId);
  if (!entry?.active) return res.status(404).json({ error: 'agent_off', message: `Blocky #${tokenId} has not switched its agent on` });
  let payTo;
  try { payTo = await client.readContract({ address: NFT, abi: OWNER_ABI, functionName: 'ownerOf', args: [BigInt(tokenId)] }); }
  catch { return res.status(404).json({ error: 'invalid_blocky' }); }

  const profile = await profileFor(tokenId).catch(() => null);
  if (!profile) return res.status(503).json({ error: 'profile_unavailable' });
  const ownerAddr = payTo; payTo = payToFor(ownerAddr, profile.payout); // a signed payout wallet, while its signer owns the Blocky
  const knows = profile.skills.includes(tool) || (LEGACY.has(tool) && !STRICT);
  if (!knows) return res.status(404).json({ error: 'not_this_blockys_skill', message: `Blocky #${tokenId} (${profile.guild} guild) sells: ${profile.skills.join(', ')}`, skills: profile.skills, any: `${base}?tool=${tool}&blocky=any` });
  const units = priceUnits(tool, profile, profile.mult);
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const key = SKILLS[tool].input, input = {};
  if (key) {
    let v = String(body[key] ?? '').trim();
    if (key === 'ticker') v = v.replace(/c$/, '').toUpperCase(); // NVDAc -> NVDA
    // a token given by symbol ("AX1"): resolve it on Base when exactly one token has that symbol, else list them
    if (key === 'token' && v && !INPUTS.token.test(v) && /^\$?[A-Za-z0-9]{1,15}$/.test(v)) {
      const sym = v.replace(/^\$/, '').toUpperCase();
      const found = await fetch(`https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(sym)}&network=base`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
      const cands = [...new Map((found?.data || []).filter((p) => (p.attributes?.name || '').split(' / ')[0].toUpperCase() === sym).map((p) => { const a = p.relationships.base_token.data.id.replace('base_', ''); return [a.toLowerCase(), { token: a, pool: p.attributes.name, liquidityUsd: Math.round(Number(p.attributes.reserve_in_usd) || 0) }]; })).values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd);
      if (cands.length === 1) v = cands[0].token;
      else if (cands.length > 1) return res.status(400).json({ error: 'ambiguous_token', message: `${cands.length} tokens on Base are called ${sym}. Send the contract address of the one you mean, e.g. {"token":"${cands[0].token}"} (${cands[0].pool}, $${cands[0].liquidityUsd.toLocaleString('en-US')} liquidity). Nothing was charged.`, candidates: cands.slice(0, 5), example: { token: cands[0].token } });
    }
    if (!INPUTS[key].test(v)) return res.status(400).json({ error: `invalid_${key}`, message: `${v ? 'Not a valid' : 'Missing'} ${key}: send ${JSON.stringify({ [key]: INPUTS[key].example })} (${INPUTS[key].description}). Nothing was charged.`, expected: inputSchema(tool), example: { [key]: INPUTS[key].example } });
    input[key] = v;
  }
  const ticker = input.ticker || null;
  const resource = `${base}?tool=${tool}&blocky=${tokenId}`;
  const header = req.headers['payment-signature'] || req.headers['x-payment'];
  if (!header) { const c = challenge(tool, payTo, resource, 'Payment Required', units); res.setHeader('payment-required', b64(c)); return res.status(402).json(c); }

  let paymentPayload;
  try { paymentPayload = unb64(header); } catch { return res.status(402).json(challenge(tool, payTo, resource, 'invalid_payment_header', units)); }
  const paymentRequirements = requirement(tool, payTo, resource, units);
  // the Bazaar learns a route from what reaches the facilitator: the payload's resource and extensions.
  // Not every client echoes them back from the 402, so the server fills in what it advertised.
  const offer = challenge(tool, payTo, resource, 'Payment Required', units);
  paymentPayload = { ...paymentPayload, resource: paymentPayload.resource || offer.resource, extensions: { ...(offer.extensions || {}), ...(paymentPayload.extensions || {}) } };
  try {
    const v = await facilitatorCall('verify', { x402Version: 2, paymentPayload, paymentRequirements });
    if (!v.isValid) return res.status(402).json(challenge(tool, payTo, resource, v.invalidReason || 'payment_invalid', units));
  } catch (e) { return res.status(503).json({ error: 'facilitator_unavailable', message: String(e.message).slice(0, 200) }); }

  // research first: a failed answer is never charged
  let report;
  try { report = await runSkill(tool, input, { client, blocky: tokenId }); }
  catch (e) { return res.status(422).json({ error: 'insufficient_data', message: String(e.message).slice(0, 300), charged: false }); }

  let settle;
  try { settle = await facilitatorCall('settle', { x402Version: 2, paymentPayload, paymentRequirements }); }
  catch (e) { return res.status(503).json({ error: 'settle_failed', message: String(e.message).slice(0, 200), charged: false }); }
  if (!settle.success) return res.status(402).json(challenge(tool, payTo, resource, settle.errorReason || 'settle_failed', units));
  await recordSale(tokenId, units).catch(() => {});
  await recordWork({ kind: 'x402-sale', blocky: tokenId, usd: units / 1e6, tx: settle.transaction, tool, ticker, guild: profile.guild, payer: settle.payer || paymentPayload?.payload?.authorization?.from || null }).catch(() => {});
  res.setHeader('payment-response', b64(settle));
  return res.status(200).json({ blocky: Number(tokenId), guild: profile.guild, level: profile.level, tool, input, ticker, preview: report.preview, result: report.result, ...(report.contentType ? { contentType: report.contentType } : {}), evidence: report.evidence, paid: { tx: settle.transaction, payTo, amountUnits: units } });
}
