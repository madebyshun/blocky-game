// Vercel serverless function: the daily recap (src/recap-data.js) to share.
//   GET /api/recap?day=N&format=png  the day's recap card as a 1200×675 PNG (X's large card)
//   GET /api/recap?day=N             (and /r/N) a page whose share card is that image; people go on to
//                                    /recap.html?day=N
// The numbers come from the city's own state (/api/colony, replayed like the city), so the image
// matches the page. A finished day's image is cached for a day, the one under way for 10 minutes.
import { readFileSync } from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { CONFIG } from '../src/config.js';
import { blockySvg } from '../src/voxel-svg.js';
import { addNames, who } from '../src/names.js';
import { recapOf, dayCount, defaultDay, usd, plus, starLabel } from '../src/recap-data.js';
import { SITE } from './_store.js';

const file = (p) => readFileSync(new URL(p, import.meta.url));
const FONTS = [
  { name: 'Lilita', data: file('./_fonts/lilita-one.woff'), weight: 400 },
  { name: 'Inter', data: file('./_fonts/inter-700.woff'), weight: 700 },
  { name: 'Inter', data: file('./_fonts/inter-800.woff'), weight: 800 },
];
const BG = `data:image/png;base64,${file('../public/og.png').toString('base64')}`;
const W = 1200, H = 675;
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// a satori element: h('div', style, ...children)
const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat().filter((c) => c != null && c !== false) } });
const img = (src, style) => ({ type: 'img', props: { src, style } });
const emojiless = (s) => s.replace(/^[^\p{L}\p{N}$]+/u, ''); // the fonts have no emoji: the line's icon goes

function card(s) {
  const stat = (v, k, d) => h('div', { flexDirection: 'column', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 16, padding: '12px 18px', width: 340 },
    h('div', { fontFamily: 'Lilita', fontSize: 46, lineHeight: 1.05 }, v),
    h('div', { fontSize: 15, fontWeight: 800, color: '#9fb6ff', letterSpacing: 1 }, k.toUpperCase()),
    d ? h('div', { fontSize: 15, fontWeight: 700, color: '#ffd23f', marginTop: 2 }, d) : null);
  const lines = s.lines.map(emojiless);
  return h('div', { width: W, height: H, background: '#050b22', color: '#fff', fontFamily: 'Inter', position: 'relative' },
    img(BG, { position: 'absolute', right: 0, top: 0, height: H, width: (H * 1200) / 630, opacity: 0.55 }),
    h('div', { position: 'absolute', left: 0, top: 0, width: W, height: H, backgroundImage: 'linear-gradient(90deg, #050b22 0%, #050b22 45%, rgba(5,11,34,0.75) 70%, rgba(5,11,34,0.25) 100%)' }),
    h('div', { position: 'absolute', left: 52, top: 44, right: 52, bottom: 40, flexDirection: 'column' },
      h('div', { alignItems: 'center' },
        h('div', { background: '#0052ff', borderRadius: 999, padding: '7px 20px', fontWeight: 800, fontSize: 20, letterSpacing: 2 }, `DAY ${s.n} RECAP${s.live ? ' · SO FAR' : ''}`),
        h('div', { fontFamily: 'Lilita', fontSize: 54, marginLeft: 18 }, CONFIG.cityName)),
      h('div', { flexWrap: 'wrap', gap: 14, marginTop: 22, width: 1060 },
        stat(fmt(s.inCity), 'Blockies in the city', `${plus(s.net)} today`),
        stat(fmt(s.arrived.length), 'Arrived', [s.legendary && `${s.legendary} Legendary`, s.rare && `${s.rare} Rare`].filter(Boolean).join(' · ')),
        stat(fmt(s.left.length), 'Left the city', 'sold before they stayed'),
        stat(fmt(s.buildings), 'Buildings', `+${fmt(s.built)} finished today`),
        stat(fmt(s.blocks), 'Blocks placed today', `${fmt(s.totalBlocks)} in all`),
        stat(usd(s.bought), 'Bought so far', `of ${usd(CONFIG.unlockUsd)} to open NFT trading`)),
      h('div', { marginTop: 22, gap: 30 },
        h('div', { flexDirection: 'column', width: 440 },
          h('div', { fontSize: 15, fontWeight: 800, color: '#9fb6ff', letterSpacing: 2, marginBottom: 6 }, 'MILESTONES'),
          ...(lines.length ? lines.slice(0, 3) : ['The crew kept building homes and shops']).map((l) => h('div', { fontSize: 20, fontWeight: 700, marginTop: 4, alignItems: 'center' }, h('div', { width: 9, height: 9, borderRadius: 5, background: '#ffd23f', marginRight: 10 }), l)),
          lines.length > 3 ? h('div', { fontSize: 16, color: '#9fb6ff', marginTop: 4 }, `+${lines.length - 3} more`) : null),
        h('div', { flexDirection: 'column' },
          h('div', { fontSize: 15, fontWeight: 800, color: '#9fb6ff', letterSpacing: 2, marginBottom: 8 }, 'STARS OF THE DAY'),
          h('div', { gap: 10 }, ...(s.stars.length ? s.stars.slice(0, 5) : []).map((b) => h('div', { flexDirection: 'column', width: 96, alignItems: 'center' },
            img(`data:image/svg+xml;base64,${Buffer.from(blockySvg(b, { size: 192, label: false })).toString('base64')}`, { width: 96, height: 96, borderRadius: 12 }),
            h('div', { fontSize: 12, fontWeight: 800, marginTop: 4 }, b.name),
            h('div', { fontSize: 11, fontWeight: 700, color: '#ffd23f' }, starLabel(b).split(' · ')[0])))),
          s.stars.length ? null : h('div', { fontSize: 18, color: '#9fb6ff' }, 'No rare arrivals today'),
          s.mvp ? h('div', { fontSize: 17, fontWeight: 700, marginTop: 10 }, `Hardest worker: ${s.mvp[0].name} · ${fmt(s.mvp[1])} blocks${s.mvp[0].from ? ` · ${who(s.mvp[0].from, 20)}` : ''}`) : null)),
      h('div', { position: 'absolute', left: 0, bottom: 0, fontFamily: 'Lilita', fontSize: 30 }, `${(SITE || '').replace(/^https?:\/\//, '') || 'basecity.space'}${CONFIG.xHandle ? `  ·  @${CONFIG.xHandle}` : ''}`)));
}

