// Blocky portraits rendered with the upgraded 3D WebGL voxel model (src/pfp.js, matching the city &
// Base Builders page), with automatic fallback to blockySvg if WebGL is unavailable.
import { renderPfp } from './pfp.js';
import { blockySvg } from './voxel-svg.js';

const svgUrls = new Map();
function fallbackSvgUrl(b, { size = 256, label = false } = {}) {
  const key = `${b.id}|${b.seed ?? ''}|${size}|${label}`;
  if (!svgUrls.has(key)) svgUrls.set(key, URL.createObjectURL(new Blob([blockySvg(b, { size, label })], { type: 'image/svg+xml' })));
  return svgUrls.get(key);
}

export function portraitUrl(b, { size = 320, label = false } = {}) {
  try {
    return renderPfp(b, { size, mark: label });
  } catch {
    return fallbackSvgUrl(b, { size, label });
  }
}

const queue = [];
let busy = false;
function pump() {
  if (busy) return;
  busy = true;
  const step = () => {
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 16) {
      const img = queue.shift();
      if (img.isConnected) img.src = portraitUrl(img._blocky, { size: 320, label: false });
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
