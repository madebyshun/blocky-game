// The landing page: what BaseCity is, with the live numbers from the city's API.
import { CONFIG } from './config.js';
import { PROJECTS } from './projects.js';
import { fetchColony } from './data.js';
import { mountSite, fmt, esc } from './site.js';

mountSite('home');
try { localStorage.setItem('basecity:seen', '1'); } catch {} // the bare domain now opens the city for this visitor
const $ = (id) => document.getElementById(id);

for (const id of ['buy', 'buy2']) {
  const el = $(id);
  if (el) { el.href = '/?b10=blocky'; el.removeAttribute('target'); }
}
const dm = `https://x.com/${CONFIG.xHandle}`;
$('dm-hq').href = dm; $('dm-partner').href = dm;

const ca = CONFIG.tokenAddress;
const caLbl = `$BLOCKY CA: ${ca}`;
$('ca').textContent = caLbl;
$('ca').onclick = async () => {
  try { await navigator.clipboard.writeText(ca); $('ca').textContent = 'Copied $BLOCKY CA'; } catch {}
  setTimeout(() => { $('ca').textContent = caLbl; }, 1800);
};
const bcCa = CONFIG.flywheel?.basecityToken;
if (bcCa && $('ca')?.parentNode) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = $('ca').className;
  const bcLbl = `$BASECITY CA: ${bcCa}`;
  b.textContent = bcLbl;
  b.title = 'Copy $BASECITY contract address';
  b.onclick = async () => {
    try { await navigator.clipboard.writeText(bcCa); b.textContent = 'Copied $BASECITY CA'; } catch {}
    setTimeout(() => { b.textContent = bcLbl; }, 1800);
  };
  $('ca').after(b);
}

$('projects').innerHTML = PROJECTS.map((p) => `<a href="${esc(p.url || '#')}" target="_blank" rel="noopener" style="--c:${esc(p.color || '#0052ff')}">${esc(p.name)}</a>`).join('');
$('s-projects').textContent = fmt(PROJECTS.length);

async function live() {
  const s = await fetchColony().catch(() => null);
  if (!s) return;
  $('s-blockies').textContent = fmt(s.minted);
  $('s-issued').textContent = fmt(s.issued);
  $('s-bought').textContent = s.boughtUsd ? `$${fmt(s.boughtUsd)}` : '–';
}
live();
setInterval(live, 60000);
