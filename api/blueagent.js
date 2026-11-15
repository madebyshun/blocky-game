// Blue Agent's x402 API (https://blueagent.dev), called by api/agent.js. Nothing here holds a key or
// pays: the owner's wallet signs the x402 X-PAYMENT header and this only forwards it.
//
// The tool names in the original brief (`stock_signal`, `stock_quote`) don't exist on the server; the
// live catalogue's names are used instead (blueagent.dev/.well-known/openapi.json):
//   base-stock-quote   $0.02  { ticker }  pool price, 24 h change, liquidity, volume, oracle vs pool drift
//   stock-screen       $0.02  { … }       every Base stock screened against drift / liquidity thresholds
//   base-stock-movers  $0.03  { … }       the tokenized stocks moving most on Base now
// A 402 answer carries { accepts: [{ scheme: 'exact', network: 'eip155:8453', asset, amount, payTo }] };
// `amount` is atomic USDC (6 dp), so 20000 = $0.02. Prose in Blue Agent's docs says failed runs are not
// charged, but nothing in the schema enforces it: a paid run counts as earned only when the call returns 200.

export const BLUE_BASE = 'https://blueagent.dev';

// job id (src/blockyagent.js AGENT_JOBS) -> how to call it
export const JOB_SPECS = {
  'nvda-quote': { path: '/api/x402/base-stock-quote', price: 0.02, body: () => ({ ticker: 'NVDAc' }) },
  'nvda-screen': { path: '/api/x402/stock-screen', price: 0.02, body: (a) => ({ max_abs_drift_pct: String(a?.maxAbsDriftPct ?? 1), min_liquidity_usd: String(a?.minLiquidityUsd ?? 10000), limit: String(a?.limit ?? 20) }) },
  'stock-movers': { path: '/api/x402/base-stock-movers', price: 0.03, body: (a) => ({ limit: String(a?.limit ?? 10), min_liquidity_usd: String(a?.minLiquidityUsd ?? 10000) }) },
};

// Shape Blue Agent's answer into something a card can show: a string when it sends one, otherwise the
// JSON as-is (the UI prints it).
export function tidy(body) {
  if (!body || typeof body !== 'object') return body;
  if (typeof body.result === 'string') return body.result;
  return body;
}

// One call. Returns { ok: true, body } | { ok: false, status, body } | { ok: false, status: 402, body }.
// `payment` is the base64 PAYMENT-SIGNATURE payload the owner's wallet signed (src/x402.js). x402 v2
// names the header PAYMENT-SIGNATURE (specs/transports-v2/http.md); X-PAYMENT is the older name and is
// still sent so either side of the rollout works.
export async function callBlue(spec, args = {}, payment = null, { fetchImpl = fetch, base = BLUE_BASE, timeout = 20000 } = {}) {
  const headers = { accept: 'application/json', 'content-type': 'application/json' };
  if (payment) { headers['payment-signature'] = payment; headers['x-payment'] = payment; }
  try {
    const r = await fetchImpl(`${base}${spec.path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(spec.body(args)),
      signal: AbortSignal.timeout(timeout),
    });
    const text = await r.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = { result: text.slice(0, 4000) }; }
    if (r.status === 402) return { ok: false, status: 402, body };
    if (!r.ok) return { ok: false, status: r.status, body, error: `Blue Agent answered ${r.status}` };
    // a paid call settles on chain: Blue Agent reports it in `_settle`, and x402 v2 also puts a
    // base64 PaymentResponse in a header. Either one saying success is the settlement.
    const settled = body?._settle?.tx || decodeSettlement(r.headers?.get?.('payment-response') || r.headers?.get?.('x-payment-response'));
    return { ok: true, status: r.status, body: { ...(body || {}), paid: Boolean(settled), settle: settled || null } };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e).slice(0, 200) };
  }
}

// The settlement details a 200 carries, from either the body or the PAYMENT-RESPONSE header.
export function decodeSettlement(headerValue) {
  if (!headerValue) return null;
  try { const j = JSON.parse(Buffer.from(headerValue, 'base64').toString('utf8')); return j?.success ? (j.transaction || true) : null; } catch { return null; }
}

// The price an x402 402 answer asks for, in USDC, for the UI to show before the wallet signs.
export const priceOf = (body) => {
  const a = body?.accepts?.[0];
  return a?.amount ? Number(a.amount) / 1e6 : null;
};
