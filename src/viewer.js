// The Blocky viewer (/b/N): type a number, see that Blocky head to toe in 3D doing its moves (src/dance.js),
// its traits and its story, and take it home as a dancing GIF, a PNG (with or without its background), a
// PFP or an X header.
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
let all = [], sim = null, info = null, move = 'gm', current = null, stage = null;

const numberIn = () => {
  const m = location.pathname.match(/^\/b\/(\d+)/) || location.search.match(/[?&]n=(\d+)/);
  return m ? Number(m[1]) : Number(location.hash.slice(1)) || null;
};
const slug = (b) => b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  g.fillText(`${b.rarity.label}${b.trait ? ` · ${TRAIT_LABEL[b.trait]}` : ''} · building ${CONFIG.cityName} on Base`, 92, 285);
  g.globalAlpha = 0.75;
  g.fillText((CONFIG.siteUrl || location.origin).replace(/^https?:\/\//, ''), 92, 335);
  return c.toDataURL('image/png');
}

function show(n) {
  const b = all[n - 1];
  current = b || null;
  $('num').value = n || '';
  $('prev').disabled = !n || n <= 1;
  $('next').disabled = !n || n >= all.length;
  if (n) history.replaceState(null, '', `/b/${n}`);
  if (!b) {
    const max = fmt(all.length);
    $('over').innerHTML = `<div class="empty"><b>#${n ? fmt(n) : '?'}</b><p>${n > all.length ? `Not here yet: ${max} Blockies have arrived so far. Every $${CONFIG.usdPerBlocky} of ${CONFIG.ticker} brings the next one.` : `Pick a Blocky from #1 to #${max}.`}</p>${CONFIG.buyUrl && n > all.length ? `<a class="btn primary" href="${CONFIG.buyUrl}" target="_blank" rel="noopener">Bring the next one</a>` : ''}</div>`;
    $('stage').classList.add('none');
    $('facts').innerHTML = '';
    $('acts').hidden = true;
    $('title').textContent = 'Blocky viewer';
    return;
  }
  document.title = `${b.name} · ${CONFIG.cityName}`;
  $('title').textContent = b.name;
  $('stage').classList.remove('none');
  $('over').innerHTML = `<span class="tag ${b.rarity.id}">${b.rarity.label}</span>`;
  stage.blocky = b;
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
  $('acts').hidden = false;
  $('opensea').hidden = !(info?.contract && here && citizenAt <= now);
  if (info?.contract) $('opensea').href = opensea(info.contract, b.id);
}

function controls() {
  $('moves').innerHTML = Object.entries(MOVES).map(([id, m]) => `<button type="button" class="chip${id === move ? ' on' : ''}" data-m="${id}">${m.label}</button>`).join('');
  $('moves').onclick = (e) => {
    const id = e.target.closest('[data-m]')?.dataset.m;
    if (!id) return;
    move = id;
    stage.move = id;
    for (const x of $('moves').children) x.classList.toggle('on', x.dataset.m === id);
  };
  $('go').onsubmit = (e) => { e.preventDefault(); show(Math.floor(Number($('num').value)) || null); };
  $('prev').onclick = () => show(Math.max(1, (current?.id ?? 2) - 1));
  $('next').onclick = () => show(Math.min(all.length, (current?.id ?? 0) + 1));
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
    const text = `Meet ${current.name}: a ${current.rarity.label}${current.trait ? ` (${TRAIT_LABEL[current.trait]})` : ''} Blocky building ${CONFIG.cityName} on Base 🧱\n\n${CONFIG.siteUrl || location.origin}/b/${current.id}${CONFIG.xHandle ? ` · @${CONFIG.xHandle}` : ''}`;
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
  sim = r.sim;
  $('num').max = all.length;
  $('count').textContent = fmt(all.length);
  show(numberIn() ?? (1 + Math.floor(Math.random() * all.length)));
})();
