// Vercel serverless proxy for Base DEX Aggregators (KyberSwap + Odos fallback).
// Strips browser Origin/Referer headers so upstream Cloudflare/CORS never blocks swaps.
const KYBER_BASE = 'https://aggregator-api.kyberswap.com/base/api/v1';
const ODOS_BASE = 'https://api.odos.xyz/sor';
const CLIENT_ID = 'BaseCity';

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
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
