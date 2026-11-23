// The top bar and footer of the pages around the city (Blockies, Claim, Base Builders, About).
import { CONFIG } from './config.js';

const PAGES = [
  ['home', '/home.html', 'Home'],
  ['city', '/', 'City'],
  ['blockies', '/collection.html', 'Blockies'],
  ['flywheel', '/flywheel', 'Flywheel'],
  ['metrics', '/metrics', 'Metrics'],
  ['docs', '/docs', 'Docs'],
  ['about', '/about.html', 'About'],
  ['claim', '/claim.html', 'Claim'],
  ['builders', '/builders.html', 'Builders'],
  ['agents', '/agents', 'Agents'],
  ['base', '/base.html', 'Base Live'],
  ['dash', '/dash.html', 'Dashboards'],
  ['viewer', '/blocky.html', 'Viewer'],
  ['vote', '/vote.html', 'Vote'],
  ['recap', '/recap.html', 'Recap'],
  ['weekly', '/weekly.html', 'Weekly'],
  ['llms', '/llms.txt', 'llms.txt (Agents)'],
];
const PRIMARY_NAV = ['home', 'city', 'blockies', 'flywheel', 'metrics', 'docs', 'about'];
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const fmt = (n) => Math.floor(n).toLocaleString('en-US');
export const day = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const basescan = (path) => `https://basescan.org/${path}`;
export const opensea = (contract, id) => `https://opensea.io/assets/base/${contract}${id != null ? `/${id}` : ''}`;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function mountSite(active) {
  if (!document.querySelector('link[href*="Silkscreen"]')) {
    const fl = document.createElement('link');
    fl.rel = 'stylesheet';
    fl.href = `${basescan('').slice(0, 8)}${['fonts', 'googleapis', 'com'].join('.')}/css2?family=Silkscreen:wght@400;700&family=Inter:wght@500;700;800&family=JetBrains+Mono:wght@500;700&display=swap`;
    document.head.appendChild(fl);
  }
  const nav = document.createElement('div');
  nav.className = 'nav-wrap';
  nav.innerHTML = `<nav class="nav" aria-label="${CONFIG.cityName}">
    <a class="logo" href="/"><span class="mark"></span>${CONFIG.cityName}</a>
    <div class="links">${PAGES.filter(([id]) => PRIMARY_NAV.includes(id)).map(([id, href, label]) => `<a href="${href}"${id === active ? ' class="on" aria-current="page"' : ''}>${label}</a>`).join('')}</div>
    <details class="nav-more"><summary>More</summary><div>${PAGES.filter(([id]) => !PRIMARY_NAV.includes(id)).map(([id,href,label]) => `<a href="${href}"${id===active?' aria-current="page"':''}>${label}</a>`).join('')}</div></details>
    <a class="btn primary buy" href="/?b10=blocky">Buy ${CONFIG.ticker}</a>
  </nav>`;
  document.body.prepend(nav);
  const skip = document.createElement('a'); skip.className = 'skip-link'; skip.href = '#page-content'; skip.textContent = 'Skip to content';
  const main = document.querySelector('main'); if (main) { main.id ||= 'page-content'; skip.href = `#${main.id}`; document.body.prepend(skip); }

  const foot = document.createElement('footer');
  foot.className = 'foot';
  const ca = CONFIG.tokenAddress;
  const bcCa = CONFIG.flywheel?.basecityToken;
  foot.innerHTML = `<div class="links">
      <span>${CONFIG.cityName} · ${CONFIG.ticker} on Base</span>
      ${ca ? `<button type="button" class="ca" data-ca="${esc(ca)}" data-lbl="$BLOCKY ${short(ca)}" title="Copy the ${CONFIG.ticker} contract address">$BLOCKY ${short(ca)}</button>` : ''}
      ${bcCa ? `<button type="button" class="ca" data-ca="${esc(bcCa)}" data-lbl="$BASECITY ${short(bcCa)}" title="Copy the $BASECITY contract address">$BASECITY ${short(bcCa)}</button>` : ''}
      ${CONFIG.chartUrl ? `<a href="${CONFIG.chartUrl}" target="_blank" rel="noopener">Chart</a>` : ''}
      ${CONFIG.xHandle ? `<a href="https://x.com/${CONFIG.xHandle}" target="_blank" rel="noopener">@${CONFIG.xHandle}</a>` : ''}
      ${PAGES.map(([, href, label]) => `<a href="${href}">${label}</a>`).join('')}
    </div>
    <div>A game and a collectible on Base. Nothing here is financial advice; tokens and NFTs can lose value.</div>`;
  document.body.append(foot);
  foot.querySelectorAll('.ca').forEach((btn) => {
    btn.onclick = async () => {
      const addr = btn.dataset.ca;
      const lbl = btn.dataset.lbl;
      try { await navigator.clipboard.writeText(addr); btn.textContent = 'Copied'; } catch { btn.textContent = addr; }
      setTimeout(() => { btn.textContent = lbl; }, 1800);
    };
  });
}

// Render SVG markup to a PNG download (the NFT portraits are SVG).
export async function downloadSvgPng(svg, name, size = 1024) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(img, 0, 0, size, size);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `${name.replace(/[^a-z0-9#-]+/gi, '-').replace(/#/g, '')}.png`;
  a.click();
}

// Whether NFT claims are open, the contract (from the API; the config as a fallback), opening day
// (unlockUsd, bought, openedAt), a Blocky's newcomer days before it's a citizen, and how many of the
// `max` NFTs are claimed (null if unknown).
export async function nftInfo() {
  try {
    const res = await fetch('/api/claim', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = await res.json();
    const num = (v, d) => (typeof v === 'number' ? v : d);
    return { open: Boolean(s.open), contract: s.contract || CONFIG.nft.contract || null, unlockUsd: num(s.unlockUsd, CONFIG.unlockUsd), bought: num(s.bought, null), openedAt: num(s.openedAt, null), citizenDays: num(s.citizenDays, CONFIG.citizenDays), claimed: num(s.claimed, null), max: num(s.max, CONFIG.supply), market: s.market || null, live: true };
  } catch {
    return { open: false, contract: CONFIG.nft.contract || null, unlockUsd: CONFIG.unlockUsd, bought: null, openedAt: null, citizenDays: CONFIG.citizenDays, claimed: null, max: CONFIG.supply, market: null, live: false };
  }
}
