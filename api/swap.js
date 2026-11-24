// Vercel serverless proxy for Base DEX Aggregators (KyberSwap + Odos fallback).
// Strips browser Origin/Referer headers so upstream Cloudflare/CORS never blocks swaps.
const KYBER_BASE = 'https://aggregator-api.kyberswap.com/base/api/v1';
const ODOS_BASE = 'https://api.odos.xyz/sor';
const CLIENT_ID = 'BaseCity';

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

// Only BaseCity's own pages may use this relay (it spends our quota with three aggregators), with a size cap and a
// per-IP rate limit. Calls with no browser Origin (scripts, curl) are refused.
export const deps = { now: () => Date.now() };
const HOSTS = [/^(www\.)?basecity\.space$/, /^localhost$/, /^127\.0\.0\.1$/, /^blocky-game[a-z0-9-]*\.vercel\.app$/];
export function originAllowed(req) {
  const o = String(req.headers?.origin || req.headers?.referer || '');
  if (!o) return false;
  try { const h = new URL(o).hostname; return HOSTS.some((re) => re.test(h)); } catch { return false; }
}
const hits = new Map();
export function rateLimited(ip, now) {
  const w = hits.get(ip)?.filter((t) => now - t < 60000) || [];
  w.push(now); hits.set(ip, w);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60000)) hits.delete(k);
  return w.length > 90;
}
const MAX_BODY = 20000;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!originAllowed(req)) return res.status(403).json({ error: 'The swap relay only serves BaseCity pages.' });
  const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip, deps.now())) return res.status(429).json({ error: 'Too many swap requests. Try again in a minute.' });
  if (req.method === 'POST' && JSON.stringify(parseBody(req)).length > MAX_BODY) return res.status(413).json({ error: 'Request too large.' });
  try {
    const u = new URL(req.url, 'http://x');
    const dex = u.searchParams.get('dex') || 'kyber';

    if (dex === 'relay') {
      const relayUrl = `${KYBER_BASE.slice(0, 8)}api.relay.link/quote`;
      const upstream = await fetch(relayUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(parseBody(req)),
      });
      const text = await upstream.text();
      res.setHeader('content-type', 'application/json');
      return res.status(upstream.status).send(text);
    }

    if (dex === 'odos') {
      const action = u.searchParams.get('action') === 'assemble' ? 'assemble' : 'quote/v2';
      const upstream = await fetch(`${ODOS_BASE}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(parseBody(req)),
      });
      const text = await upstream.text();
      res.setHeader('content-type', 'application/json');
      return res.status(upstream.status).send(text);
    }

    if (req.method === 'GET') {
      u.searchParams.delete('dex');
      const upstream = await fetch(`${KYBER_BASE}/routes?${u.searchParams.toString()}`, {
        headers: { 'x-client-id': CLIENT_ID, accept: 'application/json' },
      });
      const text = await upstream.text();
      res.setHeader('content-type', 'application/json');
      return res.status(upstream.status).send(text);
    }
    if (req.method === 'POST') {
      const upstream = await fetch(`${KYBER_BASE}/route/build`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-client-id': CLIENT_ID, accept: 'application/json' },
        body: JSON.stringify(parseBody(req)),
      });
      const text = await upstream.text();
      res.setHeader('content-type', 'application/json');
      return res.status(upstream.status).send(text);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'Swap aggregator unavailable' });
  }
}
