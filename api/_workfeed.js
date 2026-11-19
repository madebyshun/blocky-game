// The Blockies' work feed: only real, provable events — an x402 call that settled (tx), a job delivery,
// a job payment verified on chain (tx). Kept in KV as a capped list; read by /api/work-feed for x402 HQ.
import { useKv, kv, KEY_BASE } from './_store.js';

export const FEED_KEY = `${KEY_BASE}:workfeed:v1`;
export const METRICS_KEY = `${KEY_BASE}:metrics:v1`; // hash of running totals (all time), never trimmed
export const PAYERS_KEY = `${KEY_BASE}:metrics:payers:v1`; // set of wallets that paid a Blocky
// the team's own wallets: their payments are tests, not demand (same list Blue Agent keeps)
export const TEAM = new Set(['0xd5c1dfc036f9911348ea8065f73c8123f4013fab', '0x00fd29b7d6dbf13afb879afbb239db1d48ce746f', '0x64d1c1d957b6b69d3d82cd2756f44c1a6b30e318', '0xa4660f6b1d939358042abd8111735a1d6f149845']);
const MAX = 500;
const memory = [];
const KINDS = new Set(['x402-sale', 'job-delivered', 'job-paid', 'job-researched']);

export async function recordWork(ev) {
  if (!KINDS.has(ev?.kind) || !ev.blocky) return;
  const row = { at: Date.now(), kind: ev.kind, blocky: Number(ev.blocky), agentId: ev.agentId ? String(ev.agentId) : null, usd: Number(ev.usd) || 0, tx: ev.tx || null, tool: ev.tool || null, ticker: ev.ticker || null, title: ev.title ? String(ev.title).slice(0, 120) : null, guild: ev.guild || null, payer: ev.payer ? String(ev.payer).toLowerCase() : null };
  if (!useKv()) { memory.unshift(row); memory.length = Math.min(memory.length, MAX); return; }
  await kv('LPUSH', FEED_KEY, JSON.stringify(row));
  await kv('LTRIM', FEED_KEY, 0, MAX - 1);
  await countWork(row).catch(() => {});
}

// running totals: by kind, skill, guild, day and Blocky; outside demand counted apart from the team's tests
export async function countWork(row) {
  const day = new Date(row.at).toISOString().slice(0, 10), team = row.payer && TEAM.has(row.payer);
  const inc = (f, n = 1) => kv('HINCRBYFLOAT', METRICS_KEY, f, String(n));
  await inc(`kind:${row.kind}`);
  if (row.kind === 'x402-sale' || row.kind === 'job-paid') {
    const units = Math.round((row.usd || 0) * 1e6);
    await inc('paid:n'); await inc('paid:units', units); await inc(`day:${day}:n`); await inc(`day:${day}:units`, units);
    await inc(`blocky:${row.blocky}:units`, units);
    if (row.tool) { await inc(`skill:${row.tool}:n`); await inc(`skill:${row.tool}:units`, units); }
    if (row.guild) { await inc(`guild:${row.guild}:n`); await inc(`guild:${row.guild}:units`, units); }
    if (team) { await inc('team:n'); await inc('team:units', units); }
    if (row.payer && !team) await kv('SADD', PAYERS_KEY, row.payer);
  }
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
    guilds: Object.entries(rows.filter((r) => r.at >= week && r.guild && paid(r)).reduce((m, r) => { m[r.guild] = m[r.guild] || { calls: 0, earnedUsd: 0 }; m[r.guild].calls += 1; m[r.guild].earnedUsd = Math.round((m[r.guild].earnedUsd + r.usd) * 1e6) / 1e6; return m; }, {})).map(([guild, v]) => ({ guild, ...v })),
    leaders: [...board.values()].filter((b) => b.earnedUsd > 0 || b.jobs || b.calls).sort((a, b) => b.earnedUsd - a.earnedUsd || b.jobs + b.calls - (a.jobs + a.calls)).slice(0, 10),
  };
}
