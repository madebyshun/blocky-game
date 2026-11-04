// Vercel serverless function: turn a link or a long post into a bento dashboard (dash.html).
//   POST /api/dash { url? , text? }  -> { id, dash }   reads the source, asks Claude for the board, keeps it
//   GET  /api/dash?id=…              -> { id, dash }
//   GET  /api/dash                   -> { list: [{ id, title, at }] }   the newest 60
// Claude only lays out what the source says: every number on the board comes from the source text, and
// the board names its source. Needs ANTHROPIC_API_KEY. Boards are kept in KV (else this instance's memory).
import { randomBytes } from 'node:crypto';
import { useKv, kv, KEY_BASE } from './_store.js';

const KEY = `${KEY_BASE}:dash`;
const MODEL = process.env.DASH_MODEL || 'claude-sonnet-5-5';
const memory = new Map();
const MAX_TEXT = 30000;

const SCHEMA = {
  type: 'object',
  properties: {
    kicker: { type: 'string', description: 'A short line above the title, e.g. "The Always-On Chain:"' },
    title: { type: 'string', description: 'The headline, at most 6 words' },
    subtitle: { type: 'string', description: 'One line under the title' },
    hero: { type: 'object', description: 'The single most striking number', properties: { value: { type: 'string' }, label: { type: 'string' }, note: { type: 'string' } }, required: ['value', 'label'] },
    stat: { type: 'object', description: 'A second striking number, ideally a percentage', properties: { value: { type: 'string' }, label: { type: 'string' }, note: { type: 'string' } }, required: ['value', 'label'] },
    bars: { type: 'object', description: 'A comparison of 3 to 7 items with numeric values, if the source has one', properties: { title: { type: 'string' }, unit: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' }, highlight: { type: 'boolean' } }, required: ['label', 'value'] } } } },
    facts: { type: 'object', description: '3 to 6 short label/value facts', properties: { title: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'] } } }, required: ['items'] },
    quote: { type: 'string', description: 'One sentence from or about the source that lands the point' },
    closer: { type: 'string', description: 'A punchy closing line, at most 5 words' },
    source: { type: 'string', description: 'Who or what the numbers come from' },
  },
  required: ['title', 'hero', 'facts', 'closer', 'source'],
};

const body = (req) => { if (typeof req.body !== 'string') return req.body ?? {}; try { return JSON.parse(req.body); } catch { return {}; } };
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// the text behind a link: a post on X through its public embed data, else the page itself
export async function readSource(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) links');
  const tweet = /(?:^|\.)(?:x|twitter)\.com$/.test(u.hostname) && u.pathname.match(/status\/(\d+)/)?.[1];
  if (tweet) {
    const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweet}&token=x`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('Could not read that post on X: paste its text instead');
    const j = await r.json();
    const parts = [j.user?.name && `${j.user.name} (@${j.user.screen_name})`, j.text, j.quoted_tweet?.text && `Quoting: ${j.quoted_tweet.text}`, j.article?.title, j.article?.preview_text];
    return { text: parts.filter(Boolean).join('\n'), source: `@${j.user?.screen_name || 'x'} on X` };
  }
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; BaseCityDash/1.0)' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`That page answered ${r.status}`);
  return { text: strip(await r.text()), source: u.hostname.replace(/^www\./, '') };
}

async function askClaude(text, sourceHint) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: 'You turn a post or article into a bento dashboard of its key numbers, in the style of an infographic. Use only facts and numbers stated in the source: never invent, estimate or round beyond what it says, and leave out any part (bars, stat, quote) the source cannot fill. Keep every text short. Write in the language of the source.',
      tools: [{ name: 'dashboard', description: 'The dashboard', input_schema: SCHEMA }],
      tool_choice: { type: 'tool', name: 'dashboard' },
      messages: [{ role: 'user', content: `Source: ${sourceHint || 'pasted text'}\n\n<source>\n${text.slice(0, MAX_TEXT)}\n</source>` }],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Claude answered ${r.status}`);
  const out = j.content?.find((c) => c.type === 'tool_use')?.input;
  if (!out?.title || !out?.hero) throw new Error('No dashboard came back');
  return out;
}

async function save(id, rec) {
  if (useKv()) { await kv('HSET', KEY, id, JSON.stringify(rec)); await kv('LPUSH', `${KEY}:list`, JSON.stringify({ id, title: rec.dash.title, at: rec.at })); await kv('LTRIM', `${KEY}:list`, 0, 199); }
  else memory.set(id, rec);
}
async function load(id) {
  if (useKv()) { const v = await kv('HGET', KEY, id); return v ? JSON.parse(v) : null; }
  return memory.get(id) || null;
}
async function list() {
  if (useKv()) return ((await kv('LRANGE', `${KEY}:list`, 0, 59)) || []).map((x) => JSON.parse(x));
  return [...memory.entries()].map(([id, r]) => ({ id, title: r.dash.title, at: r.at })).reverse().slice(0, 60);
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  try {
    if (req.method === 'GET') {
      const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id');
      if (!id) return res.status(200).json({ list: await list() });
      const rec = /^[a-z0-9]{6,16}$/.test(id) ? await load(id) : null;
      return rec ? res.status(200).json({ id, ...rec }) : res.status(404).json({ error: 'No such dashboard' });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const { url, text } = body(req);
    let src;
    if (url) src = await readSource(String(url).trim());
    else if (text && String(text).trim().length >= 40) src = { text: String(text).trim(), source: null };
    else return res.status(400).json({ error: 'Paste a link, or a post of at least a few sentences' });
    if (src.text.length < 40) return res.status(422).json({ error: 'Not enough text there to build from: paste the post itself' });
    const dash = await askClaude(src.text, src.source);
    const id = randomBytes(5).toString('hex');
    const rec = { dash, url: url || null, at: Date.now() };
    await save(id, rec);
    res.status(200).json({ id, ...rec });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
