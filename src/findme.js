// Find yourself in BaseCity: paste a 0x wallet or a name.base.eth to locate your Blockies,
// your Whale Building (if any), and generate a Golden Hour X Flex Card.
import { esc } from './names.js';
import { makeBlocky } from './sim.js';
import { renderPfp } from './pfp.js';
import { CONFIG } from './config.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function buildFlexCard({ blocky, ownerLabel, buildingName, blocksPlaced, cityShot }) {
  const cv = document.createElement('canvas');
  cv.width = 1200;
  cv.height = 675;
  const g = cv.getContext('2d');

  // Golden Hour backdrop from live city capture
  g.fillStyle = '#0d1526';
  g.fillRect(0, 0, 1200, 675);
  if (cityShot) {
    try {
      const bg = await loadImage(cityShot);
      const scale = Math.max(1200 / bg.width, 675 / bg.height);
      const w = bg.width * scale, h = bg.height * scale;
      g.drawImage(bg, (1200 - w) / 2, (675 - h) / 2, w, h);
    } catch { /* fallback to gradient */ }
  }

  // Golden Hour cinema vignette + warm sunlight wash
  const sun = g.createLinearGradient(0, 0, 1200, 675);
  sun.addColorStop(0, 'rgba(255, 184, 102, 0.24)');
  sun.addColorStop(0.5, 'rgba(13, 21, 38, 0.45)');
  sun.addColorStop(1, 'rgba(10, 14, 26, 0.88)');
  g.fillStyle = sun;
  g.fillRect(0, 0, 1200, 675);

  const leftGrad = g.createLinearGradient(0, 0, 740, 0);
  leftGrad.addColorStop(0, 'rgba(10, 14, 24, 0.88)');
  leftGrad.addColorStop(1, 'rgba(10, 14, 24, 0)');
  g.fillStyle = leftGrad;
  g.fillRect(0, 0, 740, 675);

  // Border frame
  g.strokeStyle = 'rgba(255, 200, 61, 0.45)';
  g.lineWidth = 4;
  g.strokeRect(18, 18, 1164, 639);

  // Header badge
  g.fillStyle = '#0052ff';
  g.beginPath();
  g.roundRect(56, 52, 236, 38, 19);
  g.fill();
  g.fillStyle = '#ffffff';
  g.font = '800 16px Inter, system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('BASECITY · GOLDEN HOUR', 78, 72);

  // Blocky PFP on right
  try {
    const pfpUrl = renderPfp(blocky, { size: 512, mark: false, full: true, transparent: true });
    const pfp = await loadImage(pfpUrl);
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.55)';
    g.shadowBlur = 32;
    g.drawImage(pfp, 730, 88, 430, 430);
    g.restore();
  } catch { /* ignore pfp failure */ }

  // Main typography
  g.fillStyle = '#ffc83d';
  g.font = '800 22px Inter, system-ui, sans-serif';
  g.fillText(`${ownerLabel}`, 58, 148);

  g.fillStyle = '#ffffff';
  g.font = '800 64px "Lilita One", Inter, system-ui, sans-serif';
  g.fillText(blocky.name, 56, 214);

  g.fillStyle = '#b9c6dc';
  g.font = '700 26px Inter, system-ui, sans-serif';
  const roleLine = `${blocky.role.label}${blocky.rarity?.id && blocky.rarity.id !== 'common' ? ` · ${blocky.rarity.label}` : ''}`;
  g.fillText(roleLine, 58, 272);

  // Stat pills
  const stats = [
    ['BLOCKS PLACED', `${Math.floor(blocksPlaced || 0).toLocaleString('en-US')} `],
    ['BUILDING', buildingName || 'Core City'],
    ['NETWORK', 'Base Mainnet'],
  ];
  stats.forEach(([k, v], i) => {
    const y = 342 + i * 74;
    g.fillStyle = 'rgba(255, 255, 255, 0.08)';
    g.beginPath();
    g.roundRect(56, y, 540, 60, 14);
    g.fill();
    g.fillStyle = '#9aa6b8';
    g.font = '800 13px Inter, system-ui, sans-serif';
    g.fillText(k, 76, y + 20);
    g.fillStyle = '#ffffff';
    g.font = '800 22px Inter, system-ui, sans-serif';
    g.fillText(v.length > 34 ? `${v.slice(0, 33)}…` : v, 76, y + 43);
  });

  // Footer
  g.fillStyle = '#9aa6b8';
  g.font = '700 18px Inter, system-ui, sans-serif';
  g.fillText((CONFIG.siteUrl || 'https://basecity.space').replace(/^https?:\/\//, ''), 58, 616);
  g.fillStyle = '#ffc83d';
  g.font = '800 18px Inter, system-ui, sans-serif';
  g.textAlign = 'right';
  g.fillText(`${CONFIG.ticker} · Built 24/7 on Base`, 1142, 616);

  return cv.toDataURL('image/png');
}

export function createFindMe({ onPick, onFlyBuilding, getWhaleBuilding, getBlockyStats, captureFrame }) {
  const el = document.createElement('aside');
  el.className = 'directory panel';
  el.hidden = true;
  el.innerHTML = `<div class="dir-head"><h3>Find me & Flex Card <small id="fm-count"></small></h3><button type="button" class="dir-close" aria-label="Close">Close</button></div>
    <input id="fm-q" type="search" placeholder="0x… or name.base.eth" autocomplete="off" spellcheck="false" />
    <div id="fm-bldg" class="fm-bldg" hidden></div>
    <div class="dir-list" id="fm-list"><p class="dir-empty">Paste your wallet or Basename to find your Blockies, your building, and export a Golden Hour X Flex Card.</p></div>
    <div id="fm-card-box" class="fm-card-box" hidden></div>
    <p class="fm-note">Your Blockies are the ones your $BLOCKY buys brought. Click one to follow it or generate a shareable Golden Hour X card.</p>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector(`#${id}`);
  let items = [];
  let last = '';
  let currentAddr = null;
  let currentName = null;
  let currentBuilding = null;

  function render(who, blockies) {
    items = blockies;
    $('fm-count').textContent = blockies.length ? `${blockies.length}` : '';
    const bldgEl = $('fm-bldg');
    currentBuilding = currentAddr && getWhaleBuilding ? getWhaleBuilding(currentAddr) : null;
    if (currentBuilding) {
      bldgEl.hidden = false;
      bldgEl.innerHTML = `<div class="fm-bldg-row"><div><small>YOUR LANDMARK</small><b>${esc(currentBuilding.name)}</b></div><button type="button" class="btn small-pill" id="fm-fly-bldg">Fly there</button></div>`;
      bldgEl.querySelector('#fm-fly-bldg').onclick = () => {
        onFlyBuilding?.(currentBuilding);
        if (innerWidth <= 900) api.close();
      };
    } else {
      bldgEl.hidden = true;
    }

    $('fm-list').innerHTML = blockies.length
      ? `<ul>${blockies.map((b) => `<li class="fm-item"><button type="button" class="fm-pick" data-id="${b.id}"><b>${esc(b.name)}</b><span>${esc(b.role)}${b.rarity && b.rarity !== 'Common' ? ` · ${esc(b.rarity)}` : ''}</span></button><button type="button" class="fm-flex-btn" data-flex="${b.id}" title="Generate Golden Hour X Card"></button></li>`).join('')}</ul>`
      : `<p class="dir-empty">No Blocky of ${esc(who)} is in the city${last.startsWith('0x') ? '' : ' (Basename not found?)'}. Every $10 of $BLOCKY the wallet buys brings one.</p>`;
  }

  async function generateFlex(b) {
    const box = $('fm-card-box');
    box.hidden = false;
    box.innerHTML = '<p class="dir-empty">Rendering Golden Hour X card…</p>';
    const stats = getBlockyStats ? getBlockyStats(b.id) : null;
    const cityShot = captureFrame ? captureFrame() : null;
    const ownerLabel = currentName || (currentAddr ? `${currentAddr.slice(0, 6)}…${currentAddr.slice(-4)}` : 'BaseCity Builder');
    const url = await buildFlexCard({
      blocky: b.raw || makeBlocky(b.id, Date.now(), currentAddr),
      ownerLabel,
      buildingName: currentBuilding?.name || stats?.buildingName || 'Core City',
      blocksPlaced: stats?.blocks ?? 0,
      cityShot,
    });
    const text = `Building BaseCity 24/7 with ${b.name} (${b.role}) \n\n${(CONFIG.siteUrl || 'https://basecity.space').replace(/\/$/, '')}`;
    box.innerHTML = `<img class="fm-shot" src="${url}" alt="BaseCity Golden Hour Card" />
      <div class="fm-actions">
        <a class="btn small" download="basecity-${b.id}-flex.png" href="${url}">⬇ Save PNG</a>
        <a class="btn small primary" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(text)}">𝕏 Share</a>
      </div>`;
  }

  async function lookup(q) {
    last = q;
    $('fm-card-box').hidden = true;
    const who = /^0x/i.test(q) ? q : `${q}${q.includes('.') ? '' : '.base.eth'}`;
    $('fm-list').innerHTML = '<p class="dir-empty">Looking up…</p>';
    try {
      const r = await fetch(`/api/claim?address=${encodeURIComponent(who)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'not found');
      currentAddr = j.address || null;
      currentName = j.name || null;
      const list = (j.blockies || []).map((b) => {
        const made = makeBlocky(b.n, b.at, j.address, b.seed ?? null);
        return { id: b.n, name: made.name, role: made.role.label, rarity: made.rarity?.label, raw: made };
      });
      render(j.name || q, list);
    } catch (e) {
      currentAddr = null;
      currentName = null;
      $('fm-list').innerHTML = `<p class="dir-empty">${esc(e.message || 'Could not read that wallet. Try a 0x address.')}</p>`;
    }
  }

  let timer = null;
  $('fm-q').addEventListener('input', () => {
    clearTimeout(timer);
    const q = $('fm-q').value.trim();
    if (!q) return;
    timer = setTimeout(() => lookup(q), 500);
  });
  $('fm-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); const q = $('fm-q').value.trim(); if (q) lookup(q); } });
  el.addEventListener('click', (e) => {
    if (e.target.closest('.dir-close')) return api.close();
    const flexBtn = e.target.closest('[data-flex]');
    if (flexBtn) {
      const b = items.find((x) => String(x.id) === flexBtn.dataset.flex);
      if (b) generateFlex(b);
      return;
    }
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const b = items.find((x) => String(x.id) === btn.dataset.id);
    if (b) onPick(b);
    if (innerWidth <= 900) api.close();
  });
  el.addEventListener('keydown', (e) => e.stopPropagation());

  const api = {
    get open() { return !el.hidden; },
    show() { el.hidden = false; $('fm-q').focus(); },
    close() { el.hidden = true; },
    toggle() { if (el.hidden) api.show(); else api.close(); },
  };
  return api;
}
