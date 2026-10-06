// The daily recap: what the city did on day N (a day = 24 h from the city's start), replayed from the
// same ledger as the city: Blockies in and out, buildings finished, blocks placed, landmarks, whales,
// the day's rarest arrivals and its hardest worker. A card to screenshot and a post to share.
import { CONFIG } from './config.js';
import { TRAIT_LABEL } from './sim.js';
import { fetchColony } from './data.js';
import { replay } from './replay.js';
import { portraitUrl } from './portraits.js';
import { mountSite, fmt, esc } from './site.js';
import { addNames, who } from './names.js';

mountSite('recap');
const $ = (id) => document.getElementById(id);
const DAY = 86400e3;
const RANK = { legendary: 0, rare: 1, uncommon: 2, common: 3 };
const reserved = (b) => b.id <= (CONFIG.nft.reserve?.count || 0) && b.from === CONFIG.nft.reserve?.wallet?.toLowerCase();
const usd = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
const when = (t) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function dayStats(r, n, now) {
  const t0 = r.start + (n - 1) * DAY, t1 = Math.min(r.start + n * DAY, now);
  const { sim, blockies } = r;
  const here = (b, t) => b.arrivedAt <= t && !(b.leftAt <= t);
  const before = blockies.filter((b) => here(b, t0)).length;
  const after = blockies.filter((b) => here(b, t1)).length;
  const arrived = blockies.filter((b) => b.arrivedAt >= t0 && b.arrivedAt < t1);
  const left = blockies.filter((b) => b.leftAt >= t0 && b.leftAt < t1);
  sim.advance(t1);
  const done = sim.done.filter((p) => p.at >= t0 && p.at < t1);
  const best = arrived.filter((b) => b.rarity.id !== 'common').sort((a, b) => RANK[a.rarity.id] - RANK[b.rarity.id] || a.id - b.id);
  const workers = blockies.filter((b) => !reserved(b) && here(b, t1)).map((b) => [b, sim.blocksBy(b, t1) - sim.blocksBy(b, Math.max(t0, b.arrivedAt))]).sort((a, b) => b[1] - a[1]);
  return {
    n, t0, t1, live: t1 < r.start + n * DAY,
    inCity: after, net: after - before, arrived, left,
    buildings: sim.buildingCount, built: done.filter((p) => p.kind === 'building').length,
    blocks: sim.workAt(t1) - sim.workAt(t0), totalBlocks: sim.workAt(t1),
    landmarks: done.filter((p) => p.kind === 'landmark' || p.kind === 'metro'),
    whales: done.filter((p) => p.kind === 'wonder'),
    land: done.filter((p) => p.kind === 'expand'),
    legendary: arrived.filter((b) => b.rarity.id === 'legendary').length,
    rare: arrived.filter((b) => b.rarity.id === 'rare').length,
    stars: best.slice(0, 6), mvp: workers[0],
  };
}

function render(r, s, state, days) {
  $('tabs').innerHTML = Array.from({ length: days }, (_, i) => `<a href="?day=${i + 1}" class="chip${i + 1 === s.n ? ' on' : ''}">Day ${i + 1}${i + 1 === days && s.live && i + 1 === s.n ? ' · live' : ''}</a>`).join('');
  $('when').textContent = `${when(s.t0)} → ${s.live ? 'now' : when(s.t1)}`;
  const stat = (v, k, d) => `<div class="rs"><b>${v}</b><span>${k}</span>${d ? `<em>${d}</em>` : ''}</div>`;
  const plus = (v) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : '±0');
  const lines = [
    ...s.landmarks.map((p) => `🏛️ ${esc(p.name)}`),
    ...s.whales.map((p) => `${p.build === 'fountain' ? '⛲' : '🏙️'} ${esc(p.whale.tier || 'Whale Fountain')} for ${esc(who(p.whale.from, 20))} (${usd(p.whale.usd)})`),
    ...s.land.map((p) => `🌍 ${esc(p.name)}`),
  ];
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
        ${stat(usd(state?.boughtUsd ?? 0), 'Bought so far', `of ${usd(CONFIG.unlockUsd)} to open NFT trading`)}
      </div>
      <div class="rc-row">
        <div class="rc-list"><h3>Milestones</h3>${lines.length ? lines.slice(0, 3).map((l) => `<div>${l}</div>`).join('') + (lines.length > 3 ? `<div class="muted">+${lines.length - 3} more</div>` : '') : '<div class="muted">The crew kept building homes and shops</div>'}</div>
        <div class="rc-stars"><h3>Stars of the day</h3><div class="pics">${s.stars.length ? s.stars.map((b) => `<figure><img src="${portraitUrl(b, { size: 160 })}" alt="${esc(b.name)}" /><figcaption>${esc(b.name)}<small>${b.rarity.label}${b.trait ? ` · ${TRAIT_LABEL[b.trait]}` : ''}</small></figcaption></figure>`).join('') : '<div class="muted">No rare arrivals today</div>'}</div>
          ${s.mvp && s.mvp[1] > 0 ? `<div class="mvp">🏆 Hardest worker: <b>${esc(s.mvp[0].name)}</b> · ${fmt(s.mvp[1])} blocks${s.mvp[0].from ? ` · ${esc(who(s.mvp[0].from, 20))}` : ''}</div>` : ''}
        </div>
      </div>
      <div class="rc-foot">${esc((CONFIG.siteUrl || location.origin).replace(/^https?:\/\//, ''))}${CONFIG.xHandle ? ` · @${esc(CONFIG.xHandle)}` : ''}</div>
    </div>`;
  const site = CONFIG.siteUrl || location.origin;
  const text = `${CONFIG.cityName}: Day ${s.n} recap${s.live ? ' (so far)' : ''} 🏙\n\n`
    + `🧱 ${fmt(s.inCity)} Blockies in the city (${plus(s.net)})\n`
    + `🏢 ${fmt(s.built)} buildings finished · ${fmt(s.blocks)} blocks placed\n`
    + (s.landmarks.length ? `🏛️ ${s.landmarks.map((p) => p.name).join(', ')}\n` : '')
    + (s.whales.length ? `🐋 ${s.whales.length} whale build${s.whales.length > 1 ? 's' : ''}\n` : '')
    + (s.legendary || s.rare ? `✨ ${[s.legendary && `${s.legendary} Legendary`, s.rare && `${s.rare} Rare`].filter(Boolean).join(', ')} arrived\n` : '')
    + `🚶 ${fmt(s.left.length)} walked out\n\n${site}/recap.html?day=${s.n}${CONFIG.xHandle ? ` · @${CONFIG.xHandle}` : ''}`;
  $('share').href = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
  $('copy').onclick = async () => { try { await navigator.clipboard.writeText(text); $('copy').textContent = 'Copied ✓'; } catch { /* no clipboard */ } };
}

(async () => {
  $('card').innerHTML = '<div class="rc-in"><p class="muted">Replaying the city…</p></div>';
  const state = await fetchColony().catch(() => null);
  addNames(state?.names);
  const r = replay(state);
  const now = Date.now();
  const days = Math.max(1, Math.floor((now - r.start) / DAY) + 1);
  const asked = Number(new URLSearchParams(location.search).get('day'));
  // the last full day by default (the day so far before the first one ends)
  const n = asked >= 1 && asked <= days ? asked : Math.max(1, days - 1);
  render(r, dayStats(r, n, now), state, days);
})();
