// The daily recap page: what the city did on day N (src/recap-data.js), as a card to screenshot or share.
// Its share link (/r/N) shows the same card as an image on X (api/recap.js). Save image and, on phones,
// Share make the image from the card on the page itself (2400×1350).
import { CONFIG } from './config.js';
import { fetchColony } from './data.js';
import { portraitUrl } from './portraits.js';
import { mountSite, fmt, esc } from './site.js';
import { addNames, who } from './names.js';
import { toBlob } from 'html-to-image';
import { recapOf, recapPost, dayCount, defaultDay, usd, plus, starLabel } from './recap-data.js';

mountSite('recap');
const $ = (id) => document.getElementById(id);
const when = (t) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function render(s, days) {
  $('tabs').innerHTML = Array.from({ length: days }, (_, i) => `<a href="?day=${i + 1}" class="chip${i + 1 === s.n ? ' on' : ''}">Day ${i + 1}${i + 1 === days ? ' · live' : ''}</a>`).join('');
  $('when').textContent = `${when(s.t0)} → ${s.live ? 'now' : when(s.t1)}`;
  const stat = (v, k, d) => `<div class="rs"><b>${v}</b><span>${k}</span>${d ? `<em>${d}</em>` : ''}</div>`;
  const lines = s.lines.map(esc);
  $('card').innerHTML = `
    <div class="rc-bg"></div>
    <div class="rc-in">
      <div class="rc-top"><span class="pill">DAY ${s.n} RECAP${s.live ? ' · SO FAR' : ''}</span><span class="rc-brand">${esc(CONFIG.cityName)}</span></div>
      <div class="rc-grid">
        ${stat(fmt(s.inCity), 'Blockies in the city', `${plus(s.net)} today`)}
        ${stat(fmt(s.arrived.length), 'Arrived', s.legendary || s.rare ? `${s.legendary ? `${s.legendary} Legendary` : ''}${s.legendary && s.rare ? ' · ' : ''}${s.rare ? `${s.rare} Rare` : ''}` : '')}
        ${stat(fmt(s.left.length), 'Left the city', 'sold before they stayed')}
        ${stat(fmt(s.buildings), 'Buildings', `+${fmt(s.built)} finished today`)}
        ${stat(fmt(s.blocks), 'Blocks placed today', `${fmt(s.totalBlocks)} in all`)}
        ${stat(usd(s.bought), 'Bought so far', `of ${usd(CONFIG.unlockUsd)} to open NFT trading`)}
      </div>
      <div class="rc-row">
        <div class="rc-list"><h3>Milestones</h3>${lines.length ? lines.slice(0, 3).map((l) => `<div>${l}</div>`).join('') + (lines.length > 3 ? `<div class="muted">+${lines.length - 3} more</div>` : '') : '<div class="muted">The crew kept building homes and shops</div>'}</div>
        <div class="rc-stars"><h3>Stars of the day</h3><div class="pics">${s.stars.length ? s.stars.map((b) => `<figure><img src="${portraitUrl(b, { size: 160 })}" alt="${esc(b.name)}" /><figcaption>${esc(b.name)}<small>${esc(starLabel(b))}</small></figcaption></figure>`).join('') : '<div class="muted">No rare arrivals today</div>'}</div>
          ${s.mvp ? `<div class="mvp">🏆 Hardest worker: <b>${esc(s.mvp[0].name)}</b> · ${fmt(s.mvp[1])} blocks${s.mvp[0].from ? ` · ${esc(who(s.mvp[0].from, 20))}` : ''}</div>` : ''}
        </div>
      </div>
      <div class="rc-foot">${esc((CONFIG.siteUrl || location.origin).replace(/^https?:\/\//, ''))}${CONFIG.xHandle ? ` · @${esc(CONFIG.xHandle)}` : ''}</div>
    </div>`;

  const site = CONFIG.siteUrl || location.origin;
  const text = recapPost(s, `${site}/r/${s.n}`); // the link shows the card as an image on X
  const name = `basecity-day-${s.n}.png`;
  const png = () => toBlob($('card'), { pixelRatio: 2400 / $('card').offsetWidth, backgroundColor: '#050b22' });
  $('save').onclick = async () => {
    $('save').textContent = 'Saving…';
    try {
      const url = URL.createObjectURL(await png());
      Object.assign(document.createElement('a'), { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { console.warn('[recap] image', e); }
    $('save').textContent = '⬇ Save image';
  };
  $('share').onclick = async (e) => {
    // phones: share the image itself with the post (into the X app, or anywhere)
    if (!navigator.canShare || !matchMedia('(pointer: coarse)').matches) return; // the link opens X with the post
    e.preventDefault();
    try {
      const file = new File([await png()], name, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], text });
    } catch (err) { if (err?.name === 'AbortError') return; }
    open($('share').href, '_blank', 'noopener'); // couldn't share a file: the post with its link
  };
  $('share').href = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
  $('copy').onclick = async () => { try { await navigator.clipboard.writeText(text); $('copy').textContent = 'Copied ✓'; } catch { /* no clipboard */ } };
}

(async () => {
  $('card').innerHTML = '<div class="rc-in"><p class="muted">Replaying the city…</p></div>';
  const state = await fetchColony().catch(() => null);
  addNames(state?.names);
  const days = dayCount(state?.cityStart ?? Date.now());
  const asked = Number(new URLSearchParams(location.search).get('day'));
  render(recapOf(state, asked >= 1 && asked <= days ? asked : defaultDay(days)), days);
})();
