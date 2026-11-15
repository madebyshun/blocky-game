// The weekly city paper: what BaseCity did in its week N — a page to read and a card to share on X.
// Same replay and card as the daily recap (src/recap.js), seven days at a time.
import { CONFIG } from './config.js';
import { fetchColony } from './data.js';
import { portraitUrl } from './portraits.js';
import { mountSite, fmt, esc } from './site.js';
import { addNames, who } from './names.js';
import { toBlob } from 'html-to-image';
import { weeklyOf, weeklyPost, weekCount, defaultWeek, usd, plus, starLabel, buildingNote } from './recap-data.js';

mountSite('weekly');
const $ = (id) => document.getElementById(id);
const day = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

function render(s, weeks) {
  $('tabs').innerHTML = Array.from({ length: weeks }, (_, i) => `<a href="?week=${i + 1}" class="chip${i + 1 === s.n ? ' on' : ''}">Week ${i + 1}${i + 1 === weeks ? ' · live' : ''}</a>`).join('');
  $('when').textContent = `${day(s.t0)} → ${s.live ? 'now' : day(s.t1)} · ${s.days} day${s.days > 1 ? 's' : ''}`;
  const stat = (v, k, d) => `<div class="rs"><b>${v}</b><span>${k}</span>${d ? `<em>${d}</em>` : ''}</div>`;
  const lines = s.lines.map(esc);
  $('card').innerHTML = `
    <div class="rc-bg"></div>
    <div class="rc-in">
      <div class="rc-top"><span class="pill">WEEK ${s.n}${s.live ? ' · SO FAR' : ''}</span><span class="rc-brand">${esc(CONFIG.cityName)}</span></div>
      <div class="rc-grid">
        ${stat(fmt(s.inCity), 'Blockies in the city', `${plus(s.net)} this week`)}
        ${stat(fmt(s.arrived.length), 'Arrived', s.legendary || s.rare ? `${s.legendary ? `${s.legendary} Legendary` : ''}${s.legendary && s.rare ? ' · ' : ''}${s.rare ? `${s.rare} Rare` : ''}` : '')}
        ${stat(fmt(s.left.length), 'Left the city', 'sold before they stayed')}
        ${stat(fmt(s.everBuilt), 'Buildings built', buildingNote(s))}
        ${stat(fmt(s.blocks), 'Blocks placed this week', `${fmt(s.totalBlocks)} in all`)}
        ${stat(usd(s.bought), 'Bought so far', `since launch · $${CONFIG.usdPerBlocky} = 1 Blocky`)}
      </div>
      <div class="rc-row">
        <div class="rc-list">
          <h3>MILESTONES</h3>
          ${(lines.length ? lines.slice(0, 5) : ['The crew kept building homes and shops all week']).map((l) => `<div>${l}</div>`).join('')}
          ${lines.length > 5 ? `<div>+${lines.length - 5} more</div>` : ''}
        </div>
        <div class="rc-stars">
          <h3>BUILDERS OF THE WEEK</h3>
          <div class="pics">
            ${s.stars.map((b) => `<figure><img src="${portraitUrl(b, { size: 128 })}" alt=""><figcaption>${esc(b.name)}<small>${esc(starLabel(b))}</small></figcaption></figure>`).join('')}
            ${s.stars.length ? '' : '<div class="muted">No rare arrivals this week</div>'}
          </div>
          ${s.mvp ? `<div class="mvp">Hardest worker: ${esc(s.mvp[0].name)} · ${fmt(s.mvp[1])} blocks${s.mvp[0].from ? ` · ${esc(who(s.mvp[0].from, 20))}` : ''}</div>` : ''}
        </div>
      </div>
      <div class="rc-foot">${esc((CONFIG.siteUrl || '').replace(/^https?:\/\//, ''))}${CONFIG.xHandle ? ` · @${CONFIG.xHandle}` : ''}</div>
    </div>`;
  const text = weeklyPost(s, `${location.origin}${CONFIG.siteUrl ? '' : ''}/weekly?week=${s.n}`);
  $('share').href = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
  $('copy').textContent = 'Copy the post';
  $('copy').onclick = async () => { try { await navigator.clipboard.writeText(text); $('copy').textContent = 'Copied ✓'; } catch { /* no clipboard */ } };
  $('save').onclick = async () => {
    const blob = await toBlob($('card'), { pixelRatio: 2, backgroundColor: '#050b22' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `basecity-week-${s.n}.png`;
    a.click();
  };
}

$('card').innerHTML = '<div class="rc-in"><p class="muted">Replaying the week…</p></div>';
(async () => {
  const state = await fetchColony().catch(() => null);
  addNames(state?.names);
  const weeks = weekCount(state?.cityStart ?? Date.now());
  const asked = Number(new URLSearchParams(location.search).get('week'));
  render(weeklyOf(state, asked >= 1 && asked <= weeks ? asked : defaultWeek(weeks)), weeks);
})();
