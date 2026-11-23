// Non-custodial Spatial DeFi modal for BaseCity Phase 2:
// 1. USDC Bank (Circle USDC Tower): send USDC or ETH on Base to any 0x address or Basename (.base.eth).
// 2. Morpho Vault HQ (Morpho): deposit & withdraw USDC into the verified ERC-4626 Steakhouse USDC Vault.
// Uses wallet.js (EIP-6963 browser wallets + Coinbase Smart Wallet, Base Mainnet 8453).
import {
  createPublicClient,
  fallback,
  http,
  encodeFunctionData,
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  erc20Abi,
  isAddress,
  keccak256,
  toBytes,
  concat,
  zeroHash,
} from 'viem';
import { base } from 'viem/chains';
import { CONFIG } from './config.js';
import { browserWallets, onWallets, smartWallet, connect, restoreWallet, toBase, sendTx, waitTx, rejected } from './wallet.js';
import { withBuilderCode } from './attribution.js';
import { esc } from './names.js';
import { itemSprite } from './items.js';

export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const MORPHO_STEAKHOUSE_USDC = '0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183';
const BASENAME_RESOLVER = CONFIG.basenames?.legacyResolver || '0xC6d566A56A1aFf6508b41f6c90ff131615583BCD';

const ERC4626_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'convertToAssets', stateMutability: 'view', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalAssets', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }], outputs: [{ name: 'shares', type: 'uint256' }] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [{ name: 'assets', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }], outputs: [{ name: 'shares', type: 'uint256' }] },
  { type: 'function', name: 'redeem', stateMutability: 'nonpayable', inputs: [{ name: 'shares', type: 'uint256' }, { name: 'receiver', type: 'address' }, { name: 'owner', type: 'address' }], outputs: [{ name: 'assets', type: 'uint256' }] },
];

const RESOLVER_ABI = [
  { type: 'function', name: 'addr', stateMutability: 'view', inputs: [{ name: 'node', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }] },
];

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://base-rpc.publicnode.com'),
    http('https://mainnet.base.org'),
    http('https://base.publicnode.com'),
  ]),
});

function namehash(name) {
  let node = zeroHash;
  const clean = String(name || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!clean) return node;
  const labels = clean.split('.').reverse();
  for (const label of labels) {
    node = keccak256(concat([node, keccak256(toBytes(label))]));
  }
  return node;
}

