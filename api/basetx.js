// Vercel serverless function: one Base transaction, for "Find my tx" in Base Live.
//   GET /api/basetx?hash=0x… -> { hash, from, to, eth, block, t, ok, logs, gasUsed, feeEth, usdc, names }
import { readTx } from './_baselive.js';
import { namesFor } from './_names.js';

export default async function handler(req, res) {
  const hash = String(req.query?.hash ?? new URL(req.url, 'http://x').searchParams.get('hash') ?? '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) return res.status(400).json({ error: 'That is not a transaction hash (0x + 64 hex characters)' });
  try {
    const tx = await readTx(hash);
    if (!tx) return res.status(404).json({ error: 'No such transaction on Base' });
    let names = {};
    try { names = await namesFor([tx.from, tx.to].filter(Boolean)); } catch { /* names are a bonus */ }
    res.setHeader('cache-control', tx.ok === null ? 'no-store' : 'public, s-maxage=3600');
    res.status(200).json({ ...tx, names });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
