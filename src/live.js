// "Watching live": while the page is visible it checks in with /api/live every 2 minutes and gets
// back how many people are watching now and how many have visited.
const EVERY = 120000;

export function watchLive(onCount) {
  let last = 0, first = true;
  const ping = async () => {
    if (document.visibilityState !== 'visible') return;
    last = Date.now();
    try {
      const r = await fetch(`/api/live${first ? '?first=1' : ''}`, { cache: 'no-store' });
      if (!r.ok) return;
      first = false;
      onCount(await r.json());
    } catch { /* offline: try again next time */ }
  };
  ping();
  setInterval(ping, EVERY);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - last > EVERY / 2) ping(); });
}
