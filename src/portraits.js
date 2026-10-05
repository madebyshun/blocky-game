// Blocky portraits from the SVG renderer (the NFT image), drawn as they scroll into view so a page
// of hundreds of Blockies stays smooth.
import { blockySvg } from './voxel-svg.js';

const urls = new Map();
export function portraitUrl(b, { size = 256, label = false } = {}) {
  const key = `${b.id}|${b.seed ?? ''}|${size}|${label}`;
  if (!urls.has(key)) urls.set(key, URL.createObjectURL(new Blob([blockySvg(b, { size, label })], { type: 'image/svg+xml' })));
  return urls.get(key);
}

const queue = [];
let busy = false;
function pump() {
  if (busy) return;
  busy = true;
  const step = () => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 14) {
      const img = queue.shift();
      if (img.isConnected) img.src = portraitUrl(img._blocky);
    }
    if (queue.length) setTimeout(step, 0);
    else busy = false;
  };
  step();
}
const io = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); queue.push(e.target); }
    pump();
  }, { rootMargin: '600px 0px' })
  : null;

export function lazyPortrait(img, b) {
  img._blocky = b;
  if (io) io.observe(img);
  else { queue.push(img); pump(); }
}
