// Vercel serverless function: Base's last hour and its TVL, for the Data Plaza in Base Live.
//   GET /api/basestats -> { head, names: { n, last }, bridge: { n, eth }, txPerBlock, txPerDay, tvl, apps: { id: TVL on Base }, errors, at }
// Cached 5 minutes by the CDN (and by this instance).
import { readHour, readTvl, readAppTvl, readFees } from './_baselive.js';

let last = null;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=600');
  const partial = () => last && Object.keys(last.errors || {}).length;
  try {
    if (!last || Date.now() - last.at > (partial() ? 25000 : 240000)) {
      const [hour, tvl, apps, fees] = await Promise.all([readHour().catch((e) => ({ errors: { head: String(e.message || e).slice(0, 200) } })), readTvl(), readAppTvl(), readFees().catch((e) => ({ error: String(e.message || e).slice(0, 200) }))]);
      last = { names: null, bridge: null, txPerBlock: null, txPerDay: null, ...hour, tvl, apps, fees: fees.error ? null : fees, at: Date.now() };
      if (fees.error) last.errors = { ...last.errors, fees: fees.error };
      if (tvl === null) last.errors = { ...last.errors, tvl: 'DefiLlama did not answer' };
    }
    if (partial()) res.setHeader('cache-control', 'public, s-maxage=30'); // something failed: try again soon
    res.status(200).json(last);
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: String(e.message || e) });
  }
}
