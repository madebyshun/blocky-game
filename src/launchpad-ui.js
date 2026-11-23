// Interactive Launchpad Tower + Token Market (Base + $BLOCKY / Stocks / ETH pairs).
// Uses wallet.js (which appends ERC-8021 Builder Code bc_4wygqlmz automatically via withBuilderCode).
import { createPublicClient, fallback, http, encodeFunctionData, parseEther, parseUnits, erc20Abi, zeroAddress, decodeEventLog, isAddress, keccak256, toBytes } from 'viem';
import { base } from 'viem/chains';
import { CONFIG } from './config.js';
import { browserWallets, onWallets, smartWallet, connect, restoreWallet, sendTx, waitTx, rejected } from './wallet.js';
import { esc } from './names.js';
import { itemSprite } from './items.js';

export const LAUNCH_FACTORY_V3 = '0x006Da367654a487bb277fe25ff54f0fE0f741377';
export const BLOCKY_TREASURY = CONFIG.nft?.treasury || '0x8eBA37eF94E6b831Fe8bf6a62e79D0DC6FD8C34D';

const LAUNCHED_TOPIC = keccak256(toBytes('Launched(address,address,bytes32,uint256,uint256)'));

const LAUNCH_V3_ABI = [
  {
    type: 'function',
    name: 'launch',
    stateMutability: 'payable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'contractURI', type: 'string' },
      { name: 'salt', type: 'bytes32' },
      { name: 'quote', type: 'address' },
      { name: 'quoteIn', type: 'uint256' },
      { name: 'fee', type: 'uint24' },
      { name: 'referrer', type: 'address' },
    ],
    outputs: [{ name: 'token', type: 'address' }],
  },
  {
    type: 'function',
    name: 'setQuote',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'quote', type: 'address' },
      { name: 'enabled', type: 'bool' },
      { name: 'startTick', type: 'int24' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setCreatorRecipient',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'quotes',
    stateMutability: 'view',
    inputs: [{ name: 'quote', type: 'address' }],
    outputs: [{ name: 'enabled', type: 'bool' }, { name: 'startTick', type: 'int24' }],
  },
  {
    type: 'function',
    name: 'quoteAdmin',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'predictToken',
    stateMutability: 'view',
    inputs: [{ name: 'caller', type: 'address' }, { name: 'salt', type: 'bytes32' }],
    outputs: [{ name: 'token', type: 'address' }],
  },
  {
    type: 'event',
    name: 'Launched',
    inputs: [
      { name: 'token', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'poolId', type: 'bytes32', indexed: true },
      { name: 'devBuyIn', type: 'uint256', indexed: false },
      { name: 'devBuyTokens', type: 'uint256', indexed: false },
    ],
  },
];

const BASE_CRYPTO_QUOTES = [
  { group: 'crypto', label: 'USDC · USD Coin', symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, defaultAmt: '5', usdHint: 1 },
  { group: 'crypto', label: 'cbBTC · Coinbase Wrapped BTC', symbol: 'cbBTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, defaultAmt: '0.0001', usdHint: 90000 },
  { group: 'crypto', label: 'AERO · Aerodrome', symbol: 'AERO', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18, defaultAmt: '5', usdHint: 1.2 },
  { group: 'crypto', label: 'VIRTUAL · Virtuals Protocol', symbol: 'VIRTUAL', address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', decimals: 18, defaultAmt: '5', usdHint: 1.5 },
  { group: 'crypto', label: 'QUADRA · Quadra', symbol: 'QUADRA', address: '0xb200000000000000000000d096efba9896ab0816', decimals: 18, defaultAmt: '100', usdHint: 0.05 },
];

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://base-rpc.publicnode.com'),
    http('https://mainnet.base.org'),
    http('https://base.publicnode.com'),
  ]),
});

function randomSalt() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function calcStartTick(targetUsd, quoteUsd, decimals) {
  const rawQuote = (targetUsd / Math.max(quoteUsd, 1e-9)) * (10 ** decimals);
  const tick = Math.log(1e27 / rawQuote) / Math.log(1.0001);
  return Math.round(tick / 200) * 200;
}

