// The top bar and footer of the pages around the city (Blockies, Claim, Base Builders, About).
import { CONFIG } from './config.js';

const PAGES = [
  ['city', '/', 'City'],
  ['blockies', '/collection.html', 'Blockies'],
  ['claim', '/claim.html', 'Claim'],
  ['builders', '/builders.html', 'Builders'],
  ['about', '/about.html', 'About'],
];
export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const fmt = (n) => Math.floor(n).toLocaleString('en-US');
export const day = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const basescan = (path) => `https://basescan.org/${path}`;
export const opensea = (contract, id) => `https://opensea.io/assets/base/${contract}${id != null ? `/${id}` : ''}`;
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function mountSite(active) {
  const nav = document.createElement('div');
  nav.className = 'nav-wrap';
  nav.innerHTML = `<nav class="nav" aria-label="${CONFIG.cityName}">
    <a class="logo" href="/"><span class="mark"></span>${CONFIG.cityName}</a>
    <div class="links">${PAGES.map(([id, href, label]) => `<a href="${href}"${id === active ? ' class="on" aria-current="page"' : ''}>${label}</a>`).join('')}</div>
    ${CONFIG.buyUrl ? `<a class="btn primary buy" href="${CONFIG.buyUrl}" target="_blank" rel="noopener">Buy ${CONFIG.ticker}</a>` : ''}
  </nav>`;
  document.body.prepend(nav);

  const foot = document.createElement('footer');
  foot.className = 'foot';
  const ca = CONFIG.tokenAddress;
  foot.innerHTML = `<div class="links">
      <span>${CONFIG.cityName} · ${CONFIG.ticker} on Base</span>
      ${ca ? `<button type="button" class="ca" title="Copy the ${CONFIG.ticker} contract address">CA ${short(ca)} ⧉</button>` : ''}
      ${CONFIG.chartUrl ? `<a href="${CONFIG.chartUrl}" target="_blank" rel="noopener">Chart</a>` : ''}
      ${CONFIG.xHandle ? `<a href="https://x.com/${CONFIG.xHandle}" target="_blank" rel="noopener">𝕏 @${CONFIG.xHandle}</a>` : ''}
      ${PAGES.map(([, href, label]) => `<a href="${href}">${label}</a>`).join('')}
    </div>
    <div>A game and a collectible on Base. Nothing here is financial advice; tokens and NFTs can lose value.</div>`;
  document.body.append(foot);
  const copy = foot.querySelector('.ca');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(ca); copy.textContent = 'Copied ✓'; } catch { copy.textContent = ca; }
    setTimeout(() => { copy.textContent = `CA ${short(ca)} ⧉`; }, 1800);
  };
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

// Whether NFT claims are open, the contract (from the API; the config as a fallback), the road to opening
// day (unlockUsd, bought, openedAt) and, from then, a Blocky's newcomer days before it's a citizen.
export async function nftInfo() {
  try {
    const res = await fetch('/api/claim', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const s = await res.json();
    const num = (v, d) => (typeof v === 'number' ? v : d);
    return { open: Boolean(s.open), contract: s.contract || CONFIG.nft.contract || null, unlockUsd: num(s.unlockUsd, CONFIG.unlockUsd), bought: num(s.bought, null), openedAt: num(s.openedAt, null), citizenDays: num(s.citizenDays, CONFIG.citizenDays), live: true };
  } catch {
    return { open: false, contract: CONFIG.nft.contract || null, unlockUsd: CONFIG.unlockUsd, bought: null, openedAt: null, citizenDays: CONFIG.citizenDays, live: false };
  }
}
