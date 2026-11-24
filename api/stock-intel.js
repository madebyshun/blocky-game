// BaseCity Stock Intel Desk (x402-gated stock research for Blocky 10 on Base).
// - GET  /api/stock-intel                  -> list public previews (ticker, title, priceUsdc, author, unlocks)
// - GET  /api/stock-intel?id=<id>          -> returns HTTP 402 Payment Required with x402 v2 accepts[],
//                                             or unlocks full alpha when valid PAYMENT-SIGNATURE header is sent
// - POST /api/stock-intel                  -> publish a new Blocky Analyst intel report for a Blocky 10 stock
import { getAddress, isAddress } from 'viem';
import { kv, useKv, KEY_BASE } from './_store.js';
import { buildRequirement, decodePaymentHeader, verifyX402Payment, send402 } from './_x402.js';
import { facilitatorCall } from './_facilitator.js';
import { checkSigned } from './_sigauth.js';
import { intelMessage } from '../src/signed.js';
export const deps = { facilitator: facilitatorCall };

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
        items: filtered.map(({ fullReport, payments, ...pub }) => pub),
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

      const reqObj = buildRequirement({
        payTo: item.author,
        amountUsdc: item.priceUsdc,
        description: `Unlock ${item.ticker} intel: ${item.title}`,
        resource: `/api/stock-intel?id=${item.id}`,
      });

      const payment = decodePaymentHeader(req);
      if (!payment) return send402(res, reqObj);
      if (String(payment.payload?.authorization?.from || '').toLowerCase() === item.author) return res.status(409).json({ error: 'This is your own report: you do not pay yourself.' });

      // 1) the signature is well formed and pays the author this much; 2) the facilitator checks the balance and
      // the nonce; 3) it settles the transfer on Base. The report is released only after the money has moved.
      const verified = await verifyX402Payment(payment, reqObj);
      if (!verified.ok) return res.status(402).json({ x402Version: 2, error: verified.error, accepts: [reqObj] });
      // x402 v2 wants resource as an object; browsers send a plain string, so always rebuild it.
      const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || 'www.basecity.space');
      const resource = { url: `https://${host}${reqObj.resource}`, description: `Unlock ${item.ticker} intel: ${item.title}`.slice(0, 120), mimeType: 'application/json' };
      const pp = { ...payment, resource, extensions: payment.extensions || {} };
      let settled;
      try {
        const v = await deps.facilitator('verify', { x402Version: 2, paymentPayload: pp, paymentRequirements: reqObj });
        if (!v.isValid) return res.status(402).json({ x402Version: 2, error: v.invalidReason || 'The payment is not valid (balance or nonce).', accepts: [reqObj] });
        settled = await deps.facilitator('settle', { x402Version: 2, paymentPayload: pp, paymentRequirements: reqObj });
      } catch (e) {
        return res.status(503).json({ error: `Payment could not be settled: ${String(e.message || e).slice(0, 160)}. Nothing was charged.` });
      }
      if (!settled.success) return res.status(402).json({ x402Version: 2, error: settled.errorReason || 'The payment did not settle.', accepts: [reqObj] });

      const fresh = await loadIntel();
      const live = fresh.find((x) => x.id === id) || item;
      live.unlocks = (live.unlocks || 0) + 1;
      live.earnedUsdc = Math.round(((live.earnedUsdc || 0) + Number(live.priceUsdc || 0)) * 100) / 100;
      live.payments = [{ tx: settled.transaction || null, payer: verified.payer, at: Date.now() }, ...(live.payments || [])].slice(0, 50);
      await saveIntel(fresh.some((x) => x.id === id) ? fresh : list);

      return res.status(200).json({
        unlocked: true,
        payer: verified.payer,
        paid: { tx: settled.transaction || null, payTo: item.author },
        item: live,
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
      const auth = await checkSigned({ wallet: b.author, message: intelMessage(b, String(b.issuedAt || '')), signature: b.signature, issuedAt: String(b.issuedAt || '') });
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

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
