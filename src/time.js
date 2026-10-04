// City clock. Real time by default; `?speed=60` fast-forwards (for timelapse videos).
const speed = Math.max(1, Number(new URLSearchParams(location.search).get('speed')) || 1);
const start = Date.now();
export const now = () => (speed === 1 ? Date.now() : start + (Date.now() - start) * speed);
