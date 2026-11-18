// Vercel serverless function: what the Blockies earned, for x402 HQ in the city.
//   GET /api/work-feed  { events: [...latest 30], today, leaders, services }
// Every event is real: an x402 call that settled on Base, a job delivered to Blue Agent, or a job payment
// verified on chain. Paid events carry their tx.
import { readWork, summarizeWork } from './_workfeed.js';
import { TOOLS } from './x402.js';
import { useKv, kv, KEY_BASE } from './_store.js';

// Is BaseCity listed on the x402 Bazaar? The CDP discovery API has no filter and no order (~35k rows,
// 20 a page), so an hourly cron reads 60 pages from a cursor and remembers any BaseCity route it sees.
const BZ = `${KEY_BASE}:bazaar:v1`, DISCOVERY = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources';
export async function scanBazaar({ pages = 60, fetchImpl = fetch } = {}) {
  const st = JSON.parse((await kv('GET', BZ)) || '{}');
  let offset = st.cursor || 0, total = st.total || 0;
  const found = new Set(st.resources || []);
  for (let i = 0; i < pages; i++) {
    const j = await fetchImpl(`${DISCOVERY}?limit=20&offset=${offset}`, { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => null);
    if (!j) break;
    total = j.pagination?.total || total;
    for (const it of j.items || []) { const u = String(it.resource || it.accepts?.[0]?.resource || ''); if (/^https:\/\/(www\.)?basecity\.space\//.test(u)) found.add(u.split('?')[0] + (u.includes('tool=') ? `?tool=${new URL(u).searchParams.get('tool')}` : '')); }
    offset += 20; if (offset >= total) offset = 0;
  }
  const next = { cursor: offset, total, resources: [...found], listed: found.size > 0, checkedAt: Date.now(), ...(found.size && !st.listedAt ? { listedAt: Date.now() } : st.listedAt ? { listedAt: st.listedAt } : {}) };
  await kv('SET', BZ, JSON.stringify(next));
  return next;
}


export default async function handler(req, res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('cache-control', 's-maxage=30, stale-while-revalidate=120');
  if (req.query.bazaar !== undefined) {
    if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' });
    if (!useKv()) return res.status(200).json({ skipped: 'no KV' });
    return res.status(200).json(await scanBazaar());
  }
  try {
    const rows = await readWork();
    const bazaar = useKv() ? JSON.parse((await kv('GET', BZ)) || 'null') : null;
    return res.status(200).json({
      events: rows.slice(0, 30), ...summarizeWork(rows),
      services: Object.entries(TOOLS).map(([id, t]) => ({ id, task: t.task, priceUsd: t.priceUnits / 1e6, call: `POST /api/x402?tool=${id}&blocky=any` })),
      bazaar: bazaar ? { listed: !!bazaar.listed, resources: bazaar.resources || [], checkedAt: bazaar.checkedAt, scanned: `${bazaar.cursor}/${bazaar.total}` } : null,
      at: Date.now(),
    });
  } catch (e) {
    return res.status(200).json({ events: [], today: { earnedUsd: 0, calls: 0, jobsPaid: 0, delivered: 0 }, leaders: [], services: [], error: String(e.message || e).slice(0, 200) });
  }
}
