// The Trade dock: BaseCity's own popup for doing things on Base. Swap, buy the city (Blocky 10), send,
// bridge or launch: the popup shows what it is in BaseCity's look (the stocks, their colours and weights,
// what you'll sign), then "Continue on Quadra" carries it to Quadra, which runs it: quoted through Relay
// and signed in the visitor's own wallet. BaseCity holds nothing and signs nothing. Each opening is
// counted (/api/stocks?go=) and every link carries ref=basecity, for the traction numbers.
import { CONFIG } from './config.js';
import { esc } from './names.js';
import { colorOf } from './stocks.js';

export const QUADRA = 'https://quadra-eta.vercel.app';
export const TRADE_TABS = [
  { id: 'swap', icon: '💱', label: 'Swap', title: 'Swap on Base', blurb: 'Any token on Base for any other, quoted through Relay at the best route.',
    steps: ['Pick what you sell and what you buy', 'Check the quote and the price impact', 'Approve, then swap, in your wallet'] },
  { id: 'basket', icon: '🛒', label: 'Buy the city', title: 'Buy the city: Blocky 10', blurb: "BaseCity's own basket: ten of Coinbase's stocks on Base, 10% each. Every stock lands in your own wallet: no index token, no manager, no fee on the basket.",
    steps: ['Set the basket to the Blocky 10 (copied for you)', 'Type an amount of USDC', 'One swap per stock, each signed in your wallet'] },
  { id: 'send', icon: '📤', label: 'Send', title: 'Send on Base', blurb: 'USDC or ETH to any address or Basename (name.base.eth), in about a second.',
    steps: ['Type an address or a Basename', 'Pick USDC or ETH and an amount', 'Sign the transfer in your wallet'] },
  { id: 'bridge', icon: '🌉', label: 'Bridge', title: 'Bridge onto Base', blurb: 'Bring ETH or USDC to Base from Ethereum and other chains, through Relay.',
    steps: ['Pick the chain you come from', 'Check what arrives on Base', 'Sign on the chain you leave'] },
  { id: 'launch', icon: '🚀', label: 'Launch', title: 'Launch a coin', blurb: "A coin of your own on Base, with its pool from the start. Paired with a stock, it gets a shop at the foot of that stock's tower on Blocky Street (soon).",
    steps: ['Name it and pick its pair', 'Check the launch', 'Sign in your wallet'] },
];
// the click counter's kinds (api/_crew.js GO_KINDS)
const GO = { swap: 'block', basket: 'city', send: 'send', bridge: 'bridge', launch: 'launch' };

export const quadraUrl = (id, extra = {}) => `${QUADRA}/?${new URLSearchParams({ do: id, ...extra, ref: 'basecity' })}`;
export function countGo(kind, feed = '/api') {
  try { navigator.sendBeacon?.(`${feed}/stocks?go=${kind}`) || fetch(`${feed}/stocks?go=${kind}`, { keepalive: true }); } catch { /* not counted */ }
}

// Blocky 10 with its weights (whole percents summing to 100), and as Quadra's basket rows take it
export function blocky10() {
  const B = (CONFIG.stocks?.blocky10 || []).slice(0, 10);
  return B.map((t, i) => [t, Math.floor(100 / B.length) + (i === 0 ? 100 % B.length : 0)]);
}
export const blocky10Line = () => blocky10().map(([t, w]) => `${t} ${w}`).join(', ');
const hex = (t) => `#${colorOf(t).toString(16).padStart(6, '0')}`;

let el = null;
function build() {
  el = document.createElement('div');
  el.className = 'td-wrap'; el.hidden = true;
  el.innerHTML = `
    <div class="td" role="dialog" aria-label="Trade on Base">
      <div class="td-head">
        <div class="td-icon"></div>
        <div class="td-title"><b></b><span>on Base · in your own wallet</span></div>
        <button class="td-x" title="Close (Esc)">✕</button>
      </div>
      <nav class="td-tabs">${TRADE_TABS.map((t) => `<button class="td-tab" data-id="${t.id}">${t.icon}<span>${t.label}</span></button>`).join('')}</nav>
      <div class="td-body"></div>
      <div class="td-foot">Runs on <b>Quadra</b>, quoted through Relay. You sign every step in your own wallet; BaseCity holds nothing. Not financial advice. Stocks aren't offered in the U.S.</div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('.td-x').onclick = closeTrade;
  el.addEventListener('click', (e) => { if (e.target === el) closeTrade(); });
  el.querySelectorAll('.td-tab').forEach((b) => (b.onclick = () => openTrade(b.dataset.id)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) closeTrade(); });
}

function basketHtml() {
  const rows = blocky10();
  let at = 0;
  const ring = rows.map(([t, w]) => { const s = `${hex(t)} ${at}% ${at + w}%`; at += w; return s; }).join(', ');
  return `
    <div class="td-b10">
      <div class="td-donut" style="background: conic-gradient(${ring})"><div><b>${rows.length}</b><span>stocks</span></div></div>
      <div class="td-legend">${rows.map(([t, w]) => `<div><i style="background:${hex(t)}"></i><b>${esc(t)}</b><span>${w}%</span></div>`).join('')}</div>
    </div>`;
}

// open the popup on a tab; `extra` goes to Quadra (e.g. { buy: '0x…' } picks the token to buy)
export function openTrade(id = 'swap', extra = {}, { title, ticker } = {}) {
  if (!el) build();
  const tab = TRADE_TABS.find((t) => t.id === id) || TRADE_TABS[0];
  const url = quadraUrl(tab.id, extra);
  el.querySelectorAll('.td-tab').forEach((b) => b.classList.toggle('on', b.dataset.id === tab.id));
  el.querySelector('.td-icon').textContent = tab.icon;
  el.querySelector('.td-title b').textContent = title || tab.title;
  const stock = ticker ? `<div class="td-stock"><i style="background:${hex(ticker)}"></i><div><b>${esc(ticker)}</b><span>Coinbase's tokenized ${esc(ticker)} on Base, bought with USDC</span></div></div>` : '';
  el.querySelector('.td-body').innerHTML = `
    <p class="td-blurb">${esc(ticker ? `Add a block to ${ticker}'s tower: buy the stock with USDC, straight into your own wallet. Hold $10+ and your Blockies join the Street Crew.` : tab.blurb)}</p>
    ${tab.id === 'basket' ? basketHtml() : stock}
    <ol class="td-steps">${tab.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
    <div class="td-actions">
      ${tab.id === 'basket' ? '<button class="btn td-copy">Copy the 10</button>' : ''}
      <a class="btn primary td-go" target="_blank" rel="noopener" href="${url}">Continue on Quadra ↗</a>
    </div>`;
  const copy = el.querySelector('.td-copy');
  const doCopy = async () => { try { await navigator.clipboard.writeText(blocky10Line()); if (copy) copy.textContent = 'Copied ✓'; } catch { if (copy) copy.textContent = blocky10Line(); } };
  if (copy) copy.onclick = doCopy;
  el.querySelector('.td-go').onclick = () => { if (tab.id === 'basket') doCopy(); countGo(GO[tab.id] || 'block'); };
  el.hidden = false;
}
export function closeTrade() { if (el) el.hidden = true; }
