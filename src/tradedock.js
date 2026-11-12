// Blocky 10: BaseCity's own basket of Coinbase's stocks on Base, 10% each, in BaseCity's popup. Buying it
// from inside BaseCity (and swap, send, bridge, launch) comes later; for now the popup shows the basket,
// its colours and weights, and lets you copy it.
import { CONFIG } from './config.js';
import { esc } from './names.js';
import { colorOf } from './stocks.js';

export function blocky10() {
  const B = (CONFIG.stocks?.blocky10 || []).slice(0, 10);
  return B.map((t, i) => [t, Math.floor(100 / B.length) + (i === 0 ? 100 % B.length : 0)]);
}
export const blocky10Line = () => blocky10().map(([t, w]) => `${t} ${w}%`).join(', ');
const hex = (t) => `#${colorOf(t).toString(16).padStart(6, '0')}`;

let el = null;
function build() {
  const rows = blocky10();
  let at = 0;
  const ring = rows.map(([t, w]) => { const s = `${hex(t)} ${at}% ${at + w}%`; at += w; return s; }).join(', ');
  el = document.createElement('div');
  el.className = 'td-wrap'; el.hidden = true;
  el.innerHTML = `
    <div class="td" role="dialog" aria-label="Blocky 10">
      <div class="td-head">
        <div class="td-icon">🧺</div>
        <div class="td-title"><b>Blocky 10</b><span>the city's basket of stocks on Base</span></div>
        <button class="td-x" title="Close (Esc)">✕</button>
      </div>
      <p class="td-blurb">Ten of Coinbase's tokenized stocks on Base, 10% each: Blocky Street's towers plus Apple and Alphabet. Held in your own wallet, every stock is a floor of your tower on Blocky Street, and every $10 a Blocky on the Street Crew.</p>
      <div class="td-b10">
        <div class="td-donut" style="background: conic-gradient(${ring})"><div><b>${rows.length}</b><span>stocks</span></div></div>
        <div class="td-legend">${rows.map(([t, w]) => `<div><i style="background:${hex(t)}"></i><b>${esc(t)}</b><span>${w}%</span></div>`).join('')}</div>
      </div>
      <div class="td-soon">🛒 <b>Buy the city</b> from inside BaseCity: coming soon.</div>
      <div class="td-actions"><button class="btn td-copy">Copy the basket</button></div>
      <div class="td-foot">Not financial advice. Coinbase's tokenized stocks aren't offered in the U.S.</div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('.td-x').onclick = closeBlocky10;
  el.addEventListener('click', (e) => { if (e.target === el) closeBlocky10(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) closeBlocky10(); });
  const copy = el.querySelector('.td-copy');
  copy.onclick = async () => { try { await navigator.clipboard.writeText(blocky10Line()); copy.textContent = 'Copied ✓'; } catch { copy.textContent = blocky10Line(); } };
}
export function openBlocky10() { if (!el) build(); el.hidden = false; }
export function closeBlocky10() { if (el) el.hidden = true; }