function fmtUsdCompact(v) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toPrecision(3)}`;
  return '$0';
}

function fmtAgo(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function createLaunchpadUI({ onLaunched, onFlyTo } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'td-wrap';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="td lp-modal" role="dialog" aria-modal="true" aria-label="Launchpad Tower">
      <div class="td-head">
        ${itemSprite('poi-launch', 38)}
        <div class="td-title">
          <b>Launchpad Tower</b>
          <span>Uniswap v4 Locked LP · 15s Anti-Sniper</span>
          <div class="lp-badges">
            <span class="lp-badge">Base Mainnet</span>
            <span class="lp-badge">80% Creator Fees</span>
          </div>
        </div>
        <button type="button" class="td-x" aria-label="Close">Close</button>
      </div>

      <div class="lp-seg lp-mode-tabs" id="lp-main-tabs">
        <button type="button" class="lp-seg-btn on" data-mtab="launch">Launch Token</button>
        <button type="button" class="lp-seg-btn" data-mtab="market">Market</button>
      </div>

      <div id="lp-view-launch">
        <p class="lp-desc">Launch a fixed-supply 1B token on Base with permanently locked liquidity. Each launch raises a new tower in BaseCity.</p>

        <form class="lp-form">
          <div class="lp-grid">
            <label class="lp-field">
              <span class="lp-lbl">Token Name</span>
              <input id="lp-name" required maxlength="32" placeholder="Base Builder Coin" />
            </label>
            <label class="lp-field">
              <span class="lp-lbl">Symbol</span>
              <input id="lp-sym" required maxlength="10" placeholder="BBC" />
            </label>
          </div>

          <div class="lp-field">
            <span class="lp-lbl">Quote Pair</span>
            <div class="lp-seg" id="lp-q-tabs">
              <button type="button" class="lp-seg-btn on" data-qtab="eth">ETH</button>
              <button type="button" class="lp-seg-btn" data-qtab="blocky">$BLOCKY</button>
              <button type="button" class="lp-seg-btn" data-qtab="stocks">Stocks</button>
              <button type="button" class="lp-seg-btn" data-qtab="crypto">Base</button>
            </div>
            <select id="lp-quote" hidden></select>
          </div>

          <div id="lp-quote-status" class="lp-status"></div>

          <div class="lp-grid">
            <label class="lp-field">
              <span class="lp-lbl">Initial Dev Buy (<b id="lp-q-sym">ETH</b>)</span>
              <input id="lp-amt" type="number" min="0" step="any" value="0.002" />
            </label>
            <div class="lp-field">
              <span class="lp-lbl">LP Fee Tier</span>
              <div class="lp-seg" id="lp-fee-seg">
                <button type="button" class="lp-seg-btn on" data-fee="10000">1% Low</button>
                <button type="button" class="lp-seg-btn" data-fee="30000">3% High</button>
              </div>
            </div>
          </div>

          <label class="lp-field">
            <span class="lp-lbl">Fee Recipient Wallet (optional)</span>
            <input id="lp-fee-addr" maxlength="42" placeholder="0x... (leave blank for default)" spellcheck="false" autocomplete="off" />
          </label>

          <label class="lp-field">
            <span class="lp-lbl">Description (optional)</span>
            <input id="lp-desc" maxlength="140" placeholder="Launched from BaseCity Launchpad Tower" />
          </label>

          <div id="lp-wallet-box" class="lp-wallet-box" hidden>
            <div class="lp-wallet-head">
              <span>Select Wallet</span>
              <button type="button" id="lp-wallet-close" class="lp-mini-x" aria-label="Close wallet list">Close</button>
            </div>
            <div id="lp-wallet-list" class="lp-wallet-list"></div>
          </div>

          <div class="lp-actions">
            <button type="button" class="btn lp-btn-sec" id="lp-connect">Connect Wallet</button>
            <button type="submit" class="btn lp-btn-pri" id="lp-submit">Launch Token</button>
          </div>
        </form>

        <div id="lp-msg" class="lp-msg" hidden></div>
      </div>

      <div id="lp-view-market" hidden>
        <div class="lp-mkt-stats" id="lp-mkt-stats">
          <div><span>Launched</span><b id="lp-ms-count">—</b></div>
          <div><span>24h Volume</span><b id="lp-ms-vol">—</b></div>
          <div><span>Top MCap</span><b id="lp-ms-top">—</b></div>
        </div>

        <div class="lp-mkt-bar">
          <input id="lp-mkt-q" type="search" placeholder="Search name, symbol, or 0x..." />
          <div class="lp-seg lp-mkt-sorts" id="lp-mkt-sorts">
            <button type="button" class="lp-seg-btn on" data-msort="new">Newest</button>
            <button type="button" class="lp-seg-btn" data-msort="vol">Volume</button>
            <button type="button" class="lp-seg-btn" data-msort="mcap">MCap</button>
          </div>
        </div>

        <div id="lp-mkt-list" class="lp-mkt-list">
          <div class="lp-mkt-empty">Loading launched tokens on Base...</div>
        </div>
      </div>

      <div class="lp-foot">
        <button type="button" class="lp-fly-btn" id="lp-fly">Fly to Launchpad Tower</button>
        <button type="button" class="lp-fly-btn" id="lp-mkt-refresh" hidden>Refresh Market</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);

  const $ = (sel) => wrap.querySelector(sel);
  const msgEl = $('#lp-msg');
  const statusEl = $('#lp-quote-status');
  const quoteSel = $('#lp-quote');
  const amtInput = $('#lp-amt');
  const qSymEl = $('#lp-q-sym');
  const feeAddrInput = $('#lp-fee-addr');
  const connectBtn = $('#lp-connect');
  const submitBtn = $('#lp-submit');
  const walletBox = $('#lp-wallet-box');
  const walletListEl = $('#lp-wallet-list');

  const launchView = $('#lp-view-launch');
  const marketView = $('#lp-view-market');
  const mktListEl = $('#lp-mkt-list');
  const mktQueryEl = $('#lp-mkt-q');
  const mktRefreshBtn = $('#lp-mkt-refresh');

  let provider = null;
  let account = null;
  let walletName = '';
  let lastWalletSig = '';
  let quoteAdminAddr = null;
  let activeTab = 'eth';
  let chosenFee = 10000;
  let marketSort = 'new';
  let marketTokens = [];
  let marketLoadedAt = 0;
  let marketLoading = false;

  const ETH_QUOTE = { group: 'eth', label: 'ETH (Native Base)', symbol: 'ETH', address: zeroAddress, decimals: 18, defaultAmt: '0.002', enabled: true };
  const BLOCKY_QUOTE = { group: 'blocky', label: `${CONFIG.ticker} (${CONFIG.name})`, symbol: 'BLOCKY', address: CONFIG.tokenAddress, decimals: 18, defaultAmt: '1000', usdHint: 0.01 };

  let quotesList = [
    ETH_QUOTE,
    BLOCKY_QUOTE,
    ...BASE_CRYPTO_QUOTES,
  ];
  let selectedAddr = zeroAddress;
  let stocksLoaded = false;

  function setMainTab(tab) {
    wrap.querySelectorAll('[data-mtab]').forEach((b) => b.classList.toggle('on', b.dataset.mtab === tab));
    launchView.hidden = tab !== 'launch';
    marketView.hidden = tab !== 'market';
    mktRefreshBtn.hidden = tab !== 'market';
    if (tab === 'market' && (!marketTokens.length || Date.now() - marketLoadedAt > 60000)) {
      loadMarket();
    }
  }

  wrap.querySelectorAll('[data-mtab]').forEach((btn) => {
    btn.onclick = () => setMainTab(btn.dataset.mtab);
  });

  function setMsg(html, tone = 'info') {
    msgEl.hidden = false;
    msgEl.className = `lp-msg ${tone}`;
    msgEl.innerHTML = html;
  }

  function currentQuote() {
    return quotesList.find((x) => x.address.toLowerCase() === selectedAddr.toLowerCase()) || ETH_QUOTE;
  }

  async function probeQuotes(items) {
    await Promise.all(items.map(async (q) => {
      if (q.address === zeroAddress) { q.enabled = true; return; }
      if (typeof q.enabled === 'boolean') return;
      try {
        const res = await client.readContract({
          address: LAUNCH_FACTORY_V3,
          abi: LAUNCH_V3_ABI,
          functionName: 'quotes',
          args: [q.address],
        });
        q.enabled = Boolean(res?.[0]);
      } catch {
        q.enabled = false;
      }
    }));
  }

  async function loadMeta() {
    if (!quoteAdminAddr) {
      client.readContract({
        address: LAUNCH_FACTORY_V3,
        abi: LAUNCH_V3_ABI,
        functionName: 'quoteAdmin',
      }).then((a) => {
        quoteAdminAddr = a ? String(a).toLowerCase() : null;
        renderQuoteControls();
      }).catch(() => {});
    }

    if (stocksLoaded) return;
    stocksLoaded = true;
    try {
      const [sr, cr] = await Promise.all([
        fetch('/api/stocks').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/colony').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (cr?.market?.priceUsd) BLOCKY_QUOTE.usdHint = cr.market.priceUsd;
      const liveStocks = (sr?.stocks || []).filter((s) => s.address && !s.paused?.includes(0) && s.nav != null);
      for (const s of liveStocks) {
        if (quotesList.some((q) => q.address.toLowerCase() === s.address.toLowerCase())) continue;
        quotesList.push({
          group: 'stocks',
          label: `${s.ticker} · ${s.name || 'Stock on Base'}`,
          symbol: s.ticker,
          address: s.address,
          decimals: s.decimals || 18,
          defaultAmt: '1',
          usdHint: Number(s.nav) || 100,
        });
      }
      await probeQuotes(quotesList);
      renderQuoteControls();
    } catch { /* fallback */ }
  }

  function renderQuoteControls() {
    const tabBtns = wrap.querySelectorAll('[data-qtab]');
    tabBtns.forEach((b) => b.classList.toggle('on', b.dataset.qtab === activeTab));

    const isAdmin = Boolean(account && quoteAdminAddr && account.toLowerCase() === quoteAdminAddr);

    if (activeTab === 'eth') {
      quoteSel.hidden = true;
      selectedAddr = ETH_QUOTE.address;
    } else if (activeTab === 'blocky') {
      quoteSel.hidden = true;
      selectedAddr = BLOCKY_QUOTE.address;
    } else {
      const pool = quotesList.filter((q) => q.group === activeTab);
      const visible = isAdmin ? pool : pool.filter((q) => q.enabled === true);
      const sorted = [
        ...visible.filter((q) => q.enabled === true),
        ...visible.filter((q) => q.enabled !== true),
      ];
      quoteSel.hidden = false;
      quoteSel.innerHTML = sorted.length
        ? sorted.map((q) => {
          const tag = q.enabled === true ? 'Active' : q.enabled === false ? 'Pending' : 'Checking';
          return `<option value="${esc(q.address)}">${esc(q.symbol)} — ${esc(q.label.split(' · ')[1] || q.label)} (${tag})</option>`;
        }).join('')
        : '<option value="">No active pairs available yet</option>';
      const match = sorted.find((q) => q.address.toLowerCase() === selectedAddr.toLowerCase());
      const firstActive = sorted.find((q) => q.enabled === true) || sorted[0];
      const pick = match || firstActive;
      if (pick) {
        selectedAddr = pick.address;
        quoteSel.value = pick.address;
      } else {
        selectedAddr = '';
      }
    }
    const q = currentQuote();
    qSymEl.textContent = q.symbol;
    amtInput.value = q.defaultAmt;
    renderStatus();
  }

  async function renderStatus() {
    if (!selectedAddr && (activeTab === 'stocks' || activeTab === 'crypto')) {
      statusEl.className = 'lp-status muted';
      statusEl.innerHTML = '<span>No active pairs in this category yet. Switch to ETH or $BLOCKY.</span>';
      return false;
    }
    const q = currentQuote();
    if (q.address === zeroAddress) {
      statusEl.className = 'lp-status ok';
      statusEl.innerHTML = '<span>ETH pair active on Base</span>';
      return true;
    }
    if (typeof q.enabled !== 'boolean') {
      statusEl.className = 'lp-status muted';
      statusEl.innerHTML = '<span>Checking pair status on Base...</span>';
      await probeQuotes([q]);
    }
    if (q.enabled) {
      statusEl.className = 'lp-status ok';
      statusEl.innerHTML = `<span>${esc(q.symbol)} pair active on Base</span>`;
      return true;
    }
    const isAdmin = account && quoteAdminAddr && account.toLowerCase() === quoteAdminAddr;
    statusEl.className = 'lp-status warn';
    statusEl.innerHTML = isAdmin
      ? `<div class="lp-status-row"><span>${esc(q.symbol)} is not enabled yet.</span><button type="button" class="lp-enable-btn" id="lp-enable-q">Enable ${esc(q.symbol)}</button></div>`
      : `<span>${esc(q.symbol)} awaits admin activation on Base. Switch to ETH or an Active pair.</span>`;

    const enBtn = $('#lp-enable-q');
    if (enBtn) {
      enBtn.onclick = async () => {
        try {
          enBtn.disabled = true;
          const tick = calcStartTick(15000, q.usdHint || 1, q.decimals || 18);
          setMsg(`Confirm enabling <b>${esc(q.symbol)}</b> pair in wallet...`);
          const data = encodeFunctionData({
            abi: LAUNCH_V3_ABI,
            functionName: 'setQuote',
            args: [q.address, true, tick],
          });
          const hash = await sendTx(provider, { from: account, to: LAUNCH_FACTORY_V3, data });
          const res = await waitTx(hash, provider);
          if (res.ok === false) throw new Error('setQuote reverted');
          q.enabled = true;
          setMsg(`${esc(q.symbol)} enabled on Base. Ready to launch.`, 'ok');
          renderQuoteControls();
        } catch (err) {
          if (!rejected(err)) setMsg(esc(err.message || 'Enable failed'), 'err');
        } finally {
          enBtn.disabled = false;
        }
      };
    }
    return false;
  }

  const LOCAL_LAUNCH_KEY = 'basecity:launched:v1';
  function readLocalLaunches() {
    try { return JSON.parse(localStorage.getItem(LOCAL_LAUNCH_KEY) || '[]'); } catch { return []; }
  }
  function saveLocalLaunch(entry) {
    try {
      const prev = readLocalLaunches().filter((x) => x.token?.toLowerCase() !== entry.token?.toLowerCase());
      localStorage.setItem(LOCAL_LAUNCH_KEY, JSON.stringify([entry, ...prev].slice(0, 30)));
    } catch { /* ignore */ }
  }

  // ---------- Market (Launched Tokens on Base) ----------
  async function loadMarket() {
    if (marketLoading) return;
    marketLoading = true;
    if (!marketTokens.length) mktListEl.innerHTML = '<div class="lp-mkt-empty">Loading launched tokens on Base...</div>';
    try {
      const parsed = [];
      const byToken = new Map();
      const pushEntry = (e) => {
        if (!e?.token || !isAddress(e.token)) return;
        const key = e.token.toLowerCase();
        const blk = Number(e.block) || 0;
        const at = Number(e.at) || 0;
        const existing = byToken.get(key);
        if (existing) {
          if (!existing.creator && e.creator) existing.creator = e.creator;
          if (!existing.tx && e.tx) existing.tx = e.tx;
          if (!existing.block && blk) existing.block = blk;
          if (at && (!existing.at || e.exactAt)) existing.at = at;
          if (!existing.name && e.name) existing.name = e.name;
          if (!existing.symbol && e.symbol) existing.symbol = e.symbol;
          if (!existing.quoteSymbol && e.quoteSymbol) existing.quoteSymbol = e.quoteSymbol;
          return;
        }
        const entry = {
          token: e.token,
          creator: e.creator || '',
          tx: e.tx || '',
          block: blk,
          at,
          name: e.name || '',
          symbol: e.symbol || '',
          quoteSymbol: e.quoteSymbol || '',
          fdv: null,
          vol24: null,
          liq: null,
          change24: null,
          priceUsd: null,
          dexUrl: '',
        };
        byToken.set(key, entry);
        parsed.push(entry);
      };

      const parseEtherscanLog = (item) => {
        const topics = item.topics || [];
        if (topics[0] && topics[0].toLowerCase() !== LAUNCHED_TOPIC.toLowerCase()) return;
        const token = topics[1] ? `0x${topics[1].slice(-40)}` : null;
        const creator = topics[2] ? `0x${topics[2].slice(-40)}` : null;
        const blk = item.blockNumber != null ? Number(item.blockNumber) : 0;
        const tsSec = item.timeStamp != null ? Number(item.timeStamp) : 0;
        pushEntry({
          token,
          creator,
          tx: item.transactionHash || '',
          block: Number.isFinite(blk) ? blk : 0,
          at: Number.isFinite(tsSec) && tsSec > 0 ? tsSec * 1000 : 0,
          exactAt: Number.isFinite(tsSec) && tsSec > 0,
        });
      };

      // 1. Local recently launched tokens + known launched CAs (instant visibility)
      for (const local of readLocalLaunches()) pushEntry(local);
      const seededCAs = [
        '0xB2000000000000000000003577e92f1D4122a1D1', // $BASECITY / $BLOCKY
        '0xB2000000000000000000007560618b723474394c',
        '0xB200000000000000000000D798D8658366fC0f3a',
        '0xb20000000000000000000054F06d8bE312ac7E52',
      ];
      for (const addr of seededCAs) pushEntry({ token: addr });

      const latestPromise = client.getBlockNumber().catch(() => 0n);

      // 2. Direct RPC eth_getLogs covering ~400,000 blocks (~22h on Base @ 200ms/block)
      const rpcPromise = (async () => {
        try {
          const latest = await latestPromise;
          if (!latest) return;
          const launchedEvent = LAUNCH_V3_ABI.find((x) => x.type === 'event' && x.name === 'Launched');
          const chunkSize = 50000n;
          const ranges = [];
          for (let i = 0; i < 8; i++) {
            const toBlock = latest - BigInt(i) * chunkSize;
            if (toBlock < 0n) break;
            const fromBlock = toBlock >= chunkSize ? toBlock - chunkSize + 1n : 0n;
            ranges.push({ fromBlock, toBlock });
          }
          for (let i = 0; i < ranges.length; i += 4) {
            const batch = ranges.slice(i, i + 4);
            const chunkLogs = await Promise.all(
              batch.map(({ fromBlock, toBlock }) =>
                client.getLogs({ address: LAUNCH_FACTORY_V3, event: launchedEvent, fromBlock, toBlock }).catch(() => []),
              ),
            );
            for (const logs of chunkLogs) {
              for (const l of [...logs].reverse()) {
                const blk = Number(l.blockNumber || 0);
                const estAt = blk ? Date.now() - Math.max(0, Number(latest) - blk) * 200 : Date.now();
                pushEntry({ token: l.args?.token, creator: l.args?.creator, tx: l.transactionHash, block: blk, at: estAt });
              }
            }
          }
        } catch { /* fallback to explorer APIs */ }
      })();

      // 3. Routescan Etherscan-compatible API on Base (full launch history)
      const routescanPromise = (async () => {
        try {
          const url = `https://api.routescan.io/v2/network/mainnet/evm/8453/etherscan/api?module=logs&action=getLogs&address=${LAUNCH_FACTORY_V3}&topic0=${LAUNCHED_TOPIC}&fromBlock=0&toBlock=latest`;
          const r = await fetch(url);
          if (!r.ok) return;
          const j = await r.json();
          const items = Array.isArray(j.result) ? [...j.result].reverse() : [];
          for (const item of items) parseEtherscanLog(item);
        } catch { /* skip */ }
      })();

      // 4. Blockscout v2 REST API (paginated address logs)
      const bsV2Promise = (async () => {
        try {
          const latest = await latestPromise;
          let qs = '';
          for (let page = 0; page < 3; page++) {
            const url = `https://base.blockscout.com/api/v2/addresses/${LAUNCH_FACTORY_V3}/logs${qs}`;
            const r = await fetch(url);
            if (!r.ok) break;
            const j = await r.json();
            const items = Array.isArray(j.items) ? j.items : [];
            for (const item of items) {
              const topics = Array.isArray(item.topics) ? item.topics : [];
              if (!topics[0] || topics[0].toLowerCase() !== LAUNCHED_TOPIC.toLowerCase()) continue;
              const token = topics[1] ? `0x${topics[1].slice(-40)}` : null;
              const creator = topics[2] ? `0x${topics[2].slice(-40)}` : null;
              const blk = Number(item.block_number || 0);
              const tsRaw = item.block_timestamp || item.timestamp;
              const tsMs = tsRaw ? Date.parse(tsRaw) : 0;
              const estAt = blk && latest ? Date.now() - Math.max(0, Number(latest) - blk) * 200 : 0;
              pushEntry({
                token,
                creator,
                tx: item.transaction_hash || '',
                block: Number.isFinite(blk) ? blk : 0,
                at: Number.isFinite(tsMs) && tsMs > 0 ? tsMs : estAt,
                exactAt: Number.isFinite(tsMs) && tsMs > 0,
              });
            }
            if (!j.next_page_params) break;
            const params = new URLSearchParams();
            for (const [k, v] of Object.entries(j.next_page_params)) {
              if (v != null) params.set(k, String(v));
            }
            qs = `?${params.toString()}`;
          }
        } catch { /* skip */ }
      })();

      // 5. Blockscout v1 topic0-filtered logs (exact timestamps)
      const bsV1Promise = (async () => {
        try {
          const url = `https://base.blockscout.com/api?module=logs&action=getLogs&address=${LAUNCH_FACTORY_V3}&topic0=${LAUNCHED_TOPIC}&fromBlock=0&toBlock=latest`;
          const r = await fetch(url);
          if (!r.ok) return;
          const j = await r.json();
          const items = Array.isArray(j.result) ? [...j.result].reverse() : [];
          for (const item of items) parseEtherscanLog(item);
        } catch { /* skip */ }
      })();

      await Promise.all([rpcPromise, routescanPromise, bsV2Promise, bsV1Promise]);

      if (parsed.length) {
        const dexChunks = [];
        for (let i = 0; i < parsed.length; i += 30) {
          dexChunks.push(parsed.slice(i, i + 30).map((x) => x.token).join(','));
        }
        const [dexPages] = await Promise.all([
          Promise.all(
            dexChunks.map((addrs) =>
              fetch(`https://api.dexscreener.com/tokens/v1/base/${addrs}`).then((x) => (x.ok ? x.json() : [])).catch(() => []),
            ),
          ),
          Promise.all(parsed.map(async (t) => {
            try {
              const [name, symbol] = await Promise.all([
                client.readContract({ address: t.token, abi: erc20Abi, functionName: 'name' }),
                client.readContract({ address: t.token, abi: erc20Abi, functionName: 'symbol' }),
              ]);
              t.name = name || t.name || '';
              t.symbol = symbol || t.symbol || '';
            } catch { /* skip */ }
          })),
        ]);

        const byBase = new Map();
        for (const page of dexPages) {
          for (const p of Array.isArray(page) ? page : []) {
            const b = p.baseToken?.address?.toLowerCase();
            if (!b) continue;
            const prev = byBase.get(b);
            const liq = Number(p.liquidity?.usd || 0);
            if (!prev || liq > Number(prev.liquidity?.usd || 0)) byBase.set(b, p);
          }
        }
        for (const t of parsed) {
          const m = byBase.get(t.token.toLowerCase());
          if (!m) continue;
          t.name = t.name || m.baseToken?.name || '';
          t.symbol = t.symbol || m.baseToken?.symbol || '';
          t.quoteSymbol = m.quoteToken?.symbol || '';
          t.fdv = m.fdv ?? m.marketCap ?? null;
          t.vol24 = m.volume?.h24 ?? null;
          t.liq = m.liquidity?.usd ?? null;
          t.change24 = m.priceChange?.h24 ?? null;
          t.priceUsd = m.priceUsd ?? null;
          t.dexUrl = m.url || `https://dexscreener.com/base/${t.token}`;
        }
      }

      marketTokens = parsed;
      marketLoadedAt = Date.now();
      renderMarket();
    } catch {
      mktListEl.innerHTML = '<div class="lp-mkt-empty">Could not load launched tokens right now. Try refreshing.</div>';
    } finally {
      marketLoading = false;
    }
  }

  function renderMarket() {
    const q = (mktQueryEl.value || '').trim().toLowerCase();
    let list = marketTokens.filter((t) => {
      if (!q) return true;
      return `${t.name} ${t.symbol} ${t.token} ${t.creator}`.toLowerCase().includes(q);
    });
    if (marketSort === 'vol') {
      list = [...list].sort((a, b) => (Number(b.vol24 || -1) - Number(a.vol24 || -1)) || (b.at - a.at));
    } else if (marketSort === 'mcap') {
      list = [...list].sort((a, b) => (Number(b.fdv || -1) - Number(a.fdv || -1)) || (b.at - a.at));
    } else {
      list = [...list].sort((a, b) => (b.block - a.block) || (b.at - a.at));
    }

    const totalVol = marketTokens.reduce((s, t) => s + Number(t.vol24 || 0), 0);
    const topFdv = marketTokens.reduce((m, t) => Math.max(m, Number(t.fdv || 0)), 0);
    $('#lp-ms-count').textContent = String(marketTokens.length);
    $('#lp-ms-vol').textContent = totalVol > 0 ? fmtUsdCompact(totalVol) : '—';
    $('#lp-ms-top').textContent = topFdv > 0 ? fmtUsdCompact(topFdv) : '—';

    if (!list.length) {
      mktListEl.innerHTML = '<div class="lp-mkt-empty">No matching launched tokens found.</div>';
      return;
    }

    mktListEl.innerHTML = list.map((t) => {
      const title = t.symbol ? `${esc(t.symbol)} · ${esc(t.name || t.symbol)}` : `${esc(t.token.slice(0, 6))}…${esc(t.token.slice(-4))}`;
      const pairTag = t.quoteSymbol ? `<span class="lp-mkt-pair">/${esc(t.quoteSymbol)}</span>` : '';
      const chg = typeof t.change24 === 'number'
        ? `<span class="lp-mkt-chg ${t.change24 >= 0 ? 'up' : 'down'}">${t.change24 >= 0 ? '+' : ''}${t.change24.toFixed(1)}%</span>`
        : '';
      const creatorShort = t.creator ? `${t.creator.slice(0, 6)}…${t.creator.slice(-4)}` : '—';
      const tradeHref = `https://app.uniswap.org/swap?chain=base&outputCurrency=${t.token}`;
      return `
        <div class="lp-mkt-item">
          <div class="lp-mkt-top">
            <div class="lp-mkt-id">
              <b>${title}</b>${pairTag}${chg}
              <span class="lp-mkt-sub">by ${esc(creatorShort)} · ${esc(fmtAgo(t.at))}</span>
            </div>
            <div class="lp-mkt-actions">
              <button type="button" class="lp-mkt-btn" data-copy="${esc(t.token)}">Copy CA</button>
              <a class="lp-mkt-btn pri" target="_blank" rel="noopener" href="${esc(tradeHref)}">Trade</a>
              <a class="lp-mkt-btn" target="_blank" rel="noopener" href="https://basescan.org/token/${esc(t.token)}">Scan</a>
            </div>
          </div>
          <div class="lp-mkt-metrics">
            <span>MCap: <b>${fmtUsdCompact(t.fdv)}</b></span>
            <span>Vol 24h: <b>${fmtUsdCompact(t.vol24)}</b></span>
            <span>Liq: <b>${fmtUsdCompact(t.liq)}</b></span>
            <span class="lp-mkt-ca">${esc(t.token.slice(0, 8))}…${esc(t.token.slice(-6))}</span>
          </div>
        </div>`;
    }).join('');

    mktListEl.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.onclick = async () => {
        const addr = btn.dataset.copy;
        try {
          await navigator.clipboard.writeText(addr);
          btn.textContent = 'Copied';
          setTimeout(() => (btn.textContent = 'Copy CA'), 1600);
        } catch {
          btn.textContent = addr.slice(0, 8);
        }
      };
    });
  }

  mktQueryEl.oninput = renderMarket;
  mktRefreshBtn.onclick = () => loadMarket();
  wrap.querySelectorAll('[data-msort]').forEach((btn) => {
    btn.onclick = () => {
      marketSort = btn.dataset.msort;
      wrap.querySelectorAll('[data-msort]').forEach((b) => b.classList.toggle('on', b === btn));
      renderMarket();
    };
  });

  // ---------- Form Controls ----------
  wrap.querySelectorAll('[data-qtab]').forEach((btn) => {
    btn.onclick = () => {
      activeTab = btn.dataset.qtab;
      renderQuoteControls();
    };
  });
  quoteSel.onchange = () => {
    selectedAddr = quoteSel.value;
    const q = currentQuote();
    qSymEl.textContent = q.symbol;
    amtInput.value = q.defaultAmt;
    renderStatus();
  };
  wrap.querySelectorAll('[data-fee]').forEach((btn) => {
    btn.onclick = () => {
      chosenFee = Number(btn.dataset.fee);
      wrap.querySelectorAll('[data-fee]').forEach((b) => b.classList.toggle('on', b === btn));
    };
  });

  function renderWalletList(force = false) {
    const wallets = browserWallets();
    const sig = wallets.map((w) => w.id).join('|');
    if (!force && sig === lastWalletSig && walletListEl.childElementCount > 0) return;
    lastWalletSig = sig;

    const rows = wallets.map((w, idx) => `
      <button type="button" class="lp-w-item" data-widx="${idx}">
        <span>${esc(w.name)}</span>
        <small>Browser</small>
      </button>
    `).join('');
    walletListEl.innerHTML = `${rows}
      <button type="button" class="lp-w-item" data-wsmart="1">
        <span>Base / Coinbase Smart Wallet</span>
        <small>Passkey / App</small>
      </button>`;

    walletListEl.querySelectorAll('[data-widx]').forEach((btn) => {
      btn.onclick = async () => {
        const w = wallets[Number(btn.dataset.widx)];
        if (!w) return;
        await connectWith(w.provider, w.name);
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
      connectBtn.textContent = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
      connectBtn.title = `${walletName}: ${addr} (click to switch wallet)`;
      setMsg(`Connected <b>${esc(walletName)}</b>: <code>${esc(addr.slice(0, 6))}…${esc(addr.slice(-4))}</code>`, 'ok');
      renderQuoteControls();
    } catch (e) {
      if (!rejected(e)) setMsg(esc(e.message || 'Wallet connection failed'), 'err');
    }
  }

  onWallets(() => {
    if (!walletBox.hidden) renderWalletList(false);
  });

  connectBtn.onclick = () => {
    walletBox.hidden = !walletBox.hidden;
    if (!walletBox.hidden) renderWalletList(true);
  };
  $('#lp-wallet-close').onclick = () => { walletBox.hidden = true; };

  $('.lp-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#lp-name').value.trim();
    const symbol = $('#lp-sym').value.trim().toUpperCase();
    const desc = $('#lp-desc').value.trim() || `${name} (${symbol}) launched from BaseCity Launchpad Tower`;
    const quote = currentQuote();
    const rawFeeWallet = feeAddrInput.value.trim();
    const amtStr = amtInput.value.trim() || '0';

    if (!name || !symbol) return setMsg('Enter both a token name and symbol.', 'err');
    if (rawFeeWallet && !isAddress(rawFeeWallet)) {
      return setMsg('Fee recipient address must be a valid 0x wallet address (or leave blank).', 'err');
    }
    const feeRecipient = rawFeeWallet || BLOCKY_TREASURY;

    if (!provider || !account) {
      walletBox.hidden = false;
      renderWalletList(true);
      return setMsg('Please choose a wallet to connect first.', 'err');
    }

    submitBtn.disabled = true;
    try {
      const enabled = await renderStatus();
      if (!enabled) {
        throw new Error(`${quote.symbol} is not enabled on Base yet. Switch to ETH or an Active pair.`);
      }
      const quoteIn = quote.address === zeroAddress
        ? parseEther(amtStr)
        : parseUnits(amtStr, quote.decimals || 18);

      if (quote.address !== zeroAddress && quoteIn > 0n) {
        setMsg(`Checking ${esc(quote.symbol)} allowance...`);
        const allow = await client.readContract({
          address: quote.address,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account, LAUNCH_FACTORY_V3],
        });
        if (allow < quoteIn) {
          setMsg(`Approving ${esc(amtStr)} ${esc(quote.symbol)}...`);
          const appData = encodeFunctionData({
            abi: erc20Abi,
            functionName: 'approve',
            args: [LAUNCH_FACTORY_V3, quoteIn],
          });
          const appHash = await sendTx(provider, { from: account, to: quote.address, data: appData });
          const appRes = await waitTx(appHash, provider);
          if (appRes.ok === false) throw new Error('Approval transaction reverted.');
        }
      }

      const salt = randomSalt();
      const meta = { name, symbol, description: desc, launchedFrom: 'BaseCity Launchpad Tower' };
      const contractURI = `data:application/json;utf8,${encodeURIComponent(JSON.stringify(meta))}`;

      let predicted = null;
      try {
        predicted = await client.readContract({
          address: LAUNCH_FACTORY_V3,
          abi: LAUNCH_V3_ABI,
          functionName: 'predictToken',
          args: [account, salt],
        });
      } catch { /* optional */ }

      setMsg(`Confirm launch of <b>${esc(symbol)}</b> / ${esc(quote.symbol)} in ${esc(walletName)}...`);
      const data = encodeFunctionData({
        abi: LAUNCH_V3_ABI,
        functionName: 'launch',
        args: [name, symbol, contractURI, salt, quote.address, quoteIn, chosenFee, feeRecipient],
      });
      const txHash = await sendTx(provider, {
        from: account,
        to: LAUNCH_FACTORY_V3,
        data,
        value: quote.address === zeroAddress ? `0x${quoteIn.toString(16)}` : '0x0',
      });
      setMsg(`Launching on Base... <a target="_blank" rel="noopener" href="https://basescan.org/tx/${esc(txHash)}">Basescan</a>`);
      const res = await waitTx(txHash, provider);
      if (res.ok === false) throw new Error('Launch transaction reverted.');

      let tokenAddr = predicted;
      for (const l of res.receipt?.logs || []) {
        if (l.address?.toLowerCase() !== LAUNCH_FACTORY_V3.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({ abi: LAUNCH_V3_ABI, data: l.data, topics: l.topics });
          if (decoded.eventName === 'Launched') { tokenAddr = decoded.args.token; break; }
        } catch { /* skip */ }
      }

      if (tokenAddr && account.toLowerCase() !== feeRecipient.toLowerCase()) {
        try {
          setMsg('Setting creator fee recipient...');
          const setData = encodeFunctionData({
            abi: LAUNCH_V3_ABI,
            functionName: 'setCreatorRecipient',
            args: [tokenAddr, feeRecipient],
          });
          const setHash = await sendTx(provider, { from: account, to: LAUNCH_FACTORY_V3, data: setData });
          await waitTx(setHash, provider);
        } catch { /* user skipped routing, launch still succeeded */ }
      }

      const caHtml = tokenAddr
        ? `<div class="lp-ca-row"><code class="lp-ca-val">${esc(tokenAddr)}</code><button type="button" class="lp-copy-ca" id="lp-copy-ca">Copy CA</button></div>`
        : '';
      setMsg(
        `<div class="lp-done-top"><b>${esc(symbol)}</b> launched. A new tower is rising in BaseCity. <a target="_blank" rel="noopener" href="https://basescan.org/tx/${esc(txHash)}">Tx</a>${tokenAddr ? ` · <a target="_blank" rel="noopener" href="https://basescan.org/token/${esc(tokenAddr)}">Token</a>` : ''}</div>${caHtml}`,
        'ok',
      );
      const copyBtn = $('#lp-copy-ca');
      if (copyBtn && tokenAddr) {
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(tokenAddr);
            copyBtn.textContent = 'Copied';
            setTimeout(() => (copyBtn.textContent = 'Copy CA'), 1800);
          } catch {
            copyBtn.textContent = tokenAddr;
          }
        };
      }
      if (tokenAddr) {
        saveLocalLaunch({ token: tokenAddr, creator: account, tx: txHash, block: Number(res.receipt?.blockNumber || 0), at: Date.now(), name, symbol, quoteSymbol: quote.symbol });
      }
      marketLoadedAt = 0;
      onLaunched?.({ name, symbol, quote: quote.symbol, token: tokenAddr || txHash, txHash });
    } catch (err) {
      if (!rejected(err)) setMsg(esc(err.message || 'Launch failed'), 'err');
      else setMsg('Transaction cancelled.', 'err');
    } finally {
      submitBtn.disabled = false;
    }
  };

  $('.td-x').onclick = () => (wrap.hidden = true);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) wrap.hidden = true; });
  $('#lp-fly').onclick = () => { wrap.hidden = true; onFlyTo?.(); };
  wrap.addEventListener('keydown', (e) => e.stopPropagation());

  renderQuoteControls();

  return {
    open(tab = 'launch') {
      wrap.hidden = false;
      window.dispatchEvent(new Event('eip6963:requestProvider'));
      if (!account) {
        restoreWallet().then((w) => {
          if (!w || account) return;
          provider = w.provider;
          account = w.address;
          walletName = w.name;
          connectBtn.textContent = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
          connectBtn.title = `${walletName}: ${w.address} (click to switch wallet)`;
          renderQuoteControls();
        });
      }
      probeQuotes([BLOCKY_QUOTE, ...BASE_CRYPTO_QUOTES]).then(renderQuoteControls);
      loadMeta();
      setMainTab(tab === 'market' ? 'market' : 'launch');
    },
    close() { wrap.hidden = true; },
    get isOpen() { return !wrap.hidden; },
  };
}
