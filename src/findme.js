// Find yourself in BaseCity (docs/STOCK-NFTS-IDEAS.md #8): paste a 0x wallet or a name.base.eth and the
// drawer lists every Blocky that wallet brought. Picking one finds them in the city and the camera
// follows them (main.js onPick). Wallet lookups go through /api/claim, which already reads a wallet's
// Blockies out of the ledger (the same list the claim page shows).
import { esc } from './names.js';
import { makeBlocky } from './sim.js';

// onPick(b): find and follow a Blocky (id + name + role, enough for the builder card)
export function createFindMe({ onPick }) {
  const el = document.createElement('aside');
  el.className = 'directory panel';
  el.hidden = true;
  el.innerHTML = `<div class="dir-head"><h3>🔍 Find yourself <small id="fm-count"></small></h3><button type="button" class="dir-close" aria-label="Close">✕</button></div>
    <input id="fm-q" type="search" placeholder="0x… or name.base.eth" autocomplete="off" spellcheck="false" />
    <div class="dir-list" id="fm-list"><p class="dir-empty">Paste your wallet or Basename and find every Blocky it brought to the city.</p></div>
    <p class="fm-note">Your Blockies are the ones your $BLOCKY buys brought. The camera follows the one you pick.</p>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector(`#${id}`);
  let items = [];
  let last = '';

  function render(who, blockies) {
    items = blockies;
    $('fm-count').textContent = blockies.length ? `${blockies.length}` : '';
    $('fm-list').innerHTML = blockies.length
      ? `<ul>${blockies.map((b) => `<li><button type="button" data-id="${b.id}"><b>${esc(b.name)}</b><span>${esc(b.role)}${b.rarity && b.rarity !== 'Common' ? ` · ${esc(b.rarity)}` : ''}</span></button></li>`).join('')}</ul>`
      : `<p class="dir-empty">No Blocky of ${esc(who)} is in the city${last.startsWith('0x') ? '' : ' (Basename not found?)'}. Every $10 of $BLOCKY the wallet buys brings one.</p>`;
  }

  async function lookup(q) {
    last = q;
    const who = /^0x/i.test(q) ? q : `${q}${q.includes('.') ? '' : '.base.eth'}`;
    $('fm-list').innerHTML = '<p class="dir-empty">Looking up…</p>';
    try {
      const r = await fetch(`/api/claim?address=${encodeURIComponent(who)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'not found');
      // the claim API sends the Blocky numbers + their arrival time and seed: the same objects the city builds
      const list = (j.blockies || []).map((b) => {
        const made = makeBlocky(b.n, b.at, j.address, b.seed ?? null);
        return { id: b.n, name: made.name, role: made.role.label, rarity: made.rarity?.label };
      });
      render(j.name || q, list);
    } catch (e) {
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
