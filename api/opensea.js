// Vercel serverless function: the OpenSea API for the claim page's "List on OpenSea" (src/listing.js),
// with BaseCity's key (OPENSEA_API_KEY) added here so it never reaches the browser. Only what a
// listing of a BaseCity Blocky needs gets through: reading a Blocky, the collection and a payment
// token, and posting a Seaport listing whose item is a BaseCity Blocky. The wallet signs the listing;
// this only relays it. Reached at /api/os/<OpenSea path> (vercel.json).
import { env, NFT } from './_store.js';
import { CONFIG } from '../src/config.js';

const KEY = env.OPENSEA_API_KEY || '';
const SLUG = env.OPENSEA_SLUG || CONFIG.nft.openseaSlug || '';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GETS = [
  new RegExp(`^api/v2/chain/base/contract/${esc(NFT)}/nfts/\\d{1,6}$`, 'i'),
  new RegExp(`^api/v2/collections/${esc(SLUG)}(/stats)?$`),
  /^api\/v2\/chain\/base\/payment_token\/0x[0-9a-f]{40}$/i,
];
const POST = /^api\/v2\/orders\/base\/seaport\/listings$/;

// a Seaport listing that sells BaseCity Blockies (ERC-721 items of our contract) and nothing else
export function blockyListing(body) {
  const offer = body?.parameters?.offer;
  return Array.isArray(offer) && offer.length > 0 && offer.every((o) => String(o?.token).toLowerCase() === NFT.toLowerCase() && [2, 4].includes(Number(o?.itemType)));
}

function body(req) {
  if (typeof req.body !== 'string') return req.body || null;
  try { return JSON.parse(req.body); } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!KEY || !NFT || !SLUG) return res.status(503).json({ error: 'Listing from BaseCity is not set up yet: list on OpenSea' });
  const url = new URL(req.url, 'http://x');
  const path = String(req.query?.p ?? url.searchParams.get('p') ?? '').replace(/^\/+/, '');
  const qs = new URLSearchParams(url.searchParams);
  qs.delete('p');
  let payload;
  if (req.method === 'GET' && GETS.some((r) => r.test(path))) payload = undefined;
  else if (req.method === 'POST' && POST.test(path)) {
    const b = body(req);
    if (!blockyListing(b)) return res.status(400).json({ error: 'Only BaseCity Blockies can be listed here' });
    payload = JSON.stringify(b);
  } else return res.status(404).json({ error: 'Not available here' });
  try {
    const r = await fetch(`https://api.opensea.io/${path}${[...qs].length ? `?${qs}` : ''}`, {
      method: req.method,
      headers: { 'x-api-key': KEY, accept: 'application/json', ...(payload ? { 'content-type': 'application/json' } : {}) },
      body: payload,
      signal: AbortSignal.timeout(15000),
    });
    res.status(r.status).setHeader('content-type', r.headers.get('content-type') || 'application/json');
    res.send(await r.text());
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