export async function recapPng(s) {
  const svg = await satori(card(s), { width: W, height: H, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}

export default async function handler(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const origin = SITE || `https://${req.headers.host}`;
  try {
    const r = await fetch(`${origin}/api/colony`, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`colony HTTP ${r.status}`);
    const state = await r.json();
    addNames(state.names);
    const days = dayCount(state.cityStart ?? Date.now());
    const n = Number(q.day) >= 1 && Number(q.day) <= days ? Math.floor(Number(q.day)) : defaultDay(days);
    const s = recapOf(state, n);
    const maxAge = s.live ? 600 : 86400;
    if (q.format === 'png') {
      const png = await recapPng(s);
      res.setHeader('content-type', 'image/png');
      res.setHeader('cache-control', `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`);
      return res.status(200).send(png);
    }
    // the share page: X reads the card, people go on to the recap
    const title = `${CONFIG.cityName}: Day ${n} recap${s.live ? ' (so far)' : ''}`;
    const desc = `${fmt(s.inCity)} Blockies in the city (${plus(s.net)}), ${fmt(s.built)} buildings finished, ${fmt(s.blocks)} blocks placed, ${fmt(s.left.length)} walked out.`;
    const image = `${origin}/api/recap?day=${n}&format=png&v=${Math.floor(s.t1 / 600e3)}`;
    const page = `${origin}/recap.html?day=${n}`;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', `public, s-maxage=${Math.min(maxAge, 600)}`);
    res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(CONFIG.cityName)}">
<meta property="og:url" content="${esc(`${origin}/r/${n}`)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="${W}"><meta property="og:image:height" content="${H}">
<meta name="twitter:card" content="summary_large_image">${CONFIG.xHandle ? `<meta name="twitter:site" content="@${esc(CONFIG.xHandle)}">` : ''}
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(page)}"></head><body><a href="${esc(page)}">${esc(title)}</a></body></html>`);
  } catch (e) {
    console.warn('[recap]', e.message);
    res.status(502).json({ error: String(e.message || e) });
  }
}
