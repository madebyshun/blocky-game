// Vercel serverless function: metadata and images of the BaseCity Blockies NFTs (ERC-721 on Base).
//   GET /api/nft/206             token metadata: tokenURI(206) = baseURI + "206", baseURI = SITE_URL/api/nft/
//   GET /api/nft/206.svg         the Blocky's portrait (fixed once it exists: cached for a year)
//   GET /api/nft/collection      collection metadata (the contract's contractURI)
//   GET /api/nft/collection.svg  the collection's picture
// Everything comes from the Blocky ledger (api/colony.js keeps it up to date), so the metadata says
// what the city shows: rarity, look, status (newcomer, citizen, gone) and the blocks each Blocky has
// placed so far. Only citizens are ever minted; the site shows the others too.

import { CONFIG, holdText } from '../../src/config.js';
import { cityCrew, makeBlocky, makeFounder, CitySim, TRAIT_LABEL } from '../../src/sim.js';
import { blockySvg } from '../../src/voxel-svg.js';
import { loadLedger, LEDGER, SITE, RESERVE } from '../_store.js';

const NFT = CONFIG.nft;
const TREASURY = process.env.TREASURY_ADDRESS || NFT.treasury;
const ROYALTY_BPS = Number(process.env.ROYALTY_BPS || NFT.royaltyBps);

// one replay of the city per minute per instance: every Blocky's arrival, departure and blocks
let cache = null;
async function city() {
  if (cache && Date.now() - cache.at < 60000) return cache;
  const { ledger: L } = await loadLedger();
  const start = L.start;
  const crew = cityCrew(start);
  const blockies = L.blockies.map(([wi, s, left, seed], i) => {
    const b = makeBlocky(i + 1, start + s * 1000, L.wallets[wi], seed ?? null);
    if (left != null) b.leftAt = Math.max(b.arrivedAt, start + left * 1000);
    return b;
  });
  const sim = new CitySim(start);
  sim.setCrew([...crew, ...blockies], L.whales || []);
  cache = { at: Date.now(), blockies, sim, openedAt: L.openedAt ?? Infinity };
  return cache;
}

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'a buyer');
const siteOf = (req) => SITE || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
const plain = (b) => b.name.replace(/ #\d+$/, '');

function metadata(b, sim, site, openedAt) {
  const now = Date.now();
  const here = !Number.isFinite(b.leftAt);
  const citizenAt = Math.max(b.arrivedAt + LEDGER.citizenDays * 86400e3, openedAt); // Infinity until trading opens
  const blocks = Math.floor(sim.blocksBy(b, now));
  const attributes = [
    { trait_type: 'Rarity', value: b.rarity.label },
    { trait_type: 'Trait', value: b.trait ? TRAIT_LABEL[b.trait] : 'None' },
    { trait_type: 'Role', value: b.role.label },
    { trait_type: 'Name', value: plain(b) },
    { trait_type: 'Status', value: !here ? 'Left the city' : now >= citizenAt ? 'Citizen' : 'Newcomer' },
    { trait_type: 'Origin', value: b.id <= RESERVE.count && b.from === RESERVE.wallet.toLowerCase() ? 'Team reserve' : 'Bought' },
    { trait_type: 'Blocks placed', value: blocks, display_type: 'number' },
    { trait_type: 'Arrived', value: Math.floor(b.arrivedAt / 1000), display_type: 'date' },
    ...(here && Number.isFinite(citizenAt) ? [{ trait_type: 'Citizen since', value: Math.floor(citizenAt / 1000), display_type: 'date' }] : []),
  ];
  return {
    name: b.name,
    description: `${b.name} is one of the ${NFT.name}: the builders of ${CONFIG.cityName}, a voxel city on Base that grows 24/7 with every ${CONFIG.ticker} buy. Every $${LEDGER.per} of ${CONFIG.ticker} a wallet buys brings one Blocky, up to ${LEDGER.supply.toLocaleString('en-US')} at once. Brought by ${short(b.from)}, ${here ? `it has placed ${blocks.toLocaleString('en-US')} blocks so far` : `it placed ${blocks.toLocaleString('en-US')} blocks before leaving`}.`,
    image: `${site}/api/nft/${b.id}.svg?v=${b.seed ?? 0}`,
    external_url: `${site}/collection.html#${b.id}`,
    background_color: '0b1020',
    attributes,
  };
}

function collection(site) {
  return {
    name: NFT.name,
    symbol: NFT.symbol,
    description: `${NFT.name} (${NFT.symbol}): the builders of ${CONFIG.cityName}, a voxel city on Base built 24/7. Every $${LEDGER.per} of ${CONFIG.ticker} a wallet buys brings one Blocky to the city, at most ${LEDGER.supply.toLocaleString('en-US')} at once. A newcomer leaves if its wallet sells; a Blocky held ${holdText(LEDGER.citizenDays)} is a citizen for good, and its wallet claims it as an NFT, free to trade at once. Only ${LEDGER.supply.toLocaleString('en-US')} can ever be claimed: first come, first claimed. You don't mint a Blocky, you earn one.`,
    image: `${site}/api/nft/collection.svg`,
    featured_image: `${site}/api/nft/collection.svg`,
    banner_image: `${site}/og.png`,
    external_link: site,
    seller_fee_basis_points: ROYALTY_BPS,
    fee_recipient: TREASURY,
  };
}

export default async function handler(req, res) {
  const raw = String(req.query?.id ?? new URL(req.url, 'http://x').pathname.split('/').pop());
  const [key, ext] = raw.toLowerCase().split('.');
  const site = siteOf(req);
  const svg = (body, immutable) => {
    res.setHeader('content-type', 'image/svg+xml; charset=utf-8');
    res.setHeader('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'public, s-maxage=300, stale-while-revalidate=3600');
    res.status(200).send(body);
  };
  try {
    if (key === 'collection') {
      if (ext === 'svg') return svg(blockySvg(makeFounder(0), { label: false }), false);
      res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json(collection(site));
    }
    const n = Number(key);
    if (!Number.isInteger(n) || n < 1 || (ext && ext !== 'svg' && ext !== 'json')) return res.status(404).json({ error: 'Not a Blocky' });
    const { blockies, sim, openedAt } = await city();
    const b = blockies[n - 1];
    if (!b) {
      res.setHeader('cache-control', 'public, s-maxage=30');
      return res.status(404).json({ error: `Blocky #${n} has not arrived yet` });
    }
    if (ext === 'svg') {
      const v = new URL(req.url, 'http://x').searchParams.get('v');
      return svg(blockySvg(b), v != null && v === String(b.seed ?? 0)); // the portrait never changes once it has its seed
    }
    res.setHeader('cache-control', 'public, s-maxage=60, stale-while-revalidate=600');
    res.status(200).json(metadata(b, sim, site, openedAt));
  } catch (e) {
    console.warn('[nft]', e.message);
    res.status(502).json({ error: String(e.message || e) });
  }
}
