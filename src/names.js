// Basenames (name.base.eth) of the wallets in the city, as the API resolved them (api/_names.js):
// a buyer shows up by the name it chose on Base, its short address otherwise.
const NAMES = new Map(); // lowercase address -> name

// Returns whether anything changed.
export function addNames(map) {
  let changed = false;
  for (const [a, n] of Object.entries(map || {})) {
    if (typeof n !== 'string' || !n) continue;
    const k = a.toLowerCase();
    if (NAMES.get(k) !== n) { NAMES.set(k, n); changed = true; }
  }
  return changed;
}
export const nameOf = (a) => (a ? NAMES.get(a.toLowerCase()) || null : null);
export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// the wallet as people know it: its Basename (clipped to `max` characters) or its short address
export const who = (a, max = 24) => { const n = nameOf(a); return n ? clip(n, max) : shortAddr(a); };
// names come from the chain: always escape them before they go into HTML
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const whoHtml = (a, max) => esc(who(a, max));
