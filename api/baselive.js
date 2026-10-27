// Vercel serverless function: Base, block by block, for Base Live (src/baselive.js).
//   GET /api/baselive?since=N  -> { head, blocks: [summary, ...] }: the blocks after N (at most 4,
//                                 newest last; see summarize() in api/_baselive.js)
// The CDN keeps an answer for 2 s, so however many people watch, Base's RPC is read about once per
// block. One instance also keeps the last answer and serves it again within that time.
import { readBlocks } from './_baselive.js';

let last = null; // { at, since, out }

export default async function handler(req, res) {
  const since = Number(req.query?.since ?? new URL(req.url, 'http://x').searchParams.get('since')) || 0;
  res.setHeader('cache-control', 'public, s-maxage=2, stale-while-revalidate=4');
  try {
    if (last && Date.now() - last.at < 1500 && last.since === since) return res.status(200).json(last.out);
    const out = await readBlocks(since);
    last = { at: Date.now(), since, out };
    res.status(200).json(out);
  } catch (e) {
    res.setHeader('cache-control', 'no-store');
    res.status(502).json({ error: String(e.message || e) });
  }
}
