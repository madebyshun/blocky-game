// Wallets for BaseCity: browser wallets that announce themselves (EIP-6963: MetaMask, Rabby,
// Coinbase Wallet extension, ...), Privy Social/Email Embedded Wallets (X, Google, Gmail OTP),
// and Coinbase Smart Wallet / the Base App. Persists the active wallet across pages.
import { withBuilderCode } from './attribution.js';
import { privyConfigured, handlePrivyOAuthCallback, restorePrivySession, logoutPrivy } from './privy.js';

const BASE = {
  chainId: '0x2105',
  chainName: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org'],
};

const STORE_KEY = 'basecity:wallet:v1';
const found = new Map(); // uuid -> { info, provider }
const listeners = new Set();

if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => {
    const d = e.detail;
    if (!d?.info?.uuid || !d.provider) return;
    found.set(d.info.uuid, d);
    listeners.forEach((fn) => fn());
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

// the browser wallets found so far (plus window.ethereum when nothing announced itself)
export function browserWallets() {
  const list = [...found.values()].map((d) => ({ id: d.info.uuid, name: d.info.name, icon: d.info.icon, rdns: d.info.rdns, provider: d.provider }));
  if (!list.length && typeof window !== 'undefined' && window.ethereum) list.push({ id: 'injected', name: 'Browser wallet', icon: null, rdns: '', provider: window.ethereum });
  return list;
}
export const onWallets = (fn) => listeners.add(fn);

export async function smartWallet(appName, appLogoUrl) {
  const { createCoinbaseWalletSDK } = await import('@coinbase/wallet-sdk');
  return createCoinbaseWalletSDK({ appName, appLogoUrl, appChainIds: [8453], preference: { options: 'all' } }).getProvider();
}

export async function toBase(provider) {
  const id = await provider.request({ method: 'eth_chainId' });
  if (parseInt(id, 16) === 8453) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE.chainId }] });
  } catch (e) {
    if (e?.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
    await provider.request({ method: 'wallet_addEthereumChain', params: [BASE] });
  }
}

function saveWalletSession(provider, address, meta = null) {
  try {
    const match = browserWallets().find((w) => w.provider === provider);
    const rec = {
      address,
      id: meta?.id || match?.id || '',
      rdns: meta?.rdns || match?.rdns || '',
      name: meta?.name || match?.name || 'Wallet',
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(rec));
  } catch { /* ignore storage errors */ }
}

export function forgetWallet() {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  logoutPrivy().catch(() => {});
}

export async function connect(provider, meta = null) {
  const [address] = await provider.request({ method: 'eth_requestAccounts' });
  if (!address) throw new Error('No account');
  await toBase(provider).catch(() => {}); // asked again before sending
  saveWalletSession(provider, address, meta);
  return address;
}

// Silently restores the previously connected wallet on page load (Privy OAuth/session or EIP-6963).
let restoreInFlight = null;
export async function restoreWallet() {
  if (typeof window === 'undefined') return null;
  if (restoreInFlight) return restoreInFlight;
  restoreInFlight = (async () => {
    if (privyConfigured()) {
      try {
        const oauth = await handlePrivyOAuthCallback();
        if (oauth?.address && oauth?.provider) {
          saveWalletSession(oauth.provider, oauth.address, { id: 'privy', rdns: 'io.privy', name: oauth.name });
          return oauth;
        }
        const existing = await restorePrivySession();
        if (existing?.address && existing?.provider) {
          saveWalletSession(existing.provider, existing.address, { id: 'privy', rdns: 'io.privy', name: existing.name });
          return existing;
        }
      } catch (err) {
        console.warn('[BaseCity wallet restore Privy error]', err);
      }
    }
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { return null; }
    if (!saved?.address) return null;

    const findMatch = () => {
      const list = browserWallets();
      return (
        (saved.rdns && list.find((w) => w.rdns === saved.rdns)) ||
        (saved.name && list.find((w) => w.name === saved.name)) ||
        (saved.id && list.find((w) => w.id === saved.id)) ||
        list[0] ||
        null
      );
    };

    window.dispatchEvent(new Event('eip6963:requestProvider'));
    let pick = findMatch();
    if (!pick) {
      await new Promise((r) => setTimeout(r, 250));
      pick = findMatch();
    }
    if (!pick?.provider) return null;
    try {
      const accounts = await pick.provider.request({ method: 'eth_accounts' });
      if (!accounts?.length) return null;
      const exact = accounts.find((a) => a.toLowerCase() === saved.address.toLowerCase()) || accounts[0];
      saveWalletSession(pick.provider, exact, pick);
      return { provider: pick.provider, address: exact, name: pick.name || saved.name || 'Wallet' };
    } catch {
      return null;
    }
  })();
  try {
    return await restoreInFlight;
  } finally {
    restoreInFlight = null;
  }
}

export async function sendTx(provider, tx) {
  await toBase(provider);
  return provider.request({ method: 'eth_sendTransaction', params: [withBuilderCode(tx)] });
}

async function rpc(method, params) {
  const res = await fetch(BASE.rpcUrls[0], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

// Wait for a transaction on Base: { ok: true | false } once mined, { ok: null } if it takes too long.
export async function waitTx(hash, provider, timeoutMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await rpc('eth_getTransactionReceipt', [hash]).catch(() => provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }).catch(() => null));
    if (r) return { ok: r.status === '0x1', receipt: r };
    await new Promise((done) => setTimeout(done, 2000));
  }
  return { ok: null };
}

// Server payment rejection is not a user cancelling a wallet prompt.
export const rejected = (e) => !e?.paymentRequired && (
  Number(e?.code) === 4001 || e?.code === 'ACTION_REJECTED' ||
  /user (?:rejected|denied|cancelled|canceled)|(?:rejected|denied|cancelled|canceled) (?:by (?:the )?user)|userRejectedRequest/i.test(e?.message || '')
);
