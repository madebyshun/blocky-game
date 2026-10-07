// The city directory: every building standing in BaseCity, grouped (under construction, Base Avenue,
// landmarks, whale towers, then each district), with a search. Picking one flies the camera to it
// (main.js flyTo). It reads the city sim each time it's shown, so it's always what stands now.
import { LANDMARKS } from './sim.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const regionOf = (lot) => `${Math.round(lot[0] / 3)},${Math.round(lot[1] / 3)}`; // the district a lot is in (districts.js)

// sim(): the city sim; districts(): [{ key, name }]; minted(): Blockies in the city now; who(address): a
// short HTML name for a wallet; onPick({ lot, h, name }): fly there
// note(p): a word on a building, if any (src/chips.js: waiting for chips)
export function createDirectory({ sim, districts, minted, who, onPick, note = () => '' }) {
  const el = document.createElement('aside');
  el.className = 'directory panel';
  el.hidden = true;
  el.innerHTML = `<div class="dir-head"><h3>🏙 City directory <small id="dir-count"></small></h3><button type="button" class="dir-close" aria-label="Close">✕</button></div>
    <input id="dir-q" type="search" placeholder="Search a building, a district…" autocomplete="off" />
    <div class="dir-list" id="dir-list"></div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector(`#${id}`);
  let items = [], timer = null;

  function collect() {
    const S = sim();
    if (!S) return [];
    const out = [];
    const names = new Map(districts().map((d) => [d.key, d.name]));
    const sites = (S.sites || []).filter((x) => x.p?.lot);
    const building = new Set(sites.map((x) => x.p.type));
    for (const x of sites) {
      const pct = Math.min(99, Math.floor((x.placed / x.p.cost) * 100));
      out.push({ group: 'site', name: x.p.name, sub: `🏗 ${pct}% built`, lot: x.p.lot, h: x.p.h || 2 });
    }
    const standing = new Set();
    for (const p of S.standing.values()) {
      if (!p.lot) continue;
      standing.add(p.type);
      const ruin = !!p.ruinedAt;
      const n = note(p);
      if (p.kind === 'landmark') out.push({ group: p.brand ? 'avenue' : 'landmark', name: p.name, sub: n || (p.brand ? `Plot ${p.brand.plot} · ${p.brand.tagline || ''}` : names.get(regionOf(p.lot)) || ''), lot: p.lot, h: p.h });
      else if (p.kind === 'wonder') out.push({ group: 'whale', name: p.name, sub: p.whale?.lostAt < Infinity ? 'gone dark: for sale to the next whale' : `named after ${who(p.whale?.from) || 'a whale'}`, html: true, lot: p.lot, h: p.h });
      else out.push({ group: `d:${regionOf(p.lot)}`, district: names.get(regionOf(p.lot)) || 'The outskirts', name: p.name, sub: ruin ? '🏚 abandoned' : n, lot: p.lot, h: p.h });
    }
    // Base Avenue plots still waiting for their HQ
    for (const l of LANDMARKS) {
      if (!l.brand || standing.has(l.id) || building.has(l.id)) continue;
      out.push({ group: 'avenue', name: l.label, sub: minted() >= l.at ? `Plot ${l.brand.plot} · breaking ground soon` : `Plot ${l.brand.plot} · coming soon at ${fmt(l.at)} Blockies`, lot: l.lot, h: 1, soon: true });
    }
    return out;
  }

  function render() {
    items = collect();
    const q = $('dir-q').value.trim().toLowerCase();
    const hit = (it) => !q || it.name.toLowerCase().includes(q) || (it.district || '').toLowerCase().includes(q) || (!it.html && it.sub.toLowerCase().includes(q));
    const row = (it) => `<li><button type="button" data-i="${items.indexOf(it)}"><b>${esc(it.name)}</b>${it.sub ? `<span>${it.html ? it.sub : esc(it.sub)}</span>` : ''}</button></li>`;
    const was = new Map([...el.querySelectorAll('details[data-k]')].map((d) => [d.dataset.k, d.open])); // keep what's open across refreshes
    const section = (title, list, open = true) => (list.length ? `<details data-k="${esc(title)}"${q || (was.get(title) ?? open) ? ' open' : ''}><summary>${title} <small>${list.length}</small></summary><ul>${list.map(row).join('')}</ul></details>` : '');
    const by = (g) => items.filter((it) => it.group === g && hit(it));
    const byName = (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true });
    const districtGroups = new Map();
    for (const it of items) if (it.group.startsWith('d:') && hit(it)) { const k = it.district; districtGroups.set(k, [...(districtGroups.get(k) || []), it]); }
    const parts = [
      section('🏗 Under construction', by('site')),
      section('🏛 Base Avenue', by('avenue').sort((a, b) => (a.soon - b.soon) || byName(a, b))),
      section('⭐ Landmarks', by('landmark').sort(byName)),
      section('🐋 Whale towers', by('whale').sort(byName)),
      ...[...districtGroups.entries()].sort((a, b) => b[1].length - a[1].length).map(([name, list]) => section(`🏘 ${esc(name)}`, list.sort(byName), false)),
    ];
    $('dir-list').innerHTML = parts.join('') || `<p class="dir-empty">${q ? 'Nothing by that name.' : 'Nothing built yet.'}</p>`;
    $('dir-count').textContent = `${fmt(items.filter((it) => !it.soon && it.group !== 'site').length)} buildings`;
  }

  el.addEventListener('click', (e) => {
    if (e.target.closest('.dir-close')) return api.close();
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[+b.dataset.i];
    if (!it) return;
    for (const x of el.querySelectorAll('.on')) x.classList.remove('on');
    b.classList.add('on');
    onPick(it);
    if (innerWidth <= 900) api.close(); // phones: get out of the way of the view
  });
  $('dir-q').addEventListener('input', render);
  el.addEventListener('keydown', (e) => e.stopPropagation()); // typing a search isn't a shortcut

  const api = {
    get open() { return !el.hidden; },
    show() { el.hidden = false; render(); clearInterval(timer); timer = setInterval(render, 5000); },
    close() { el.hidden = true; clearInterval(timer); },
    toggle() { if (el.hidden) api.show(); else api.close(); },
  };
  return api;
}
