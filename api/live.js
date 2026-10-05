// Vercel serverless function: how many people are watching BaseCity.
//   GET /api/live[?first=1]  counts the caller in and returns { now, total }: distinct visitors of the
//                            last 2 to 4 minutes, and of all time (first=1: a new page view).
// Visitors are a hash of their IP in Redis HyperLogLogs (one per 2 minutes, plus one for all time):
// no address is stored, a reload counts once, and random ids can't inflate the count. One command per
// check-in (two on a page view); the counts are read at most every 15 s per instance. Without KV the
// counts live in this process's memory.

import { createHash } from 'node:crypto';
import { useKv, kvPipe, KEY_BASE } from './_store.js';

const BUCKET_MS = 120000; // the page checks in every 2 minutes while it's visible
const READ_MS = 15000;
const KEY = `${KEY_BASE}:live`;
let counts = null; // { at, now, total }
const expiring = new Set(); // buckets this instance has set to expire
const memory = { seen: new Map(), total: new Set() }; // without KV

const visitor = (req) => {
  const ip = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return createHash('sha256').update(`basecity:${ip}`).digest('hex').slice(0, 20);
};

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const id = visitor(req), at = Date.now(), first = (req.query?.first ?? new URL(req.url, 'http://x').searchParams.get('first')) === '1';
  try {
    if (!useKv()) {
      memory.seen.set(id, at);
      if (first) memory.total.add(id);
      for (const [k, t] of memory.seen) if (at - t > 2 * BUCKET_MS) memory.seen.delete(k);
      return res.status(200).json({ now: memory.seen.size, total: Math.max(memory.total.size, memory.seen.size) });
    }
    const b = Math.floor(at / BUCKET_MS), key = `${KEY}:${b}`;
    const cmds = [['PFADD', key, id]];
    if (!expiring.has(key)) { cmds.push(['EXPIRE', key, Math.ceil((3 * BUCKET_MS) / 1000)]); expiring.add(key); }
    if (first) cmds.push(['PFADD', `${KEY}:total`, id]);
    const read = !counts || at - counts.at > READ_MS || counts.b !== b;
    if (read) cmds.push(['PFCOUNT', key, `${KEY}:${b - 1}`], ['PFCOUNT', `${KEY}:total`]);
    const out = await kvPipe(cmds);
    if (read) counts = { at, b, now: Number(out.at(-2)) || 1, total: Number(out.at(-1)) || 1 };
    if (expiring.size > 50) expiring.clear();
    res.status(200).json({ now: Math.max(1, counts.now), total: Math.max(counts.total, counts.now) });
  } catch (e) {
    console.warn('[live]', e.message);
    res.status(502).json({ error: 'no count right now' });
  }
}
