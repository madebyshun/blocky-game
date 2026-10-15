// Inside the BaseCity Cinema: click a cinema's screen and the page turns into a movie theater playing
// CONFIG.cinema.reel full size (a clip plays with sound, the click allows it), curtains, a marquee, a crowd.
import { CONFIG } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
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
    <div class="cr-list" id="cr-list"></div>
    <div class="cr-seats">${seats}</div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector(`#${id}`);
  const reel = CONFIG.cinema?.reel || [];
  let i = 0, timer = null;

  function play(n) {
    clearTimeout(timer);
    i = reel.length ? (n + reel.length) % reel.length : 0;
    const it = reel[i], scr = $('cr-screen');
    if (!it) { scr.innerHTML = '<div class="cr-empty"><b>YOUR FILM HERE</b><span>DM @blockyonbase</span></div>'; $('cr-now').textContent = ''; return; }
    scr.innerHTML = it.video
      ? `<video src="${esc(it.video)}" autoplay playsinline controls></video>`
      : `<img src="${esc(it.img)}" alt="${esc(it.caption || '')}">`;
    if (it.caption) scr.insertAdjacentHTML('beforeend', `<div class="cr-cap">${esc(it.caption)}</div>`);
    $('cr-now').textContent = `NOW SHOWING · ${it.caption?.replace(/^NOW SHOWING · /i, '') || `Reel ${i + 1}`}`;
    for (const b of el.querySelectorAll('.cr-list button')) b.classList.toggle('on', +b.dataset.i === i);
    const v = scr.querySelector('video');
    if (v) v.onended = () => play(i + 1);
    else if (reel.length > 1) timer = setTimeout(() => play(i + 1), (it.secs || 8) * 1000);
  }

  $('cr-list').innerHTML = reel.length > 1 ? reel.map((it, n) => `<button type="button" data-i="${n}">🎬 ${esc(it.caption || `Reel ${n + 1}`)}</button>`).join('') : '';
  el.addEventListener('click', (e) => {
    if (e.target.closest('.cr-close')) return api.close();
    const b = e.target.closest('[data-i]'); if (b) play(+b.dataset.i);
  });
  addEventListener('keydown', (e) => { if (!el.hidden && e.key === 'Escape') api.close(); });

  const api = {
    get open() { return !el.hidden; },
    show() { el.hidden = false; document.body.classList.add('in-cinema'); play(i); },
    close() { el.hidden = true; document.body.classList.remove('in-cinema'); clearTimeout(timer); $('cr-screen').innerHTML = ''; },
  };
  return api;
}
