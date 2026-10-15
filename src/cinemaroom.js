// Inside the BaseCity Cinema: click a cinema's screen and the page turns into a movie theater playing
// CONFIG.cinema.reel full size (a clip plays with sound, the click allows it), curtains, a marquee, a crowd.
import { CONFIG } from './config.js';

const fmtN = (n) => (n >= 1e4 ? `${(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}K` : String(n));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const EMOJI = ['🍿', '🔥', '😂', '😍', '👏', '🫡']; // same list as api/cinema.js
const COLORS = ['#f4c542', '#e84393', '#5dade2', '#2ecc71', '#ff8c42', '#9b59b6', '#ffffff'];

export function createCinemaRoom() {
  const el = document.createElement('div');
  el.className = 'cinema-room'; el.hidden = true;
  const seats = Array.from({ length: 3 }, (_, r) => `<div class="cr-row" style="--r:${r}">${Array.from({ length: 14 + r * 2 }, (_, i) => {
    const c = COLORS[(i * 7 + r * 3) % COLORS.length];
    return `<i style="--c:${c};--d:${((i * 37 + r * 11) % 20) / 10}s"></i>`;
  }).join('')}</div>`).join('');
  el.innerHTML = `<div class="cr-marquee"><span>${esc(CONFIG.cinema?.title || 'BASECITY CINEMA')}</span><small id="cr-now"></small></div>
    <button type="button" class="cr-close" aria-label="Leave the cinema">✕</button>
    <div class="cr-stage"><div class="cr-curtain l"></div><div class="cr-screen" id="cr-screen"></div><div class="cr-curtain r"></div></div>
    <div class="cr-react" id="cr-react">${EMOJI.map((e) => `<button type="button" data-e="${e}">${e}<small>0</small></button>`).join('')}
      <button type="button" class="cr-ticket-btn" id="cr-ticket-btn">🎟 Get your ticket</button></div>
    <div class="cr-list" id="cr-list"></div>
    <div class="cr-ticket" id="cr-ticket" hidden><div class="cr-tbox"><canvas id="cr-tcv" width="1200" height="630"></canvas>
      <div class="cr-tbtns"><button type="button" id="cr-share" class="primary">Share on X</button><button type="button" id="cr-save">Save image</button><button type="button" id="cr-tclose">Back to the film</button></div></div></div>
    <div class="cr-seats">${seats}</div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector(`#${id}`);
  const reel = CONFIG.cinema?.reel || [];
  let i = 0, timer = null, film = null, pending = {}, counts = {}, sendT = null, pollT = null;

  // ---------- popcorn reactions: taps float up the screen, are counted for the film, others' show up too ----------
  function float(e, mine = true) {
    const f = document.createElement('span');
    f.className = 'cr-float'; f.textContent = e;
    f.style.left = `${8 + Math.random() * 84}%`; f.style.setProperty('--dx', `${(Math.random() - 0.5) * 80}px`);
    if (!mine) f.style.opacity = 0.7;
    $('cr-screen').appendChild(f);
    setTimeout(() => f.remove(), 2600);
  }
  function showCounts() {
    for (const b of el.querySelectorAll('[data-e]')) b.querySelector('small').textContent = fmtN((counts[b.dataset.e] || 0) + (pending[b.dataset.e] || 0));
  }
  async function api(body) {
    if (!film) return;
    const f = film;
    try {
      const r = await fetch(body ? '/api/cinema' : `/api/cinema?film=${encodeURIComponent(f)}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ film: f, add: body }) } : {});
      if (!r.ok || f !== film) return;
      const { counts: c } = await r.json();
      // reactions from everyone else since the last look float up too (a few, not a flood)
      const shown = counts;
      if (Object.keys(shown).length) for (const e of EMOJI) { const n = Math.min(6, (c[e] || 0) - (shown[e] || 0) - (body?.[e] || 0)); for (let k = 0; k < n; k++) setTimeout(() => float(e, false), k * 250 + Math.random() * 1500); }
      counts = c; showCounts();
    } catch {}
  }
  const loadCounts = () => { counts = {}; showCounts(); api(); };
  function react(e) {
    if (!film) return;
    pending[e] = (pending[e] || 0) + 1; float(e); showCounts();
    clearTimeout(sendT);
    sendT = setTimeout(() => { const add = pending; pending = {}; for (const k in add) counts[k] = (counts[k] || 0) + add[k]; api(add); }, 1200);
  }

  // ---------- the ticket: a stub to save and share on X ----------
  const seat = `${'ABCDEFGH'[Math.floor(Math.random() * 8)]}${1 + Math.floor(Math.random() * 18)}`;
  function drawTicket(it) {
    const cv = $('cr-tcv'), g = cv.getContext('2d'), W = 1200, H = 630;
    g.fillStyle = '#0b0606'; g.fillRect(0, 0, W, H);
    const tk = (x, y, w, h) => { // the stub with its notches
      g.fillStyle = '#ffd23f'; g.beginPath(); g.roundRect(x, y, w, h, 28); g.fill();
      g.fillStyle = '#0b0606'; for (const cy of [y, y + h]) { g.beginPath(); g.arc(x + w * 0.72, cy, 30, 0, Math.PI * 2); g.fill(); }
      g.setLineDash([14, 12]); g.strokeStyle = '#0b0606'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + w * 0.72, y + 40); g.lineTo(x + w * 0.72, y + h - 40); g.stroke(); g.setLineDash([]);
    };
    tk(60, 70, 1080, 490);
    g.fillStyle = '#14100a'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = '400 64px "Lilita One", Inter, sans-serif'; g.fillText(CONFIG.cinema?.title || 'BASECITY CINEMA', 110, 170);
    g.font = '700 26px Inter, sans-serif'; g.fillText('ADMIT ONE · NOW SHOWING', 110, 215);
    let size = 96; const title = (it?.title || 'Premiere').toUpperCase();
    do { g.font = `400 ${size}px "Lilita One", Inter, sans-serif`; size -= 4; } while (g.measureText(title).width > 640 && size > 30);
    g.fillText(title, 110, 340);
    g.font = '700 28px Inter, sans-serif';
    const d = new Date();
    g.fillText(`${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · SEAT ${seat}`, 110, 410);
    const total = EMOJI.reduce((a, e) => a + (counts[e] || 0), 0);
    g.font = '600 24px Inter, sans-serif'; g.fillText(total ? `${fmtN(total)} reactions from the crowd` : 'a city on Base, built by Blockies', 110, 455);
    g.font = '800 26px Inter, sans-serif'; g.fillText((CONFIG.siteUrl || location.origin).replace(/^https?:\/\//, ''), 110, 520);
    // a Blocky with popcorn on the stub (BaseCity's own voxel citizen)
    const bx = 920, by = 170, u = 22, px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(bx + x * u, by + y * u, w * u, h * u); };
    px(0, 0, 6, 6, '#0052ff'); px(1, 2, 1, 1, '#fff'); px(4, 2, 1, 1, '#fff'); px(1, 4, 4, 1, '#14100a');
    px(1, 6, 4, 4, '#ffffff'); px(-1, 7, 2, 1, '#0052ff'); px(5, 7, 2, 1, '#0052ff');
    px(5, 5, 3, 3, '#e74c3c'); px(5, 4, 3, 1, '#fff7d6'); px(6, 5, 1, 3, '#ffffff');
    px(1, 10, 1, 3, '#14100a'); px(4, 10, 1, 3, '#14100a');
    g.font = '800 22px Inter, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#14100a'; g.fillText(`No. ${String(Math.floor(Math.random() * 99999)).padStart(5, '0')}`, bx + 3 * u, 530);
  }
  function openTicket() {
    const it = reel[i];
    drawTicket(it); $('cr-ticket').hidden = false;
  }
  const shareText = () => `🎟 Just watched ${reel[i]?.title || 'a premiere'} at the BaseCity Cinema 🍿\n\nA city on Base, built 24/7 by Blockies. Grab a seat:`;

  function play(n) {
    clearTimeout(timer);
    i = reel.length ? (n + reel.length) % reel.length : 0;
    const it = reel[i], scr = $('cr-screen');
    film = it?.id || null; pending = {}; loadCounts();
    if (!it) { scr.innerHTML = '<div class="cr-empty"><b>YOUR FILM HERE</b><span>DM @blockyonbase</span></div>'; $('cr-now').textContent = ''; return; }
    scr.innerHTML = it.video
      ? `<video src="${esc(it.video)}" autoplay playsinline controls></video>`
      : `<img src="${esc(it.img)}" alt="${esc(it.caption || '')}">`;
    if (it.caption) scr.insertAdjacentHTML('beforeend', `<div class="cr-cap">${esc(it.caption)}</div>`);
    $('cr-now').textContent = `NOW SHOWING · ${it.caption?.replace(/^NOW SHOWING · /i, '') || `Reel ${i + 1}`}`;
    for (const b of el.querySelectorAll('.cr-list button')) b.classList.toggle('on', +b.dataset.i === i);
    const v = scr.querySelector('video');
    if (v) v.onended = () => { $('cr-ticket-btn').classList.add('pulse'); play(i + 1); };
    else if (reel.length > 1) timer = setTimeout(() => play(i + 1), (it.secs || 8) * 1000);
  }

  $('cr-list').innerHTML = reel.length > 1 ? reel.map((it, n) => `<button type="button" data-i="${n}">🎬 ${esc(it.caption || `Reel ${n + 1}`)}</button>`).join('') : '';
  el.addEventListener('click', (e) => {
    if (e.target.closest('.cr-close')) return room.close();
    const b = e.target.closest('[data-i]'); if (b) return play(+b.dataset.i);
    const r = e.target.closest('[data-e]'); if (r) return react(r.dataset.e);
    if (e.target.closest('#cr-ticket-btn')) return openTicket();
    if (e.target.closest('#cr-tclose')) { $('cr-ticket').hidden = true; return; }
    if (e.target.closest('#cr-save')) { const a = document.createElement('a'); a.download = 'basecity-cinema-ticket.png'; a.href = $('cr-tcv').toDataURL('image/png'); a.click(); return; }
    if (e.target.closest('#cr-share')) {
      const url = CONFIG.siteUrl || location.origin;
      open(`https://x.com/intent/post?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
    }
  });
  addEventListener('keydown', (e) => { if (!el.hidden && e.key === 'Escape') room.close(); });

  const room = {
    get open() { return !el.hidden; },
    show() { el.hidden = false; document.body.classList.add('in-cinema'); play(i); clearInterval(pollT); pollT = setInterval(() => api(), 6000); },
    close() { el.hidden = true; document.body.classList.remove('in-cinema'); clearTimeout(timer); clearInterval(pollT); $('cr-screen').innerHTML = ''; $('cr-ticket').hidden = true; },
  };
  return room;
}
