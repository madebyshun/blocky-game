// The Blockies' work feed: only real, provable events — an x402 call that settled (tx), a job delivery,
// a job payment verified on chain (tx). Kept in KV as a capped list; read by /api/work-feed for x402 HQ.
import { useKv, kv, KEY_BASE } from './_store.js';

export const FEED_KEY = `${KEY_BASE}:workfeed:v1`;
const MAX = 500;
const memory = [];
const KINDS = new Set(['x402-sale', 'job-delivered', 'job-paid', 'job-researched']);

export async function recordWork(ev) {
  if (!KINDS.has(ev?.kind) || !ev.blocky) return;
  const row = { at: Date.now(), kind: ev.kind, blocky: Number(ev.blocky), agentId: ev.agentId ? String(ev.agentId) : null, usd: Number(ev.usd) || 0, tx: ev.tx || null, tool: ev.tool || null, ticker: ev.ticker || null, title: ev.title ? String(ev.title).slice(0, 120) : null };
  if (!useKv()) { memory.unshift(row); memory.length = Math.min(memory.length, MAX); return; }
  await kv('LPUSH', FEED_KEY, JSON.stringify(row));
  await kv('LTRIM', FEED_KEY, 0, MAX - 1);
}

export async function readWork(n = MAX) {
  if (!useKv()) return memory.slice(0, n);
  const raw = (await kv('LRANGE', FEED_KEY, 0, n - 1)) || [];
  return raw.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
}

// Totals for today (UTC) and the last 7 days, and the hardest-working Blockies (earned, then jobs).
export function summarizeWork(rows, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10), week = now - 7 * 86400000;
  const paid = (r) => r.kind === 'x402-sale' || r.kind === 'job-paid';
  const today = rows.filter((r) => new Date(r.at).toISOString().slice(0, 10) === day);
  const board = new Map();
  for (const r of rows.filter((x) => x.at >= week)) {
    const b = board.get(r.blocky) || { blocky: r.blocky, agentId: r.agentId, earnedUsd: 0, calls: 0, jobs: 0 };
    if (paid(r)) b.earnedUsd = Math.round((b.earnedUsd + r.usd) * 1e6) / 1e6;
    if (r.kind === 'x402-sale') b.calls += 1;
    if (r.kind === 'job-paid') b.jobs += 1;
    board.set(r.blocky, b);
  }
  return {
    today: { earnedUsd: Math.round(today.filter(paid).reduce((n, r) => n + r.usd, 0) * 1e6) / 1e6, calls: today.filter((r) => r.kind === 'x402-sale').length, jobsPaid: today.filter((r) => r.kind === 'job-paid').length, delivered: today.filter((r) => r.kind === 'job-delivered').length },
    leaders: [...board.values()].filter((b) => b.earnedUsd > 0 || b.jobs || b.calls).sort((a, b) => b.earnedUsd - a.earnedUsd || b.jobs + b.calls - (a.jobs + a.calls)).slice(0, 10),
  };
}