async function resolveRecipient(raw) {
  const s = String(raw || '').trim();
  if (!s) throw new Error('Enter a recipient 0x address or Basename.');
  if (isAddress(s)) return { address: s, label: `${s.slice(0, 6)}…${s.slice(-4)}` };
  const basename = s.includes('.') ? s.toLowerCase() : `${s.toLowerCase()}.base.eth`;
  if (!/^[a-z0-9-]+\.base\.eth$/.test(basename)) {
    throw new Error('Enter a valid 0x address or name.base.eth Basename.');
  }
  const addr = await client.readContract({
    address: BASENAME_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: 'addr',
    args: [namehash(basename)],
  }).catch(() => null);
  if (!addr || addr === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Could not resolve Basename "${basename}" on Base.`);
  }
  return { address: addr, label: basename };
}

function fmtUsdc(units) {
  const n = Number(formatUnits(units || 0n, 6));
  if (!Number.isFinite(n)) return '0.00';
  return n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n.toFixed(2);
}

function fmtEth(wei) {
  const n = Number(formatEther(wei || 0n));
  if (!Number.isFinite(n) || n === 0) return '0.0000';
  return n < 0.0001 ? '<0.0001' : n.toFixed(4);
}

export function createDefiUI({ onAction, onFlyTo } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'td-wrap';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="td lp-modal" role="dialog" aria-modal="true" aria-label="BaseCity Onchain DeFi">
      <div class="td-head">
        <span id="df-head-ico">${itemSprite('coin-usdc', 38)}</span>
        <div class="td-title">
          <b id="df-title">USDC Bank</b>
          <span id="df-sub">Non-custodial execution on Base Mainnet</span>
          <div class="lp-badges">
            <span class="lp-badge">Base Mainnet</span>
            <span class="lp-badge">Self-Custody</span>
          </div>
        </div>
        <button type="button" class="td-x" aria-label="Close">Close</button>
      </div>

      <div class="lp-seg lp-mode-tabs" id="df-tabs">
        <button type="button" class="lp-seg-btn on" data-dtab="usdc">USDC Bank</button>
        <button type="button" class="lp-seg-btn" data-dtab="morpho">Morpho Vault</button>
      </div>

      <div class="lp-mkt-stats" id="df-stats">
        <div><span>Wallet USDC</span><b id="df-bal-usdc">—</b></div>
        <div><span>Wallet ETH</span><b id="df-bal-eth">—</b></div>
        <div><span>Morpho Vault</span><b id="df-bal-vault">—</b></div>
      </div>

      <div id="df-view-usdc">
        <p class="lp-desc">Send USDC or ETH on Base directly from your wallet to any 0x address or Basename. BaseCity never holds keys or funds.</p>
        <form class="lp-form" id="df-send-form">
          <div class="lp-field">
            <span class="lp-lbl">Asset</span>
            <div class="lp-seg" id="df-asset-seg">
              <button type="button" class="lp-seg-btn on" data-asset="USDC">USDC</button>
              <button type="button" class="lp-seg-btn" data-asset="ETH">ETH</button>
            </div>
          </div>

          <label class="lp-field">
            <span class="lp-lbl">Recipient (0x address or name.base.eth)</span>
            <input id="df-to" required placeholder="0x... or jesse.base.eth" spellcheck="false" autocomplete="off" />
          </label>

          <label class="lp-field">
            <span class="lp-lbl">Amount (<b id="df-asset-sym">USDC</b>)</span>
            <input id="df-send-amt" type="number" min="0" step="any" required placeholder="10" />
          </label>

          <div class="lp-seg" id="df-send-quick">
            <button type="button" class="lp-seg-btn" data-sq="0.25">25%</button>
            <button type="button" class="lp-seg-btn" data-sq="0.5">50%</button>
            <button type="button" class="lp-seg-btn" data-sq="1">MAX</button>
          </div>

          <div class="lp-actions">
            <button type="button" class="btn lp-btn-sec df-connect-btn">Connect Wallet</button>
            <button type="submit" class="btn lp-btn-pri" id="df-send-submit">Send on Base</button>
          </div>
        </form>
      </div>

      <div id="df-view-morpho" hidden>
        <p class="lp-desc">Earn yield on idle USDC via the verified ERC-4626 <a target="_blank" rel="noopener" href="https://basescan.org/address/${MORPHO_STEAKHOUSE_USDC}">Steakhouse USDC Vault</a> on Morpho (Base). <span id="df-vault-tvl"></span></p>
        <form class="lp-form" id="df-morpho-form">
          <div class="lp-field">
            <span class="lp-lbl">Action</span>
            <div class="lp-seg" id="df-morpho-seg">
              <button type="button" class="lp-seg-btn on" data-mmode="deposit">Deposit USDC</button>
              <button type="button" class="lp-seg-btn" data-mmode="withdraw">Withdraw USDC</button>
            </div>
          </div>

          <label class="lp-field">
            <span class="lp-lbl">Amount (USDC)</span>
            <input id="df-morpho-amt" type="number" min="0" step="any" required placeholder="25" />
          </label>

          <div class="lp-seg" id="df-morpho-quick">
            <button type="button" class="lp-seg-btn" data-mq="0.25">25%</button>
            <button type="button" class="lp-seg-btn" data-mq="0.5">50%</button>
            <button type="button" class="lp-seg-btn" data-mq="1">MAX</button>
          </div>

          <div id="df-morpho-note" class="lp-status muted">
            <span>Deposits use atomic EIP-5792 batching when supported, or Approve + Deposit.</span>
          </div>

          <div class="lp-actions">
            <button type="button" class="btn lp-btn-sec df-connect-btn">Connect Wallet</button>
            <button type="submit" class="btn lp-btn-pri" id="df-morpho-submit">Deposit USDC</button>
          </div>
        </form>
      </div>

      <div id="df-wallet-box" class="lp-wallet-box" hidden>
        <div class="lp-wallet-head">
          <span>Select Wallet</span>
          <button type="button" id="df-wallet-close" class="lp-mini-x" aria-label="Close wallet list">Close</button>
        </div>
        <div id="df-wallet-list" class="lp-wallet-list"></div>
      </div>

      <div id="df-msg" class="lp-msg" hidden></div>

      <div class="lp-foot">
        <button type="button" class="lp-fly-btn" id="df-fly">Fly to Circle USDC Tower</button>
        <a class="lp-fly-btn" id="df-scan" target="_blank" rel="noopener" href="https://basescan.org/token/${BASE_USDC}">Basescan</a>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const $ = (sel) => wrap.querySelector(sel);
  const titleEl = $('#df-title');
  const subEl = $('#df-sub');
  const usdcView = $('#df-view-usdc');
  const morphoView = $('#df-view-morpho');
  const msgEl = $('#df-msg');
  const walletBox = $('#df-wallet-box');
  const walletListEl = $('#df-wallet-list');
  const flyBtn = $('#df-fly');
  const scanLink = $('#df-scan');

  let activeTab = 'usdc';
  let sendAsset = 'USDC';
  let morphoMode = 'deposit';
  let redeemMax = false;
  let provider = null;
  let account = null;
  let walletName = '';
  let lastWalletSig = '';
  let balUsdc = 0n;
  let balEth = 0n;
  let vaultShares = 0n;
  let vaultAssets = 0n;

  function setMsg(html, tone = 'info') {
    msgEl.hidden = false;
    msgEl.className = `lp-msg ${tone}`;
    msgEl.innerHTML = html;
  }

  function syncConnectButtons() {
    const label = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Connect Wallet';
    wrap.querySelectorAll('.df-connect-btn').forEach((btn) => {
      btn.textContent = label;
      btn.title = account ? `${walletName}: ${account} (click to switch wallet)` : 'Connect a Base wallet';
    });
  }

  function setTab(tab) {
    activeTab = tab === 'morpho' ? 'morpho' : 'usdc';
    wrap.querySelectorAll('[data-dtab]').forEach((b) => b.classList.toggle('on', b.dataset.dtab === activeTab));
    usdcView.hidden = activeTab !== 'usdc';
    morphoView.hidden = activeTab !== 'morpho';
    const headIco = $('#df-head-ico');
    if (activeTab === 'morpho') {
      if (headIco) headIco.innerHTML = itemSprite('poi-morpho', 38);
      titleEl.textContent = 'Morpho Vault HQ';
      subEl.textContent = 'Steakhouse USDC ERC-4626 Vault · Base';
      flyBtn.textContent = 'Fly to Morpho HQ';
      scanLink.href = `https://basescan.org/address/${MORPHO_STEAKHOUSE_USDC}`;
    } else {
      if (headIco) headIco.innerHTML = itemSprite('coin-usdc', 38);
      titleEl.textContent = 'USDC Bank';
      subEl.textContent = 'Send USDC or ETH on Base · Basenames supported';
      flyBtn.textContent = 'Fly to Circle USDC Tower';
      scanLink.href = `https://basescan.org/token/${BASE_USDC}`;
    }
    msgEl.hidden = true;
    refreshBalances();
  }

  async function refreshBalances() {
    client.readContract({
      address: MORPHO_STEAKHOUSE_USDC,
      abi: ERC4626_ABI,
      functionName: 'totalAssets',
    }).then((tvl) => {
      const tvlEl = $('#df-vault-tvl');
      if (tvlEl && tvl > 0n) tvlEl.textContent = `Vault TVL: $${fmtUsdc(tvl)} USDC.`;
    }).catch(() => {});

    if (!account) {
      $('#df-bal-usdc').textContent = '—';
      $('#df-bal-eth').textContent = '—';
      $('#df-bal-vault').textContent = '—';
      return;
    }
    try {
      const [u, e, sh] = await Promise.all([
        client.readContract({ address: BASE_USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
        client.getBalance({ address: account }),
        client.readContract({ address: MORPHO_STEAKHOUSE_USDC, abi: ERC4626_ABI, functionName: 'balanceOf', args: [account] }),
      ]);
      balUsdc = u || 0n;
      balEth = e || 0n;
      vaultShares = sh || 0n;
      vaultAssets = vaultShares > 0n
        ? await client.readContract({ address: MORPHO_STEAKHOUSE_USDC, abi: ERC4626_ABI, functionName: 'convertToAssets', args: [vaultShares] }).catch(() => 0n)
        : 0n;
      $('#df-bal-usdc').textContent = `$${fmtUsdc(balUsdc)}`;
      $('#df-bal-eth').textContent = `${fmtEth(balEth)} ETH`;
      $('#df-bal-vault').textContent = `$${fmtUsdc(vaultAssets)}`;
    } catch { /* keep prior display */ }
  }

  function renderWalletList(force = false) {
    const wallets = browserWallets();
    const sig = wallets.map((w) => w.id).join('|');
    if (!force && sig === lastWalletSig && walletListEl.childElementCount > 0) return;
    lastWalletSig = sig;
    const rows = wallets.map((w, idx) => `
      <button type="button" class="lp-w-item" data-widx="${idx}">
        <span>${esc(w.name)}</span>
        <small>Browser</small>
      </button>`).join('');
    walletListEl.innerHTML = `${rows}
      <button type="button" class="lp-w-item" data-wsmart="1">
        <span>Base / Coinbase Smart Wallet</span>
        <small>Passkey / App</small>
      </button>`;

    walletListEl.querySelectorAll('[data-widx]').forEach((btn) => {
      btn.onclick = async () => {
        const w = wallets[Number(btn.dataset.widx)];
        if (w) await connectWith(w.provider, w.name);
      };
    });
    const smartBtn = walletListEl.querySelector('[data-wsmart]');
    if (smartBtn) {
      smartBtn.onclick = async () => {
        try {
          setMsg('Opening Coinbase / Base Smart Wallet...');
          const p = await smartWallet(CONFIG.cityName || 'BaseCity', `${location.origin}/favicon.svg`);
          await connectWith(p, 'Smart Wallet');
        } catch (e) {
          if (!rejected(e)) setMsg(esc(e.message || 'Smart Wallet connection failed'), 'err');
        }
      };
    }
  }

  async function connectWith(p, label) {
    try {
      const addr = await connect(p);
      provider = p;
      account = addr;
      walletName = label || 'Wallet';
      walletBox.hidden = true;
      syncConnectButtons();
      setMsg(`Connected <b>${esc(walletName)}</b>: <code>${esc(addr.slice(0, 6))}…${esc(addr.slice(-4))}</code>`, 'ok');
      await refreshBalances();
    } catch (e) {
      if (!rejected(e)) setMsg(esc(e.message || 'Wallet connection failed'), 'err');
    }
  }

  onWallets(() => { if (!walletBox.hidden) renderWalletList(false); });
  wrap.querySelectorAll('.df-connect-btn').forEach((btn) => {
    btn.onclick = () => {
      walletBox.hidden = !walletBox.hidden;
      if (!walletBox.hidden) renderWalletList(true);
    };
  });
  $('#df-wallet-close').onclick = () => { walletBox.hidden = true; };

  wrap.querySelectorAll('[data-dtab]').forEach((btn) => {
    btn.onclick = () => setTab(btn.dataset.dtab);
  });

  wrap.querySelectorAll('[data-asset]').forEach((btn) => {
    btn.onclick = () => {
      sendAsset = btn.dataset.asset;
      wrap.querySelectorAll('[data-asset]').forEach((b) => b.classList.toggle('on', b === btn));
      $('#df-asset-sym').textContent = sendAsset;
      $('#df-send-amt').placeholder = sendAsset === 'USDC' ? '10' : '0.005';
    };
  });

  wrap.querySelectorAll('[data-sq]').forEach((btn) => {
    btn.onclick = () => {
      const frac = Number(btn.dataset.sq);
      if (sendAsset === 'USDC') {
        const val = (Number(formatUnits(balUsdc, 6)) * frac);
        $('#df-send-amt').value = val > 0 ? val.toFixed(6).replace(/\.?0+$/, '') : '';
      } else {
        const reserve = frac === 1 ? 0.0002 : 0;
        const val = Math.max(0, Number(formatEther(balEth)) * frac - reserve);
        $('#df-send-amt').value = val > 0 ? val.toFixed(6).replace(/\.?0+$/, '') : '';
      }
    };
  });

  wrap.querySelectorAll('[data-mmode]').forEach((btn) => {
    btn.onclick = () => {
      morphoMode = btn.dataset.mmode;
      redeemMax = false;
      wrap.querySelectorAll('[data-mmode]').forEach((b) => b.classList.toggle('on', b === btn));
      $('#df-morpho-submit').textContent = morphoMode === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC';
      $('#df-morpho-note').innerHTML = morphoMode === 'deposit'
        ? '<span>Deposits use atomic EIP-5792 batching when supported, or Approve + Deposit.</span>'
        : '<span>Withdraws USDC directly from Morpho Steakhouse Vault back to your wallet.</span>';
    };
  });

  $('#df-morpho-amt').oninput = () => { redeemMax = false; };
  wrap.querySelectorAll('[data-mq]').forEach((btn) => {
    btn.onclick = () => {
      const frac = Number(btn.dataset.mq);
      const baseUnits = morphoMode === 'deposit' ? balUsdc : vaultAssets;
      const val = Number(formatUnits(baseUnits, 6)) * frac;
      $('#df-morpho-amt').value = val > 0 ? val.toFixed(6).replace(/\.?0+$/, '') : '';
      redeemMax = morphoMode === 'withdraw' && frac === 1 && vaultShares > 0n;
    };
  });

  // ---------- USDC Bank Submit ----------
  $('#df-send-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!provider || !account) {
      walletBox.hidden = false;
      renderWalletList(true);
      return setMsg('Connect a wallet on Base first.', 'err');
    }
    const rawTo = $('#df-to').value.trim();
    const amtStr = $('#df-send-amt').value.trim();
    const submitBtn = $('#df-send-submit');
    submitBtn.disabled = true;
    try {
      const amtNum = Number(amtStr);
      if (!Number.isFinite(amtNum) || amtNum <= 0) throw new Error('Enter a positive amount.');
      setMsg('Resolving recipient on Base...');
      const recipient = await resolveRecipient(rawTo);
      let txHash;
      if (sendAsset === 'USDC') {
        const units = parseUnits(amtStr, 6);
        if (balUsdc > 0n && units > balUsdc) throw new Error('Amount exceeds wallet USDC balance.');
        setMsg(`Confirm sending <b>${esc(amtStr)} USDC</b> to ${esc(recipient.label)} in ${esc(walletName)}...`);
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [recipient.address, units],
        });
        txHash = await sendTx(provider, { from: account, to: BASE_USDC, data });
      } else {
        const wei = parseEther(amtStr);
        if (balEth > 0n && wei > balEth) throw new Error('Amount exceeds wallet ETH balance.');
        setMsg(`Confirm sending <b>${esc(amtStr)} ETH</b> to ${esc(recipient.label)} in ${esc(walletName)}...`);
        txHash = await sendTx(provider, { from: account, to: recipient.address, value: `0x${wei.toString(16)}` });
      }
      setMsg(`Confirming on Base... <a target="_blank" rel="noopener" href="https://basescan.org/tx/${esc(txHash)}">Basescan</a>`);
      const res = await waitTx(txHash, provider);
      if (res.ok === false) throw new Error('Transfer transaction reverted.');
      setMsg(`Sent <b>${esc(amtStr)} ${esc(sendAsset)}</b> to ${esc(recipient.label)}. <a target="_blank" rel="noopener" href="https://basescan.org/tx/${esc(txHash)}">View on Basescan</a>`, 'ok');
      $('#df-send-amt').value = '';
      await refreshBalances();
      onAction?.({ building: 'usdc', mode: 'send', symbol: sendAsset, amount: amtStr, to: recipient.label, txHash });
    } catch (err) {
      if (!rejected(err)) setMsg(esc(err.shortMessage || err.message || 'Transfer failed'), 'err');
      else setMsg('Transaction cancelled.', 'err');
    } finally {
      submitBtn.disabled = false;
    }
  };

  // ---------- Morpho Vault Submit ----------
  $('#df-morpho-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!provider || !account) {
      walletBox.hidden = false;
      renderWalletList(true);
      return setMsg('Connect a wallet on Base first.', 'err');
    }
    const amtStr = $('#df-morpho-amt').value.trim();
    const submitBtn = $('#df-morpho-submit');
    submitBtn.disabled = true;
    try {
      const amtNum = Number(amtStr);
      if (!Number.isFinite(amtNum) || amtNum <= 0) throw new Error('Enter a positive USDC amount.');
      const units = parseUnits(amtStr, 6);

      if (morphoMode === 'deposit') {
        if (balUsdc > 0n && units > balUsdc) throw new Error('Amount exceeds wallet USDC balance.');
        const approveData = encodeFunctionData({
          abi: erc20Abi,
          functionName: 'approve',
          args: [MORPHO_STEAKHOUSE_USDC, units],
        });
        const depositData = encodeFunctionData({
          abi: ERC4626_ABI,
          functionName: 'deposit',
          args: [units, account],
        });

        setMsg('Checking USDC allowance for Morpho Vault...');
        const allow = await client.readContract({
          address: BASE_USDC,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account, MORPHO_STEAKHOUSE_USDC],
        });

        let batched = false;
        let txHash = '';
        if (allow < units) {
          // Try EIP-5792 atomic batch (approve + deposit) first on supporting wallets
          try {
            await toBase(provider);
            setMsg(`Confirm atomic Approve + Deposit of <b>${esc(amtStr)} USDC</b> in ${esc(walletName)}...`);
            const batchRes = await provider.request({
              method: 'wallet_sendCalls',
              params: [{
                version: '1.0',
                chainId: '0x2105',
                from: account,
                calls: [
                  withBuilderCode({ to: BASE_USDC, data: approveData }),
                  withBuilderCode({ to: MORPHO_STEAKHOUSE_USDC, data: depositData }),
                ],
              }],
            });
            if (batchRes) {
              batched = true;
              setMsg(`Batched deposit of <b>${esc(amtStr)} USDC</b> submitted to Morpho Steakhouse Vault.`, 'ok');
            }
          } catch (batchErr) {
            if (rejected(batchErr)) throw batchErr;
            // Wallet does not support EIP-5792: fall back to sequential Approve -> Deposit
            setMsg(`Step 1/2: Approve <b>${esc(amtStr)} USDC</b> for Morpho Vault...`);
            const appHash = await sendTx(provider, { from: account, to: BASE_USDC, data: approveData });
            const appRes = await waitTx(appHash, provider);
            if (appRes.ok === false) throw new Error('USDC approval reverted.');
          }
        }

        if (!batched) {
          setMsg(`Confirm deposit of <b>${esc(amtStr)} USDC</b> into Morpho Vault...`);
          txHash = await sendTx(provider, { from: account, to: MORPHO_STEAKHOUSE_USDC, data: depositData });
          setMsg(`Confirming deposit on Base... <a target="_blank" rel="noopener" href="https://basescan.org/tx/${esc(txHash)}">Basescan</a>`);
          const res = await waitTx(txHash, provider);
          if (res.ok === false) throw new Error('Morpho deposit reverted.');
          setMsg(`Deposited <b>${esc(amtStr)} USDC</b> into Morpho Steakhouse Vault. <a target="_blank" rel="noopener" href="https://basescan.org/tx/${esc(txHash)}">View on Basescan</a>`, 'ok');
        }
        $('#df-morpho-amt').value = '';
        await refreshBalances();
        onAction?.({ building: 'morpho', mode: 'deposit', symbol: 'USDC', amount: amtStr, txHash });
      } else {
        let data;
        if (redeemMax && vaultShares > 0n) {
          data = encodeFunctionData({
            abi: ERC4626_ABI,
            functionName: 'redeem',
            args: [vaultShares, account, account],
          });
        } else {
          if (vaultAssets > 0n && units > vaultAssets) throw new Error('Amount exceeds deposited Morpho balance.');
          data = encodeFunctionData({
            abi: ERC4626_ABI,
            functionName: 'withdraw',
            args: [units, account, account],
          });
        }
        setMsg(`Confirm withdrawing <b>${esc(amtStr)} USDC</b> from Morpho Vault...`);
        const txHash = await sendTx(provider, { from: account, to: MORPHO_STEAKHOUSE_USDC, data });
        setMsg(`Confirming withdrawal on Base... <a target="_blank" rel="noopener" href="https://basescan.org/tx/${esc(txHash)}">Basescan</a>`);
        const res = await waitTx(txHash, provider);
        if (res.ok === false) throw new Error('Morpho withdrawal reverted.');
        setMsg(`Withdrew <b>${esc(amtStr)} USDC</b> from Morpho Steakhouse Vault. <a target="_blank" rel="noopener" href="https://basescan.org/tx/${esc(txHash)}">View on Basescan</a>`, 'ok');
        $('#df-morpho-amt').value = '';
        redeemMax = false;
        await refreshBalances();
        onAction?.({ building: 'morpho', mode: 'withdraw', symbol: 'USDC', amount: amtStr, txHash });
      }
    } catch (err) {
      if (!rejected(err)) setMsg(esc(err.shortMessage || err.message || 'Morpho transaction failed'), 'err');
      else setMsg('Transaction cancelled.', 'err');
    } finally {
      submitBtn.disabled = false;
    }
  };

  $('.td-x').onclick = () => { wrap.hidden = true; };
  wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.hidden = true; });
  flyBtn.onclick = () => { wrap.hidden = true; onFlyTo?.(activeTab); };
  wrap.addEventListener('keydown', (e) => e.stopPropagation());

  return {
    open(tab = 'usdc') {
      wrap.hidden = false;
      window.dispatchEvent(new Event('eip6963:requestProvider'));
      if (!account) {
        restoreWallet().then((w) => {
          if (!w || account) return;
          provider = w.provider;
          account = w.address;
          walletName = w.name;
          syncConnectButtons();
          refreshBalances();
        });
      }
      setTab(tab);
    },
    close() { wrap.hidden = true; },
    get isOpen() { return !wrap.hidden; },
  };
}
