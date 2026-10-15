// Vercel serverless function: popcorn reactions in the BaseCity Cinema (src/cinemaroom.js).
//   GET  /api/cinema?film=toshi      { film, counts: { '🍿': n, ... } }
//   POST /api/cinema { film, add: { '🔥': 3, ... } }   adds a viewer's taps (capped per request), returns the counts
// Counts live in KV, a hash per film; without KV (dev) in this process's memory.
import { useKv, kv, KEY_BASE } from './_store.js';
import { CONFIG } from '../src/config.js';

export const EMOJI = ['🍿', '🔥', '😂', '😍', '👏', '🫡'];
const FILMS = new Set((CONFIG.cinema?.reel || []).map((it) => it.id).filter(Boolean));
const MAX_PER_POST = 30; // a viewer tapping fast for a couple of seconds, not a script
const key = (film) => `${KEY_BASE}:cinema:${film}`;
const memory = new Map();

async function read(film) {
  const counts = Object.fromEntries(EMOJI.map((e) => [e, 0]));
  if (!useKv()) Object.assign(counts, memory.get(film) || {});
  else { const flat = (await kv('HGETALL', key(film))) || []; for (let i = 0; i < flat.length; i += 2) if (EMOJI.includes(flat[i])) counts[flat[i]] = Number(flat[i + 1]) || 0; }
  return counts;
}

function body(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    const b = req.method === 'POST' ? body(req) : {};
    const film = String(b.film || req.query?.film || '');
    if (!FILMS.has(film)) return res.status(404).json({ error: 'No such film' });
    if (req.method === 'POST') {
      let left = MAX_PER_POST;
      const adds = [];
      for (const e of EMOJI) {
        const n = Math.max(0, Math.min(left, Math.floor(Number(b.add?.[e]) || 0)));
        if (n) { adds.push([e, n]); left -= n; }
      }
      if (!useKv()) { const m = memory.get(film) || {}; for (const [e, n] of adds) m[e] = (m[e] || 0) + n; memory.set(film, m); }
      else for (const [e, n] of adds) await kv('HINCRBY', key(film), e, n);
    }
    return res.status(200).json({ film, counts: await read(film) });
  } catch (e) {
    return res.status(500).json({ error: 'Cinema is closed for a moment' });
  }
}
