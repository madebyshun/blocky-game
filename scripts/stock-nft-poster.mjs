// Render a teaser poster: several Blockies wearing different stock traits, on one image,
// ready to tweet as FOMO for NFT x tokenized stocks on Base (docs/STOCK-NFTS-IDEAS.md, A).
//   node scripts/stock-nft-poster.mjs            -> public/stock-nft-poster.png
//   node scripts/stock-nft-poster.mjs --svg      -> writes the raw SVG instead
// Built as one SVG string and rasterised with resvg: no layout engine in the way, and every
// Blocky is the very same renderer the NFT image API uses (src/voxel-svg.js).
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { blockySvg } from '../src/voxel-svg.js';
import { makeBlocky } from '../src/sim.js';
import { STOCK_TRAIT_IDS, STOCK_TRAITS, stockTraitLabel } from '../src/stocktraits.js';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pngOut = join(root, 'public', 'stock-nft-poster.png');
const svgOut = join(root, 'public', 'stock-nft-poster.svg');

const W = 2200, H = 1400;
const COLS = 4;
const PAD = 44, GAP = 18;

// one Blocky per stock trait, plus a plain one for contrast.
// Seeds are picked so every Blocky rolls Common (no rare trait): on this poster the stock
// accessory is the point, and a gold hat or a crown would sit on top of it.
const picks = [];
let n = 1;
const commonBlocky = (arrivedAt) => {
  for (let seed = 1; seed < 2000; seed++) {
    const b = makeBlocky(n, arrivedAt, null, seed);
    if (b.rarity.id === 'common' && b.trait === null) return b;
  }
  return makeBlocky(n, arrivedAt, null, n);
};
for (const id of STOCK_TRAIT_IDS) { picks.push({ b: commonBlocky(Date.now() - 864e5), id }); n++; }
picks.push({ b: commonBlocky(Date.now()), id: 'none' });
const ROWS = Math.ceil(picks.length / COLS);

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const b64 = (s) => Buffer.from(s).toString('base64');

// the Blocky art itself, as a raw <svg> we can place anywhere.
// Its own gradient/pattern ids are renamed per cell: every portrait defines `bg` and `grid`, and
// two SVGs with the same id in one document fight over it (the poster's own background lost).
function blockyArt(b, id, size, cell) {
  const inner = blockySvg(b, { size, label: true, stockTrait: id === 'none' ? null : id })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '')
    .replace(/id="(bg|grid)"/g, `id="$1-${cell}"`)
    .replace(/url\(#(bg|grid)\)/g, `url(#$1-${cell})`);
  return { inner, size };
}

const headerH = 250, footerH = 90;
const gridTop = PAD + headerH;
const gridH = H - gridTop - footerH - PAD;
const cellW = (W - PAD * 2 - GAP * (COLS - 1)) / COLS;
const cellH = (gridH - GAP * (ROWS - 1)) / ROWS;

const cells = picks.map(({ b, id }, i) => {
  const col = i % COLS, row = Math.floor(i / COLS);
  const x = PAD + col * (cellW + GAP), y = gridTop + row * (cellH + GAP);
  const artSize = Math.min(cellW, cellH) * 0.68;
  const art = blockyArt(b, id, Math.round(artSize), i);
  const cx = x + cellW / 2, cy = y + 26;
  const colBadge = STOCK_TRAITS[id]?.color;
  return `
  <g>
    <rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" rx="18" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.13"/>
    ${colBadge ? `<rect x="${x + 14}" y="${y + 14}" rx="9" width="52" height="26" fill="#0a0e18" fill-opacity="0.72"/>
    <text x="${x + 40}" y="${y + 32}" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="15" fill="#${colBadge.toString(16).padStart(6, '0')}" text-anchor="middle">${STOCK_TRAITS[id].ticker}</text>` : ''}
    <g transform="translate(${cx - artSize / 2},${cy})">
      <svg x="0" y="0" width="${art.size}" height="${art.size}" viewBox="0 0 ${art.size} ${art.size}">${art.inner}</svg>
    </g>
    <text x="${cx}" y="${y + cellH - 44}" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="19" fill="#ffffff" text-anchor="middle">${esc(b.name)}</text>
    <text x="${cx}" y="${y + cellH - 20}" font-family="Inter, Arial, sans-serif" font-weight="600" font-size="15" fill="#9fb6ff" text-anchor="middle">${esc(stockTraitLabel(id))}</text>
  </g>`;
}).join('');

const tickers = STOCK_TRAIT_IDS.map((k) => stockTraitLabel(k).split(' · ')[0]).join(' · ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a1230"/><stop offset="0.55" stop-color="#050b22"/><stop offset="1" stop-color="#071033"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.18" cy="0.05" r="0.9">
      <stop offset="0" stop-color="#0052ff" stop-opacity="0.30"/><stop offset="1" stop-color="#0052ff" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
      <path d="M56 0H0V56" fill="none" stroke="#ffffff" stroke-opacity="0.045"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <g font-family="Inter, Arial, Helvetica, sans-serif">
    <rect x="${PAD}" y="${PAD}" width="${228}" height="42" rx="21" fill="#0052ff"/>
    <text x="${PAD + 114}" y="${PAD + 28}" font-size="19" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="1.6">STOCK TRAITS</text>
    <text x="${PAD}" y="${PAD + 130}" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="76" fill="#ffffff">${picks.length} Blockies. ${picks.length} traits.</text>
    <text x="${PAD}" y="${PAD + 178}" font-size="27" font-weight="700" fill="#9fb6ff">Your NFT wears what your wallet holds.</text>
    <text x="${PAD}" y="${PAD + 212}" font-size="19" font-weight="600" fill="#5f7ba6">Tokenized stocks on Base · ${esc(tickers)}</text>
  </g>

  ${cells}

  <g font-family="Inter, Arial, sans-serif">
    <text x="${PAD}" y="${H - 40}" font-size="26" font-weight="800" fill="#ffffff">basecity.space</text>
    <text x="${PAD + 230}" y="${H - 40}" font-size="26" font-weight="600" fill="#5f7ba6">·  @blockyonbase  ·  built on Base</text>
  </g>
</svg>`;

writeFileSync(svgOut, svg);
if (process.argv.includes('--svg')) {
  console.log('wrote', svgOut);
} else {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
  writeFileSync(pngOut, png);
  console.log('wrote', pngOut, `${Math.round(png.length / 1024)} kB`, `(${picks.length} Blockies)`);
}
// keep the fonts referenced for anyone re-rendering with the system Inter
void readFileSync;
