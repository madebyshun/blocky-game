// The Trade dock: Quadra, inside BaseCity. Swap, send, bridge, buy a basket of stocks or launch a coin
// without leaving the city: Quadra opens in a popup (an iframe of quadra-eta.vercel.app with `?do=`, the
// links Quadra already reads), and every action is signed in the visitor's own wallet, on Quadra.
// BaseCity holds nothing and signs nothing. Each opening is counted (/api/stocks?go=) and tagged
// ref=basecity, for the traction numbers. If a wallet won't connect inside the popup, "Open in a new tab".
import { CONFIG } from './config.js';
import { esc } from './names.js';

export const QUADRA = 'https://quadra-eta.vercel.app';
export const TRADE_TABS = [
  { id: 'swap', icon: '💱', label: 'Swap', blurb: 'Any token on Base, through Relay' },
  { id: 'basket', icon: '🏙', label: 'Buy the city', blurb: 'Blocky 10: ten stocks, one basket, in your own wallet' },
  { id: 'send', icon: '📤', label: 'Send', blurb: 'USDC or ETH to an address or a Basename' },
  { id: 'bridge', icon: '🌉', label: 'Bridge', blurb: 'Onto Base from other chains' },
  { id: 'launch', icon: '🚀', label: 'Launch', blurb: 'A coin of your own on Base' },
];
// the click counter's kinds (api/_crew.js GO_KINDS)
const GO = { swap: 'block', basket: 'city', send: 'send', bridge: 'bridge', launch: 'launch' };

export const quadraUrl = (id, extra = {}) => {
  const q = new URLSearchParams({ do: id, ...extra, ref: 'basecity' });
  return `${QUADRA}/?${q}`;
};
export function countGo(kind, feed = '/api') {
  try { navigator.sendBeacon?.(`${feed}/stocks?go=${kind}`) || fetch(`${feed}/stocks?go=${kind}`, { keepalive: true }); } catch { /* not counted */ }
}

// Blocky 10, as Quadra's basket rows take it ("NVDA 10, TSLA 10, ...")
export function blocky10Line() {
  const B = (CONFIG.stocks?.blocky10 || []).slice(0, 10);
  return B.map((t, i) => `${t} ${Math.floor(100 / B.length) + (i === 0 ? 100 % B.length : 0)}`).join(', ');
}

let el = null, frame = null, cur = null;
function build() {
  el = document.createElement('div');
  el.className = 'td-wrap'; el.hidden = true;
  el.innerHTML = `
    <div class="td" role="dialog" aria-label="Trade on Base">
      <div class="td-head">
        <div class="td-title"><b>Trade dock</b><span>on Base, in your own wallet</span></div>
        <nav class="td-tabs">${TRADE_TABS.map((t) => `<button class="td-tab" data-id="${t.id}">${t.icon} <span>${t.label}</span></button>`).join('')}</nav>
        <button class="td-x" title="Close (Esc)">✕</button>
      </div>
      <div class="td-note"></div>
      <div class="td-body"><iframe class="td-frame" title="Quadra" allow="clipboard-read; clipboard-write; publickey-credentials-get *; publickey-credentials-create *" referrerpolicy="origin"></iframe><div class="td-loading">Opening Quadra…</div></div>
      <div class="td-foot"><span>Powered by <b>Quadra</b> · swaps through Relay · you sign every step · not financial advice · stocks not offered in the U.S.</span><a class="td-out" target="_blank" rel="noopener">Open in a new tab ↗</a></div>
    </div>`;
  document.body.appendChild(el);
  frame = el.querySelector('.td-frame');
  frame.addEventListener('load', () => { el.querySelector('.td-loading').hidden = true; });
  el.querySelector('.td-x').onclick = closeTrade;
  el.addEventListener('click', (e) => { if (e.target === el) closeTrade(); });
  el.querySelectorAll('.td-tab').forEach((b) => (b.onclick = () => openTrade(b.dataset.id)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) closeTrade(); });
}

// open the dock on a tab; `extra` goes to Quadra (e.g. { buy: '0x…' } picks the stock to swap into)
export function openTrade(id = 'swap', extra = {}, { title } = {}) {
  if (!el) build();
  const tab = TRADE_TABS.find((t) => t.id === id) || TRADE_TABS[0];
  const url = quadraUrl(tab.id, extra);
  el.querySelectorAll('.td-tab').forEach((b) => b.classList.toggle('on', b.dataset.id === tab.id));
  const note = el.querySelector('.td-note');
  if (tab.id === 'basket') {
    const line = blocky10Line();
    note.innerHTML = `🏙 <b>Blocky 10</b>, 10% each <button class="btn td-copy">Copy the 10</button><br><span class="td-sub">Quadra opens on MAG7: set its rows to <code>${esc(line)}</code></span>`;
    note.querySelector('.td-copy').onclick = async (e) => { try { await navigator.clipboard.writeText(line); e.target.textContent = 'Copied ✓'; } catch { e.target.textContent = 'Select & copy'; } };
  } else {
    note.innerHTML = `${tab.icon} <b>${esc(title || tab.label)}</b> · ${esc(tab.blurb)}`;
  }
  el.querySelector('.td-out').href = url;
  if (cur !== url) { el.querySelector('.td-loading').hidden = false; frame.src = url; cur = url; }
  el.hidden = false;
  document.body.classList.add('td-open');
  countGo(GO[tab.id] || 'block');
}
export function closeTrade() {
  if (!el) return;
  el.hidden = true;
  document.body.classList.remove('td-open');
}
