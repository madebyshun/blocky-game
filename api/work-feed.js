// Vercel serverless function: what the Blockies earned, for x402 HQ in the city.
//   GET /api/work-feed  { events: [...latest 30], today, leaders, services }
// Every event is real: an x402 call that settled on Base, a job delivered to Blue Agent, or a job payment
// verified on chain. Paid events carry their tx.
import { readWork, summarizeWork, countWork, METRICS_KEY, PAYERS_KEY, TEAM } from './_workfeed.js';
import { SKILLS, GUILDS } from '../src/skills.js';
import { TOOLS } from './x402.js';
import { useKv, kv, KEY_BASE, client } from './_store.js';

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
  if (req.query.metrics !== undefined) {
    if (!useKv()) return res.status(200).json({ skipped: 'no KV' });
    let h = Object.fromEntries((((await kv('HGETALL', METRICS_KEY)) || [])).reduce((a, v, i, arr) => (i % 2 ? a : [...a, [v, Number(arr[i + 1])]]), []));
    if (!Object.keys(h).length) { // first read: rebuild the totals from the feed kept so far
      // older rows have no payer: read it from the USDC transfer in their tx, so team tests are counted apart
      for (const r of (await readWork()).reverse()) {
        if (!r.payer && r.tx) { try { const rc = await client.getTransactionReceipt({ hash: r.tx }); const t = rc.logs.find((l) => l.address.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' && l.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'); if (t) r.payer = `0x${t.topics[1].slice(26)}`.toLowerCase(); } catch { /* unknown payer */ } }
        await countWork(r);
      }
      h = Object.fromEntries((((await kv('HGETALL', METRICS_KEY)) || [])).reduce((a, v, i, arr) => (i % 2 ? a : [...a, [v, Number(arr[i + 1])]]), []));
    }
    const g = (k) => h[k] || 0, usd = (u) => Math.round(u) / 1e6;
    const days = Object.keys(h).filter((k) => /^day:.*:n$/.test(k)).map((k) => k.split(':')[1]).sort().slice(-30);
    const agentsAll = ((await kv('HGETALL', `${KEY_BASE}:agent:v1`)) || []);
    let onDuty = 0, entries = 0; for (let i = 1; i < agentsAll.length; i += 2) { entries++; try { if (JSON.parse(agentsAll[i]).active) onDuty++; } catch { /* skip */ } }
    const links = ((await kv('HGETALL', `${KEY_BASE}:agentlink:v1`)) || []).filter((_, i) => i % 2 === 1).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
    const blockyEarn = Object.keys(h).filter((k) => /^blocky:\d+:units$/.test(k)).map((k) => ({ blocky: Number(k.split(':')[1]), usd: usd(h[k]) })).sort((a, b) => b.usd - a.usd);
    res.setHeader('cache-control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      at: Date.now(),
      totals: { paidCalls: g('paid:n'), earnedUsd: usd(g('paid:units')), x402Sales: g('kind:x402-sale'), jobsPaid: g('kind:job-paid'), jobsDelivered: g('kind:job-delivered'), reportsDrafted: g('kind:job-researched'), outsidePayers: Number(await kv('SCARD', PAYERS_KEY)) || 0, teamTestCalls: g('team:n'), teamTestUsd: usd(g('team:units')), outsideUsd: usd(g('paid:units') - g('team:units')) },
      blockies: { withOwnAgent: links.filter((l) => !l.signature).length, linked: links.length, onDuty, everActivated: entries, earning: blockyEarn.length },
      skills: Object.keys(SKILLS).map((id) => ({ id, guild: SKILLS[id].guild, calls: g(`skill:${id}:n`), earnedUsd: usd(g(`skill:${id}:units`)) })),
      guilds: Object.entries(GUILDS).map(([id, x]) => ({ id, label: x.label, icon: x.icon, color: x.color, calls: g(`guild:${id}:n`), earnedUsd: usd(g(`guild:${id}:units`)) })),
      daily: days.map((d) => ({ day: d, calls: g(`day:${d}:n`), earnedUsd: usd(g(`day:${d}:units`)) })),
      topBlockies: blockyEarn.slice(0, 10),
      note: 'Counted from settled x402 payments and Blue Agent job payments verified on Base. Team test payments are counted apart (teamTest*).',
    });
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
