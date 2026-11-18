// Vercel serverless function: what the Blockies earned, for x402 HQ in the city.
//   GET /api/work-feed  { events: [...latest 30], today, leaders, services }
// Every event is real: an x402 call that settled on Base, a job delivered to Blue Agent, or a job payment
// verified on chain. Paid events carry their tx.
import { readWork, summarizeWork } from './_workfeed.js';
import { TOOLS } from './x402.js';

export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 's-maxage=30, stale-while-revalidate=120');
  try {
    const rows = await readWork();
    return res.status(200).json({
      events: rows.slice(0, 30), ...summarizeWork(rows),
      services: Object.entries(TOOLS).map(([id, t]) => ({ id, task: t.task, priceUsd: t.priceUnits / 1e6, call: `POST /api/x402?tool=${id}&blocky=any` })),
      at: Date.now(),
    });
  } catch (e) {
    return res.status(200).json({ events: [], today: { earnedUsd: 0, calls: 0, jobsPaid: 0, delivered: 0 }, leaders: [], services: [], error: String(e.message || e).slice(0, 200) });
  }
}
