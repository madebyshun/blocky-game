// BaseCity Stock Intel Desk (x402-gated stock research for Blocky 10 on Base).
// - GET  /api/stock-intel                  -> list public previews (ticker, title, priceUsdc, author, unlocks)
// - GET  /api/stock-intel?id=<id>          -> returns HTTP 402 Payment Required with x402 v2 accepts[],
//                                             or unlocks full alpha when valid PAYMENT-SIGNATURE header is sent
// - POST /api/stock-intel                  -> publish a new Blocky Analyst intel report for a Blocky 10 stock
import { getAddress, isAddress } from 'viem';
import { kv, useKv, KEY_BASE } from './_store.js';
import { buildRequirement, decodePaymentHeader, verifyX402Payment, send402 } from './_x402.js';

const INTEL_KEY = `${KEY_BASE}:stock-intel:v1`;
let memIntel = [];

async function loadIntel() {
  if (useKv()) {
    try {
      const raw = await kv('GET', INTEL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch { /* ignore */ }
    return [];
  }
  return memIntel;
}

async function saveIntel(list) {
  const trimmed = list.slice(0, 200);
  if (useKv()) await kv('SET', INTEL_KEY, JSON.stringify(trimmed));
  else memIntel = trimmed;
}

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

const clean = (s, max = 500) => String(s || '').trim().slice(0, max);

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    const list = await loadIntel();
    const u = new URL(req.url, 'http://x');
    const id = req.query?.id || u.searchParams.get('id');
    const tickerFilter = String(req.query?.ticker || u.searchParams.get('ticker') || '').toUpperCase();

    if (req.method === 'GET' && !id) {
      const filtered = tickerFilter ? list.filter((x) => x.ticker === tickerFilter) : list;
      return res.status(200).json({
        items: filtered.map(({ fullReport, ...pub }) => pub),
        stats: {
          total: list.length,
          totalUnlocks: list.reduce((a, x) => a + (x.unlocks || 0), 0),
          totalUsdc: Math.round(list.reduce((a, x) => a + (x.earnedUsdc || 0), 0) * 100) / 100,
        },
      });
    }

    if (req.method === 'GET' && id) {
      const item = list.find((x) => x.id === id);
      if (!item) return res.status(404).json({ error: 'Intel report not found.' });

      const viewer = String(req.query?.viewer || u.searchParams.get('viewer') || '').toLowerCase();
      if (viewer && viewer === item.author) {
        return res.status(200).json({ unlocked: true, item });
      }

      const reqObj = buildRequirement({
        payTo: item.author,
        amountUsdc: item.priceUsdc,
        description: `Unlock ${item.ticker} intel: ${item.title}`,
        resource: `/api/stock-intel?id=${item.id}`,
      });

      const payment = decodePaymentHeader(req);
      if (!payment) return send402(res, reqObj);

      const verified = await verifyX402Payment(payment, reqObj);
      if (!verified.ok) return res.status(402).json({ x402Version: 2, error: verified.error, accepts: [reqObj] });

      item.unlocks = (item.unlocks || 0) + 1;
      item.earnedUsdc = Math.round(((item.earnedUsdc || 0) + Number(item.priceUsdc || 0)) * 100) / 100;
      await saveIntel(list);

      return res.status(200).json({
        unlocked: true,
        payer: verified.payer,
        item,
      });
    }

    if (req.method === 'POST') {
      const b = parseBody(req);
      const ticker = clean(b.ticker, 10).toUpperCase();
      const title = clean(b.title, 100);
      const preview = clean(b.preview, 280);
      const fullReport = clean(b.fullReport, 4000);
      const stance = ['BULLISH', 'NEUTRAL', 'BEARISH'].includes(String(b.stance || '').toUpperCase()) ? String(b.stance).toUpperCase() : 'BULLISH';
      const priceUsdc = Number(b.priceUsdc);

      if (!ticker) return res.status(400).json({ error: 'Select a Blocky 10 stock ticker.' });
      if (!title || title.length < 4) return res.status(400).json({ error: 'Title must be at least 4 characters.' });
      if (!preview || preview.length < 10) return res.status(400).json({ error: 'Public preview must be at least 10 characters.' });
      if (!fullReport || fullReport.length < 20) return res.status(400).json({ error: 'Full report must be at least 20 characters.' });
      if (!Number.isFinite(priceUsdc) || priceUsdc < 0.05 || priceUsdc > 25) return res.status(400).json({ error: 'x402 price must be between $0.05 and $25 USDC.' });
      if (!isAddress(b.author || '', { strict: false })) return res.status(400).json({ error: 'Valid Base wallet address required.' });

      const item = {
        id: `intel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        ticker,
        stance,
        title,
        preview,
        fullReport,
        priceUsdc: Math.round(priceUsdc * 100) / 100,
        author: getAddress(b.author).toLowerCase(),
        blockyName: clean(b.blockyName, 50) || 'Blocky Analyst',
        createdAt: Date.now(),
        unlocks: 0,
        earnedUsdc: 0,
      };
      list.unshift(item);
      await saveIntel(list);
      return res.status(200).json({ ok: true, item });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Stock intel error' });
  }
}
