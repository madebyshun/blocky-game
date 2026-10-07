// The BaseCity Blockies market for the claim page (api/claim.js): the floor and every live listing
// on OpenSea (OPENSEA_API_KEY; the collection's slug: OPENSEA_SLUG or nft.openseaSlug in
// src/config.js), and the price of ETH (GeckoTerminal, WETH on Base). Cached for a few minutes;
// anything that can't be read comes back null, and the page falls back to fixed suggestions.
import { env } from './_store.js';
import { CONFIG } from '../src/config.js';

const KEY = env.OPENSEA_API_KEY || '';
const SLUG = env.OPENSEA_SLUG || CONFIG.nft.openseaSlug || '';
const WETH = '0x4200000000000000000000000000000000000006';
const TTL = 5 * 60 * 1000;
const PAGES = 5; // up to 500 listings
let cache = null;

async function json(url, headers = {}) {
  const res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`);
  return res.json();
}

async function ethUsd() {
  const j = await json(`https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${WETH}`);
  const p = Number(j?.data?.attributes?.token_prices?.[WETH]);
  return p > 0 ? p : null;
}

const os = (path) => json(`https://api.opensea.io/api/v2/${path}`, { 'x-api-key': KEY });

async function floor() {
  const j = await os(`collections/${SLUG}/stats`);
  const f = Number(j?.total?.floor_price);
  return f > 0 && (j.total.floor_price_symbol || 'ETH').toUpperCase().endsWith('ETH') ? f : null;
}

// Every live listing: { [tokenId]: { eth, maker } }, the cheapest one per token.
export function parseListings(list, contract) {
  const out = {};
  for (const l of list || []) {
    const p = l?.protocol_data?.parameters, item = p?.offer?.[0], cur = l?.price?.current;
    if (!item || !cur || (contract && String(item.token).toLowerCase() !== contract.toLowerCase())) continue;
    if (!/ETH$/i.test(cur.currency || 'ETH')) continue;
    const id = Number(item.identifierOrCriteria), eth = Number(cur.value) / 10 ** (cur.decimals ?? 18) / Math.max(1, Number(item.startAmount) || 1);
    if (!Number.isFinite(id) || !(eth > 0)) continue;
    if (!out[id] || eth < out[id].eth) out[id] = { eth, maker: String(p.offerer || '').toLowerCase() };
  }
  return out;
}

// The best collection offer, per Blocky (ETH or WETH): what a holder can sell one for right now.
export function parseTopOffer(list) {
  let best = null;
  for (const o of list || []) {
    const cur = o?.price;
    const qty = Number(o?.remaining_quantity ?? o?.protocol_data?.parameters?.consideration?.[0]?.startAmount ?? 1) || 1;
    if (!cur || !/ETH$/i.test(cur.currency || '')) continue;
    const eth = Number(cur.value) / 10 ** (cur.decimals ?? 18) / qty;
    if (eth > 0 && (best == null || eth > best)) best = eth;
  }
  return best;
}
const topOffer = async () => parseTopOffer((await os(`offers/collection/${SLUG}`))?.offers);

async function listings(contract) {
  const all = [];
  let next = '';
  for (let i = 0; i < PAGES; i++) {
    const j = await os(`listings/collection/${SLUG}/all?limit=100${next ? `&next=${encodeURIComponent(next)}` : ''}`);
    all.push(...(j?.listings || []));
    if (!j?.next) break;
    next = j.next;
  }
  return parseListings(all, contract);
}

// { floor, topOffer, ethUsd, listings, at }: each part null if it couldn't be read.
export async function getMarket(contract) {
  if (cache && Date.now() - cache.at < TTL) return cache;
  const ok = KEY && SLUG;
  const [f, e, l, o] = await Promise.allSettled([ok ? floor() : null, ethUsd(), ok ? listings(contract) : null, ok ? topOffer() : null]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  for (const r of [f, e, l, o]) if (r.status === 'rejected') console.warn('[market]', r.reason?.message || r.reason);
  cache = { floor: val(f), topOffer: val(o), ethUsd: val(e), listings: val(l), at: Date.now() };
  return cache;
}
