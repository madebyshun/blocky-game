// The wallet's ERC-8004 agent id, linked once on /claim and shared by the research worker and the job board
// (it used to be typed twice: the worker had it while the job board still read "Not linked"). Kept in this
// browser only, per wallet; ownership is still checked on chain when it is linked and again on every submit.
const key = (wallet) => `basecity:agent-id:${String(wallet || '').toLowerCase()}`;
export function linkedAgentId(wallet) {
  if (!wallet) return '';
  try { return localStorage.getItem(key(wallet)) || ''; } catch { return ''; }
}
export function linkAgentId(wallet, id) {
  if (!wallet || !/^\d{1,12}$/.test(String(id || ''))) return;
  try { localStorage.setItem(key(wallet), String(id)); } catch { /* private mode: linked for this visit only */ }
  document.dispatchEvent(new CustomEvent('basecity-agent-id', { detail: { wallet: wallet.toLowerCase(), id: String(id) } }));
}
