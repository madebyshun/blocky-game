// Coinbase CDP x402 facilitator: verify a signed payment and settle it on Base. Shared by /api/x402 and /api/stock-intel.
import { createFacilitatorConfig } from '@coinbase/x402';

export async function facilitatorCall(path, body, fetchImpl = fetch) {
  const f = createFacilitatorConfig(process.env.CDP_API_KEY_ID, process.env.CDP_API_KEY_SECRET);
  const headers = { 'content-type': 'application/json', ...((await f.createAuthHeaders?.())?.[path] || {}) };
  const r = await fetchImpl(`${f.url}/${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.errorMessage || j.error || `Facilitator ${path} HTTP ${r.status}`);
  return j;
}
