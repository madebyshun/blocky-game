// dash.html: paste a link or a post, get a bento board (api/dash.js); every board made is listed below.
import { toPng } from 'html-to-image';
import { mountSite } from './site.js';
import { CONFIG } from './config.js';

mountSite('dash');
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const board = $('dm-board');
const SITE = (CONFIG.siteUrl || 'https://basecity.space').replace(/\/$/, '');
const fit = () => { const k = Math.min(1, $('dm-fit').clientWidth / 1600); board.style.setProperty('--s', String(k)); $('dm-fit').style.height = `${900 * k}px`; };
addEventListener('resize', fit);

function render(rec) {
  const d = rec.dash;
  const bars = d.bars?.items?.length ? (() => { const max = Math.max(...d.bars.items.map((i) => i.value)) * 1.15 || 1; return `<div class="cell white c-bars"><p class="t-small dark">${esc(d.bars.title || '')}</p><div class="bars">${d.bars.items.map((i) => `<div class="bar${i.highlight ? ' base' : ''}"><span>${esc(i.label)}</span><i style="width:${Math.max(0.5, (i.value / max) * 100)}%"><em>${esc(i.value)}${esc(d.bars.unit || '')}</em></i></div>`).join('')}</div></div>`; })() : `<div class="cell white c-bars"><p class="read">${esc(d.subtitle || '')}</p></div>`;
  board.innerHTML = `
    <div class="cell blue c-title"><p class="t-small">${esc(d.kicker || '')}</p><h1>${esc(d.title)}</h1><p class="t-note">${esc(d.subtitle || '')}</p></div>
    <div class="cell pale c-hero"><b class="huge">${esc(d.hero.value)}</b><p>${esc(d.hero.label)}</p>${d.hero.note ? `<p class="t-note">${esc(d.hero.note)}</p>` : ''}</div>
    <div class="cell grey c-stat">${d.stat ? `<b class="huge blue-t">${esc(d.stat.value)}</b><p>${esc(d.stat.label)}</p>${d.stat.note ? `<p class="t-note">${esc(d.stat.note)}</p>` : ''}` : `<p class="read">${esc(d.quote || '')}</p>`}</div>
    ${bars}
    <div class="cell white c-facts"><p class="t-small dark">${esc(d.facts.title || 'Key facts')}</p><ul class="facts">${d.facts.items.map((f) => `<li><span>${esc(f.label)}</span><b>${esc(f.value)}</b></li>`).join('')}</ul></div>
    <div class="cell pale c-quote"><p class="read">${esc(d.stat ? d.quote || '' : '')}</p></div>
    <div class="cell blue c-closer"><p class="foot-big">${esc(d.closer)}</p><p class="foot-site"><span class="mark"></span> basecity.space</p></div>
    <p class="bb-src">Source: ${esc(d.source)}${rec.url ? ` · ${esc(rec.url)}` : ''} · laid out by Claude from the source's own numbers · basecity.space/dash</p>`;
  $('dm-fit').hidden = false; $('dm-bar').hidden = false; fit();
  $('dm-src').textContent = d.source || '';
  const link = `${SITE}/dash.html?id=${rec.id}`;
  $('dm-share').href = `https://x.com/intent/post?text=${encodeURIComponent(`${d.title}: ${d.hero.value} ${d.hero.label}\n\nas a dashboard by @${CONFIG.xHandle || 'blockyonbase'}\n${link}`)}`;
  $('dm-copy').onclick = async () => { try { await navigator.clipboard.writeText(link); $('dm-copy').textContent = 'Copied ✓'; } catch { prompt('Link', link); } };
  history.replaceState(null, '', `?id=${rec.id}`);
}

async function loadList() {
  try {
    const { list = [] } = await (await fetch('/api/dash')).json();
    $('dm-list').innerHTML = list.length ? list.map((x) => `<a href="?id=${x.id}" data-id="${x.id}"><b>${esc(x.title)}</b><span>${new Date(x.at).toLocaleString()}</span></a>`).join('') : '<p class="dm-sub">None yet: make the first one.</p>';
    for (const a of $('dm-list').querySelectorAll('a')) a.onclick = (e) => { e.preventDefault(); open(a.dataset.id); };
  } catch { /* the list waits */ }
}
async function open(id) {
  const r = await fetch(`/api/dash?id=${id}`);
  if (r.ok) { render(await r.json()); scrollTo({ top: 0, behavior: 'smooth' }); }
}

$('dm-form').onsubmit = async (e) => {
  e.preventDefault();
  const url = $('dm-url').value.trim(), text = $('dm-text').value.trim();
  if (!url && !text) return;
  $('dm-go').disabled = true; $('dm-msg').className = 'dm-msg'; $('dm-msg').textContent = 'Reading and building… (about 20 seconds)';
  try {
    const r = await fetch('/api/dash', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(url ? { url } : { text }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Could not build it');
    render(j); $('dm-msg').textContent = ''; loadList();
  } catch (err) { $('dm-msg').className = 'dm-msg err'; $('dm-msg').textContent = err.message; }
  $('dm-go').disabled = false;
};

$('dm-save').onclick = async () => {
  const btn = $('dm-save'); btn.textContent = 'Saving…';
  try {
    await document.fonts.ready;
    const prev = board.style.transform; board.style.transform = 'none';
    const url = await toPng(board, { width: 1600, height: 900, pixelRatio: 2, cacheBust: true });
    board.style.transform = prev;
    const a = document.createElement('a'); a.href = url; a.download = 'dashboard.png'; a.click();
  } catch (err) { console.error(err); }
  btn.textContent = 'Save image';
};

loadList();
const id = new URLSearchParams(location.search).get('id');
if (id) open(id);
