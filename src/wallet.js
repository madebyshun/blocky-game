// Wallets for the claim page: browser wallets that announce themselves (EIP-6963: MetaMask, Rabby,
// Coinbase Wallet extension, ...) and Coinbase Smart Wallet / the Base App through the Coinbase
// Wallet SDK (loaded only when picked). Everything happens on Base.

const BASE = {
  chainId: '0x2105',
  chainName: 'Base',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org'],
};

const found = new Map(); // uuid -> { info, provider }
const listeners = new Set();
window.addEventListener('eip6963:announceProvider', (e) => {
  const d = e.detail;
  if (!d?.info?.uuid || !d.provider) return;
  found.set(d.info.uuid, d);
  listeners.forEach((fn) => fn());
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

// the browser wallets found so far (plus window.ethereum when nothing announced itself)
export function browserWallets() {
  const list = [...found.values()].map((d) => ({ id: d.info.uuid, name: d.info.name, icon: d.info.icon, rdns: d.info.rdns, provider: d.provider }));
  if (!list.length && window.ethereum) list.push({ id: 'injected', name: 'Browser wallet', icon: null, provider: window.ethereum });
  return list;
}
export const onWallets = (fn) => listeners.add(fn);

export async function smartWallet(appName, appLogoUrl) {
  const { createCoinbaseWalletSDK } = await import('@coinbase/wallet-sdk');
  return createCoinbaseWalletSDK({ appName, appLogoUrl, appChainIds: [8453], preference: { options: 'all' } }).getProvider();
}

async function toBase(provider) {
  const id = await provider.request({ method: 'eth_chainId' });
  if (parseInt(id, 16) === 8453) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE.chainId }] });
  } catch (e) {
    if (e?.code !== 4902 && e?.data?.originalError?.code !== 4902) throw e;
    await provider.request({ method: 'wallet_addEthereumChain', params: [BASE] });
  }
}

export async function connect(provider) {
  const [address] = await provider.request({ method: 'eth_requestAccounts' });
  if (!address) throw new Error('No account');
  await toBase(provider).catch(() => {}); // asked again before sending
  return address;
}

export async function sendTx(provider, tx) {
  await toBase(provider);
  return provider.request({ method: 'eth_sendTransaction', params: [tx] });
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

export const rejected = (e) => e?.code === 4001 || /reject|denied|cancel/i.test(e?.message || '');
