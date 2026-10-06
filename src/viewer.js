// The Blocky viewer (/b/N, or /b/jesse for a Base Builder): type a number or a name, see that Blocky
// head to toe in 3D walking, carrying, building or dancing (src/dance.js), its traits and its story, and
// take it home as a GIF, a PNG (with or without its background), a PFP or an X header.
import { CONFIG } from './config.js';
import { TRAIT_LABEL } from './sim.js';
import { fetchColony } from './data.js';
import { replay } from './replay.js';
import { renderPfp, paintBackground } from './pfp.js';
import { createStage, MOVES } from './dance.js';
import { mountSite, fmt, esc, nftInfo, opensea } from './site.js';
import { addNames, who } from './names.js';

mountSite('viewer');
const $ = (id) => document.getElementById(id);
let all = [], team = [], sim = null, info = null, move = 'walk', current = null, stage = null;

const keyIn = () => {
  const m = location.pathname.match(/^\/b\/([^/?#]+)/) || location.search.match(/[?&]n=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : location.hash.slice(1) || null;
};
const slugOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const slug = (b) => slugOf(b.name);
const isBuilder = (b) => b && b.kind !== 'blocky';
// a number (#12, 12) is a Blocky, anything else a Base Builder's name (or its start)
function find(key) {
  const k = String(key ?? '').trim().replace(/^#/, '');
  if (!k) return { b: null };
  if (/^\d+$/.test(k)) return { b: all[Number(k) - 1] || null, n: Number(k) };
  const s = slugOf(k);
  return { b: team.find((x) => slug(x) === s) || team.find((x) => slug(x).startsWith(s)) || null, name: k };
}
function save(href, file) {
  const a = Object.assign(document.createElement('a'), { href, download: file });
  document.body.appendChild(a); a.click(); a.remove();
}
const canvas = (w, h) => { const c = Object.assign(document.createElement('canvas'), { width: w, height: h }); return [c, c.getContext('2d')]; };
const image = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

// an X header (1500×500): the Blocky head to toe on the right, its name and the city on the left
async function header(b) {
  const [c, g] = canvas(1500, 500);
  paintBackground(g, b, 1500, 500);
  g.drawImage(await image(renderPfp(b, { size: 1040, mark: false, full: true, transparent: true })), 1500 - 520 - 110, -10, 520, 520);
  g.fillStyle = '#ffffff';
  g.font = '64px "Lilita One", Inter, sans-serif';
  g.fillText(b.name, 90, 230);
  g.font = '800 28px Inter, system-ui, sans-serif';
  g.globalAlpha = 0.9;
  g.fillText(isBuilder(b) ? `${b.office ? `${b.office.label} · ` : ''}Base Builder · building ${CONFIG.cityName}` : `${b.rarity.label}${b.trait ? ` · ${TRAIT_LABEL[b.trait]}` : ''} · building ${CONFIG.cityName} on Base`, 92, 285);
  g.globalAlpha = 0.75;
  g.fillText((CONFIG.siteUrl || location.origin).replace(/^https?:\/\//, ''), 92, 335);
  return c.toDataURL('image/png');
}

function show(key) {
  const { b, n, name } = find(key);
  current = b || null;
  $('num').value = b ? (isBuilder(b) ? b.name : b.id) : key ?? '';
  const list = b && isBuilder(b) ? team : all, i = b ? list.indexOf(b) : -1;
  $('prev').disabled = i <= 0;
  $('next').disabled = i < 0 || i >= list.length - 1;
  if (b) history.replaceState(null, '', `/b/${isBuilder(b) ? slug(b) : b.id}`);
  if (!b) {
    const max = fmt(all.length);
    $('over').innerHTML = name
      ? `<div class="empty"><b>?</b><p>No Base Builder called “${esc(name)}”. Try a number from #1 to #${max}, or a name: ${team.slice(0, 4).map((x) => esc(x.name)).join(', ')}…</p></div>`
      : `<div class="empty"><b>#${n ? fmt(n) : '?'}</b><p>${n > all.length ? `Not here yet: ${max} Blockies have arrived so far. Every $${CONFIG.usdPerBlocky} of ${CONFIG.ticker} brings the next one.` : `Pick a Blocky from #1 to #${max}, or a Base Builder by name.`}</p>${CONFIG.buyUrl && n > all.length ? `<a class="btn primary" href="${CONFIG.buyUrl}" target="_blank" rel="noopener">Bring the next one</a>` : ''}</div>`;
    $('stage').classList.add('none');
    $('facts').innerHTML = '';
    $('acts').hidden = true;
    $('title').textContent = 'Blocky viewer';
    return;
  }
  document.title = `${b.name} · ${CONFIG.cityName}`;
  $('title').textContent = b.name;
  $('stage').classList.remove('none');
  stage.blocky = b;
  $('acts').hidden = false;
  if (isBuilder(b)) {
    $('over').innerHTML = `<span class="tag builder">${b.kind === 'founder' ? 'Founder' : '★ Base Builder'}</span>`;
    const now = Date.now();
    const rows = [
      ['Role', b.kind === 'founder' ? 'Founder' : 'Base Builder'],
      ...(b.office ? [['City Council', b.office.label]] : []),
      ...(b.legend?.title ? [['Who', esc(b.legend.title)]] : []),
      ['Building since', new Date(b.arrivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
      ['Blocks placed', fmt(sim.blocksBy(b, now))],
      ...(b.legend?.x ? [['On 𝕏', `<a href="https://x.com/${esc(b.legend.x.replace(/^@/, ''))}" target="_blank" rel="noopener">@${esc(b.legend.x.replace(/^@/, ''))}</a>`]] : []),
    ];
    $('facts').innerHTML = rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('');
    $('opensea').hidden = true;
    return;
  }
  $('over').innerHTML = `<span class="tag ${b.rarity.id}">${b.rarity.label}</span>`;
  const now = Date.now(), here = !Number.isFinite(b.leftAt);
  const citizenAt = info ? Math.max(b.arrivedAt + info.citizenDays * 86400e3, info.openedAt ?? Infinity) : Infinity;
  const status = !here ? `Left the city ${new Date(b.leftAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : citizenAt <= now ? 'Citizen: claimable as an NFT' : 'Newcomer in the city';
  const rows = [
    ['Rarity', `<span class="r ${b.rarity.id}">${b.rarity.label}</span>`],
    ['Trait', b.trait ? TRAIT_LABEL[b.trait] : 'None'],
    ['Role', b.role.label],
    ['Status', status],
    ['Brought by', b.from ? `<a href="/claim.html?address=${b.from}">${esc(who(b.from, 28))}</a>` : '—'],
    ['Arrived', new Date(b.arrivedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })],
    ['Blocks placed', fmt(sim.blocksBy(b, Math.min(now, b.leftAt ?? now)))],
  ];
  $('facts').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('opensea').hidden = !(info?.contract && here && citizenAt <= now);
  if (info?.contract) $('opensea').href = opensea(info.contract, b.id);
}

function controls() {
  const chips = (group) => Object.entries(MOVES).filter(([, m]) => m.group === group).map(([id, m]) => `<button type="button" class="chip${id === move ? ' on' : ''}" data-m="${id}">${m.label}</button>`).join('');
  $('moves').innerHTML = `<span class="lbl">In the city</span>${chips('city')}<span class="lbl">Dance</span>${chips('dance')}`;
  $('moves').onclick = (e) => {
    const id = e.target.closest('[data-m]')?.dataset.m;
    if (!id) return;
    move = id;
    stage.move = id;
    for (const x of $('moves').querySelectorAll('[data-m]')) x.classList.toggle('on', x.dataset.m === id);
  };
  $('go').onsubmit = (e) => { e.preventDefault(); show($('num').value); };
  const step = (d) => {
    const list = isBuilder(current) ? team : all, i = list.indexOf(current) + d;
    if (list[i]) show(isBuilder(list[i]) ? list[i].name : list[i].id);
  };
  $('prev').onclick = () => step(-1);
  $('next').onclick = () => step(1);
  $('random').onclick = () => show(1 + Math.floor(Math.random() * all.length));
  addEventListener('keydown', (e) => {
    if (e.target.closest('input')) return;
    if (e.key === 'ArrowLeft') $('prev').click();
    if (e.key === 'ArrowRight') $('next').click();
  });
  const dl = { body: () => renderPfp(current, { size: 2048, mark: true, full: true }), clear: () => renderPfp(current, { size: 2048, mark: false, full: true, transparent: true }), pfp: () => renderPfp(current, { size: 1024 }) };
  $('acts').onclick = async (e) => {
    const a = e.target.closest('[data-dl]')?.dataset.dl;
    if (!a || !current) return;
    if (a === 'gif') {
      const btn = e.target.closest('[data-dl]');
      btn.textContent = 'Making the GIF…';
      await new Promise((ok) => setTimeout(ok, 30));
      const url = URL.createObjectURL(new Blob([stage.gif()], { type: 'image/gif' }));
      save(url, `basecity-${slug(current)}-${move}.gif`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      btn.textContent = '⬇ GIF';
      return;
    }
    if (a === 'header') return save(await header(current), `basecity-${slug(current)}-x-header.png`);
    save(dl[a](), `basecity-${slug(current)}${a === 'clear' ? '-transparent' : a === 'pfp' ? '-pfp' : ''}.png`);
  };
  $('share').onclick = () => {
    if (!current) return;
    const link = `${CONFIG.siteUrl || location.origin}/b/${isBuilder(current) ? slug(current) : current.id}`;
    const who = current.legend?.x ? `@${current.legend.x.replace(/^@/, '')}` : current.name;
    const text = isBuilder(current)
      ? `${who} is a voxel Base Builder in ${CONFIG.cityName}${current.office ? `, and its ${current.office.label}` : ''} 🧱\n\n${link}${CONFIG.xHandle ? ` · @${CONFIG.xHandle}` : ''}`
      : `Meet ${current.name}: a ${current.rarity.label}${current.trait ? ` (${TRAIT_LABEL[current.trait]})` : ''} Blocky building ${CONFIG.cityName} on Base 🧱\n\n${link}${CONFIG.xHandle ? ` · @${CONFIG.xHandle}` : ''}`;
    open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };
}

(async () => {
  stage = createStage($('stage'));
  stage.move = move;
  controls();
  $('over').innerHTML = '<div class="empty"><p>Loading the city…</p></div>';
  const [state, nft] = await Promise.all([fetchColony().catch(() => null), nftInfo()]);
  info = nft;
  addNames(state?.names);
  const r = replay(state);
  all = r.blockies;
  team = r.team;
  sim = r.sim;
  $('names').innerHTML = team.map((b) => `<option value="${esc(b.name)}"></option>`).join('');
  $('count').textContent = fmt(all.length);
  show(keyIn() ?? (1 + Math.floor(Math.random() * all.length)));
})();
