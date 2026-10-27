// Vercel serverless function: Base's last hour and its TVL, for the Data Plaza in Base Live.
//   GET /api/basestats -> { head, names: { n, last }, bridge: { n, eth }, txPerBlock, txPerDay, tvl, at }
// Cached 5 minutes by the CDN (and by this instance).
import { readHour, readTvl } from './_baselive.js';

let last = null;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=600');
  try {
    if (!last || Date.now() - last.at > 240000) {
      const [hour, tvl] = await Promise.all([readHour().catch((e) => { console.warn('[basestats] hour:', e.message); return {}; }), readTvl()]);
      last = { names: null, bridge: null, txPerBlock: null, txPerDay: null, ...hour, tvl, at: Date.now() };
    }
    res.status(200).json(last);
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: String(e.message || e) });
  }
}
