// The landing page: what BaseCity is, with the live numbers from the city's API.
import { CONFIG } from './config.js';
import { PROJECTS } from './projects.js';
import { fetchColony } from './data.js';
import { mountSite, fmt, esc } from './site.js';

mountSite('home');
const $ = (id) => document.getElementById(id);

for (const id of ['buy', 'buy2']) $(id).href = CONFIG.buyUrl;
const dm = `https://x.com/${CONFIG.xHandle}`;
$('dm-hq').href = dm; $('dm-partner').href = dm;

const ca = CONFIG.tokenAddress;
$('ca').textContent = `CA ${ca} ⧉`;
$('ca').onclick = async () => {
  try { await navigator.clipboard.writeText(ca); $('ca').textContent = 'Copied ✓'; } catch {}
  setTimeout(() => { $('ca').textContent = `CA ${ca} ⧉`; }, 1800);
};

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
