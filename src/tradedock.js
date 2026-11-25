// BaseCity Trade Hub (Quadra-inspired 2-column Obsidian Dark trading interface):
// 1. Buy / Sell $BLOCKY: Direct in-city $BLOCKY swaps (USDC or ETH) via verified Relay routes — no jumping to external DEX links.
// 2. Stocks & Crypto: 2-column asset browser + live Buy/Sell execution ticket (Aerodrome Slipstream, Uniswap V3 & Relay).
// 3. Sector Baskets: 1-tx atomic multi-stock basket buys (All-Stars 10, AI & Chips, Big Tech, Crypto & Space).
import { formatUnits, parseUnits } from 'viem';
import { CONFIG } from './config.js';
import { esc } from './names.js';
import { colorOf } from './stocks.js';
import { browserWallets, smartWallet, connect, restoreWallet, rejected } from './wallet.js';
import { itemSprite } from './items.js';
import {
  BASE_USDC,
  BASE_WETH,
  BASE_NATIVE,
  fetchBaseStocks,
  quoteBaseSwap,
  quoteRelaySwap,
  executeUsdcSwap,
  executeTokenSwap,
  executeRelaySwap,
  executeBasketSwap,
  getWalletStockBalances,
  getTokenBalanceRaw,
  getNativeEthBalance,
} from './swap-base.js';

const BASESCAN_TX = ['https', '://basescan.org/tx/'].join('');
const BLOCKY_ADDR = CONFIG.tokenAddress || '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885';
const BASECITY_ADDR = CONFIG.flywheel?.basecityToken;

const CRYPTO_ASSETS = [
  { ticker: 'BLOCKY', symbol: '$BLOCKY', name: 'BaseCity Blocky Token', address: BLOCKY_ADDR, decimals: 18, kind: 'crypto' },
  { ticker: 'BASECITY', symbol: '$BASECITY', name: 'BaseCity Flywheel Token', address: BASECITY_ADDR, decimals: 18, kind: 'crypto' },
  { ticker: 'ETH', symbol: 'ETH', name: 'Ether on Base', address: BASE_NATIVE, decimals: 18, kind: 'crypto' },
  { ticker: 'WETH', symbol: 'WETH', name: 'Wrapped Ether', address: BASE_WETH, decimals: 18, kind: 'crypto' },
  { ticker: 'cbBTC', symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, kind: 'crypto' },
  { ticker: 'AERO', symbol: 'AERO', name: 'Aerodrome Finance', address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18, kind: 'crypto' },
  { ticker: 'VIRTUAL', symbol: 'VIRTUAL', name: 'Virtuals Protocol', address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', decimals: 18, kind: 'crypto' },
];

const SECTOR_BASKETS = [
  { id: 'allstars', label: 'All-Stars (10)', desc: 'Top 10 Coinbase tokenized stocks on Base, 10% each', tickers: (CONFIG.stocks?.blocky10 || ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'MSTR', 'SNDK', 'SPCX']).slice(0, 10) },
  { id: 'ai', label: 'AI & Chips', desc: 'Semiconductors & AI compute leaders on Base', tickers: ['NVDA', 'AMD', 'AVGO', 'TSM', 'MSFT', 'PLTR'] },
  { id: 'bigtech', label: 'Big Tech', desc: 'Mega-cap U.S. technology leaders on Base', tickers: ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META'] },
  { id: 'frontier', label: 'Crypto & Space', desc: 'Crypto equities, EV & frontier tech on Base', tickers: ['COIN', 'MSTR', 'TSLA', 'SNDK', 'SPCX'] },
];

export function blocky10() {
  const B = (CONFIG.stocks?.blocky10 || []).slice(0, 10);
  return B.map((t, i) => [t, Math.floor(100 / B.length) + (i === 0 ? 100 % B.length : 0)]);
}
export const blocky10Line = () => blocky10().map(([t, w]) => `${t} ${w}%`).join(', ');
const hex = (t) => `#${colorOf(t).toString(16).padStart(6, '0')}`;

let el = null;
let liveMap = new Map();
let provider = null;
let account = null;
let walletName = '';

let activeTab = 'trade'; // 'blocky' | 'trade' | 'basket'
let selectedSector = 'allstars';
let browserKind = 'stocks'; // 'stocks' | 'crypto'
let searchQuery = '';
let selectedAsset = { ticker: 'NVDA', symbol: 'NVDAc', name: 'NVIDIA Corporation', address: '0xb20000000000000000000078ee7ce2fe4908108c', decimals: 8, kind: 'stock', nav: null };
let tradeSide = 'buy'; // 'buy' | 'sell'
let counter = 'USDC'; // 'USDC' | 'ETH'
let blockySide = 'buy';
let blockyCounter = 'USDC';
let heldStocks = [];
let sellExactRaw = null;
let blockyExactRaw = null;
let blockyBal = { raw: 0n, balance: 0 };
let ethBal = { raw: 0n, balance: 0 };
let usdcBal = { raw: 0n, balance: 0 };

async function loadStocksMeta() {
  const rows = await fetchBaseStocks();
  for (const s of rows) {
    if (s.ticker && s.address) liveMap.set(s.ticker.toUpperCase(), { ...s, kind: 'stock' });
  }
  if (selectedAsset.kind === 'stock' && liveMap.has(selectedAsset.ticker)) {
    selectedAsset = liveMap.get(selectedAsset.ticker);
  }
}

function activeSectorItems() {
  const sec = SECTOR_BASKETS.find((s) => s.id === selectedSector) || SECTOR_BASKETS[0];
  const list = sec.tickers.filter((t) => liveMap.size <= 2 || liveMap.has(t));
  const finalList = list.length ? list : sec.tickers;
  const baseW = Math.floor(100 / finalList.length);
  const rem = 100 - baseW * finalList.length;
  return finalList.map((ticker, i) => ({
    ticker,
    weight: baseW + (i === 0 ? rem : 0),
    address: liveMap.get(ticker)?.address || '',
    nav: liveMap.get(ticker)?.nav ?? null,
  }));
}

function allBrowserRows() {
  if (browserKind === 'crypto') return CRYPTO_ASSETS;
  const core = [...new Set(SECTOR_BASKETS.flatMap((s) => s.tickers))];
  const rows = [...liveMap.values()];
  rows.sort((a, b) => {
    const ia = core.indexOf(a.ticker), ib = core.indexOf(b.ticker);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.ticker.localeCompare(b.ticker);
  });
  return rows;
}

function build() {
  el = document.createElement('div');
  el.className = 'td-wrap';
  el.hidden = true;
  el.innerHTML = `
    <div class="td b10-modal wide" role="dialog" aria-modal="true" aria-label="BaseCity Trade Hub">
      <div class="td-head">
        ${itemSprite('basket-chest', 38)}
        <div class="td-title">
          <b>BASECITY TRADE HUB</b>
          <span>Buy $BLOCKY, Stocks &amp; Crypto directly on Base · Self-Custody</span>
        </div>
        <button type="button" class="td-x" title="Close (Esc)">Close</button>
      </div>

      <div class="lp-seg" style="margin-top:12px" id="b10-tabs">
        <button type="button" class="lp-seg-btn" data-b10tab="blocky">Buy / Sell $BLOCKY</button>
        <button type="button" class="lp-seg-btn on" data-b10tab="trade">Stocks &amp; Crypto</button>
        <button type="button" class="lp-seg-btn" data-b10tab="basket">Sector Baskets</button>
      </div>

      <div id="b10-wbox" class="lp-wallet-box" style="margin-top:10px" hidden>
        <div class="lp-wallet-head"><span>Select Base Wallet</span><button type="button" id="b10-wclose" class="lp-mini-x">Close</button></div>
        <div id="b10-wlist" class="lp-wallet-list"></div>
      </div>

      <!-- TAB 1: BUY / SELL $BLOCKY (DIRECT IN-CITY SWAP) -->
      <form class="b10-swap" id="b10-blocky-form" hidden>
        <div class="th-blocky-hero">
          <div>
            <b>${esc(CONFIG.ticker || '$BLOCKY')} · BASECITY TOKEN</b>
            <span>Every $${CONFIG.usdPerBlocky || 10} unlocks a playable Blocky in Game Mode immediately (0 wait) · Hold 1h to claim tradable NFT.</span>
          </div>
          <div class="th-bal-pill" id="b10-blocky-bal">Wallet: —</div>
        </div>
        <div class="th-controls-row">
          <div class="lp-seg" id="b10-bk-side">
            <button type="button" class="lp-seg-btn on" data-bkside="buy">Buy $BLOCKY</button>
            <button type="button" class="lp-seg-btn" data-bkside="sell">Sell $BLOCKY</button>
          </div>
          <div class="lp-seg" id="b10-bk-counter">
            <button type="button" class="lp-seg-btn on" data-bkcnt="USDC">USDC</button>
            <button type="button" class="lp-seg-btn" data-bkcnt="ETH">ETH</button>
          </div>
        </div>
        <div class="b10-swap-head">
          <span class="lp-lbl" id="b10-bk-lbl">Pay Amount (USDC on Base)</span>
          <span class="b10-nav" id="b10-bk-est-blockies"></span>
        </div>
        <div class="b10-swap-row">
          <input id="b10-bk-amt" type="number" min="0.000001" step="any" value="10" placeholder="Amount" />
          <div class="b10-quicks" id="b10-bk-quicks"></div>
        </div>
        <div class="b10-quote" id="b10-bk-quote">Enter an amount to quote $BLOCKY live on Base.</div>
        <div class="td-actions">
          <button type="button" class="btn td-copy b10-conn-btn">Connect Wallet</button>
          <button type="submit" class="btn td-go" id="b10-bk-submit">Buy $BLOCKY</button>
        </div>
        <div id="b10-bk-msg" class="lp-msg" hidden></div>
      </form>

      <!-- TAB 2: QUADRA-STYLE 2-COLUMN STOCKS & CRYPTO TRADE -->
      <div id="b10-trade-view" class="th-grid">
        <div class="th-browser">
          <div class="th-bhead">
            <div class="lp-seg" id="b10-bkind">
              <button type="button" class="lp-seg-btn on" data-bkind="stocks">Stocks</button>
              <button type="button" class="lp-seg-btn" data-bkind="crypto">Crypto</button>
            </div>
            <input id="b10-search" class="th-search" type="search" placeholder="Search ticker or name..." />
          </div>
          <div class="th-list-head"><span>Asset</span><span>Price / NAV</span></div>
          <div class="th-list" id="b10-asset-list"></div>
        </div>

        <form class="b10-swap th-ticket" id="b10-form">
          <div class="th-pick-head">
            <div>
              <b id="b10-pick-title">NVDA — NVIDIA Corporation</b>
              <span id="b10-pick-sub">Coinbase Tokenized Stock on Base</span>
            </div>
            <span class="th-badge" id="b10-pick-tag">STOCK</span>
          </div>
          <div class="th-controls-row">
            <div class="lp-seg" id="b10-side-seg">
              <button type="button" class="lp-seg-btn on" data-side="buy">Buy</button>
              <button type="button" class="lp-seg-btn" data-side="sell">Sell</button>
            </div>
            <div class="lp-seg" id="b10-cnt-seg">
              <button type="button" class="lp-seg-btn on" data-cnt="USDC">USDC</button>
              <button type="button" class="lp-seg-btn" data-cnt="ETH">ETH</button>
            </div>
          </div>
          <div class="b10-swap-head">
            <span class="lp-lbl" id="b10-trade-lbl">Buy Amount (USDC on Base)</span>
            <span class="b10-nav" id="b10-nav"></span>
          </div>
          <div class="b10-swap-row">
            <input id="b10-amt" type="number" min="0.000001" step="any" value="10" placeholder="Amount" />
            <div class="b10-quicks" id="b10-trade-quicks"></div>
          </div>
          <div class="b10-quote" id="b10-quote">Select an asset and amount to quote live on Base.</div>
          <div class="td-actions">
            <button type="button" class="btn td-copy b10-conn-btn">Connect Wallet</button>
            <button type="submit" class="btn td-go" id="b10-buy">Buy NVDA</button>
          </div>
          <div id="b10-msg" class="lp-msg" hidden></div>
        </form>
      </div>

      <!-- TAB 3: SECTOR BASKETS (1-TX ATOMIC MULTICALL) -->
      <form class="b10-swap" id="b10-basket-form" hidden>
        <div class="b10-sec-pills" id="b10-sectors">
          ${SECTOR_BASKETS.map((s) => `<button type="button" class="b10-sec-pill${s.id === selectedSector ? ' on' : ''}" data-sec="${esc(s.id)}">${esc(s.label)}</button>`).join('')}
        </div>
        <div class="b10-sec-head">
          <div class="td-donut b10-mini-donut" id="b10-donut"><div><b id="b10-dcount">10</b><span>stocks</span></div></div>
          <div class="b10-sec-info">
            <b id="b10-sec-title">All-Stars (10)</b>
            <span id="b10-sec-desc">Top 10 Coinbase tokenized stocks on Base, 10% each</span>
            <small id="b10-basket-split" class="b10-nav">$1.00 / stock · 1 signature</small>
          </div>
        </div>
        <div class="b10-swap-row">
          <input id="b10-basket-amt" type="number" min="1" step="any" value="10" placeholder="Total USDC" />
          <div class="b10-quicks">
            <button type="button" data-bamt="10">$10</button>
            <button type="button" data-bamt="50">$50</button>
            <button type="button" data-bamt="100">$100</button>
          </div>
        </div>
        <div class="b10-basket-grid" id="b10-basket-grid"></div>
        <div class="td-actions">
          <button type="button" class="btn td-copy b10-conn-btn">Connect Wallet</button>
          <button type="submit" class="btn td-go" id="b10-basket-buy">Buy All-Stars Basket ($10)</button>
        </div>
        <div id="b10-basket-msg" class="lp-msg" hidden></div>
      </form>

      <div class="td-foot">Self-custody swaps routed via Relay, Aerodrome Slipstream &amp; Uniswap V3 on Base. Not financial advice; tokenized stocks are not offered in the U.S.</div>
    </div>`;
  document.body.appendChild(el);

  const $ = (s) => el.querySelector(s);
  const wbox = $('#b10-wbox');
  const wlist = $('#b10-wlist');
  const blockyForm = $('#b10-blocky-form');
  const bkBalEl = $('#b10-blocky-bal');
  const bkLblEl = $('#b10-bk-lbl');
  const bkEstBlockiesEl = $('#b10-bk-est-blockies');
  const bkAmtEl = $('#b10-bk-amt');
  const bkQuicksEl = $('#b10-bk-quicks');
  const bkQuoteEl = $('#b10-bk-quote');
  const bkSubmitBtn = $('#b10-bk-submit');
  const bkMsgEl = $('#b10-bk-msg');

  const tradeView = $('#b10-trade-view');
  const searchEl = $('#b10-search');
  const assetListEl = $('#b10-asset-list');
  const pickTitleEl = $('#b10-pick-title');
  const pickSubEl = $('#b10-pick-sub');
  const pickTagEl = $('#b10-pick-tag');
  const amtEl = $('#b10-amt');
  const navEl = $('#b10-nav');
  const tradeLbl = $('#b10-trade-lbl');
  const tradeQuicks = $('#b10-trade-quicks');
  const quoteEl = $('#b10-quote');
  const buyBtn = $('#b10-buy');
  const msgEl = $('#b10-msg');
  const singleForm = $('#b10-form');

  const basketForm = $('#b10-basket-form');
  const basketAmtEl = $('#b10-basket-amt');
  const basketSplitEl = $('#b10-basket-split');
  const basketGridEl = $('#b10-basket-grid');
  const basketBuyBtn = $('#b10-basket-buy');
  const basketMsgEl = $('#b10-basket-msg');
  const donutEl = $('#b10-donut');
  const dcountEl = $('#b10-dcount');
  const secTitleEl = $('#b10-sec-title');
  const secDescEl = $('#b10-sec-desc');

  let quoteTimer = null;
  let bkQuoteTimer = null;
  let basketSteps = {};

  function setMsg(target, html, tone = 'info') {
    target.hidden = false;
    target.className = `lp-msg ${tone}`;
    target.innerHTML = html;
  }

  function syncWalletBtns() {
    el.querySelectorAll('.b10-conn-btn').forEach((btn) => {
      btn.textContent = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Connect Wallet';
      btn.title = account ? `${walletName}: ${account}` : 'Connect wallet on Base';
    });
  }

  async function refreshWalletBalances() {
    if (!account) {
      heldStocks = [];
      blockyBal = { raw: 0n, balance: 0 };
      ethBal = { raw: 0n, balance: 0 };
      usdcBal = { raw: 0n, balance: 0 };
      renderBlockyTab();
      return;
    }
    const [stocks, bk, eth, usdc] = await Promise.all([
      getWalletStockBalances([...liveMap.values()], account),
      getTokenBalanceRaw(BLOCKY_ADDR, account, 18),
      getNativeEthBalance(account),
      getTokenBalanceRaw(BASE_USDC, account, 6),
    ]);
    heldStocks = stocks;
    blockyBal = bk;
    ethBal = eth;
    usdcBal = usdc;
    renderBlockyTab();
    if (activeTab === 'trade') renderTradeTicket();
  }

  // ---------- TAB 1: BUY / SELL $BLOCKY ----------
  function renderBlockyTab() {
    el.querySelectorAll('[data-bkside]').forEach((b) => b.classList.toggle('on', b.dataset.bkside === blockySide));
    el.querySelectorAll('[data-bkcnt]').forEach((b) => b.classList.toggle('on', b.dataset.bkcnt === blockyCounter));
    bkBalEl.textContent = account
      ? `${blockyBal.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} $BLOCKY · $${usdcBal.balance.toFixed(2)} USDC`
      : 'Connect wallet to view balances';
    bkSubmitBtn.textContent = blockySide === 'buy' ? `Buy $BLOCKY with ${blockyCounter}` : `Sell $BLOCKY for ${blockyCounter}`;

    if (blockySide === 'buy') {
      bkLblEl.textContent = blockyCounter === 'USDC'
        ? `Pay Amount (USDC · Bal: $${usdcBal.balance.toFixed(2)})`
        : `Pay Amount (ETH · Bal: ${ethBal.balance.toFixed(4)} ETH)`;
      bkQuicksEl.innerHTML = blockyCounter === 'USDC'
        ? '<button type="button" data-bkq="10">$10</button><button type="button" data-bkq="50">$50</button><button type="button" data-bkq="100">$100</button>'
        : '<button type="button" data-bkq="0.005">0.005</button><button type="button" data-bkq="0.02">0.02</button><button type="button" data-bkq="0.05">0.05</button>';
      bkQuicksEl.querySelectorAll('[data-bkq]').forEach((b) => {
        b.onclick = () => { blockyExactRaw = null; bkAmtEl.value = b.dataset.bkq; scheduleBlockyQuote(); };
      });
    } else {
      bkLblEl.textContent = `Sell $BLOCKY (Wallet: ${blockyBal.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })})`;
      bkQuicksEl.innerHTML = '<button type="button" data-bkp="0.25">25%</button><button type="button" data-bkp="0.5">50%</button><button type="button" data-bkp="1">MAX</button>';
      bkQuicksEl.querySelectorAll('[data-bkp]').forEach((b) => {
        b.onclick = () => {
          if (blockyBal.raw <= 0n) return;
          const pct = Number(b.dataset.bkp);
          blockyExactRaw = pct === 1 ? blockyBal.raw : (blockyBal.raw * BigInt(Math.round(pct * 100))) / 100n;
          bkAmtEl.value = formatUnits(blockyExactRaw, 18);
          scheduleBlockyQuote();
        };
      });
    }
    const amtNum = Number(bkAmtEl.value) || 0;
    if (blockySide === 'buy' && blockyCounter === 'USDC' && amtNum > 0) {
      const earned = Math.floor(amtNum / (CONFIG.usdPerBlocky || 10));
      bkEstBlockiesEl.textContent = earned > 0 ? `+${earned} Blocky builder${earned === 1 ? '' : 's'}` : `Need $${CONFIG.usdPerBlocky || 10} for 1 Blocky`;
    } else {
      bkEstBlockiesEl.textContent = '';
    }
  }

  function scheduleBlockyQuote() {
    clearTimeout(bkQuoteTimer);
    bkQuoteTimer = setTimeout(refreshBlockyQuote, 240);
  }

  async function refreshBlockyQuote() {
    const amt = Number(bkAmtEl.value);
    if (!Number.isFinite(amt) || amt <= 0) {
      bkQuoteEl.textContent = 'Enter an amount to quote $BLOCKY on Base.';
      return;
    }
    const counterAddr = blockyCounter === 'ETH' ? BASE_NATIVE : BASE_USDC;
    const counterDec = blockyCounter === 'ETH' ? 18 : 6;
    const tokenIn = blockySide === 'buy' ? counterAddr : BLOCKY_ADDR;
    const tokenOut = blockySide === 'buy' ? BLOCKY_ADDR : counterAddr;
    const inDec = blockySide === 'buy' ? counterDec : 18;
    const outDec = blockySide === 'buy' ? 18 : counterDec;
    const outSym = blockySide === 'buy' ? '$BLOCKY' : blockyCounter;
    bkQuoteEl.textContent = `Quoting ${amt} ${blockySide === 'buy' ? blockyCounter : '$BLOCKY'} -> ${outSym} via Relay...`;
    try {
      const units = blockySide === 'sell' && blockyExactRaw != null ? blockyExactRaw : parseUnits(String(amt), inDec);
      const q = await quoteRelaySwap({ user: account, tokenIn, tokenOut, amountInUnits: units });
      const outHuman = Number(formatUnits(BigInt(q.amountOut || '0'), outDec));
      const impactTxt = q.impact ? ` · impact ${q.impact}%` : '';
      bkQuoteEl.textContent = `Est. receive: ${outHuman.toLocaleString('en-US', { maximumFractionDigits: outDec === 6 ? 2 : 4 })} ${outSym}${impactTxt}`;
    } catch (e) {
      bkQuoteEl.textContent = `Quote unavailable: ${e?.message || 'no route right now'}`;
    }
  }

  // ---------- TAB 2: QUADRA-STYLE 2-COLUMN STOCKS & CRYPTO ----------
  function renderAssetBrowser() {
    el.querySelectorAll('[data-bkind]').forEach((b) => b.classList.toggle('on', b.dataset.bkind === browserKind));
    const q = searchQuery.trim().toLowerCase();
    const rows = allBrowserRows().filter((r) => !q || r.ticker.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
    assetListEl.innerHTML = rows.length
      ? rows.map((r) => {
          const active = r.ticker === selectedAsset.ticker && r.kind === selectedAsset.kind;
          const held = heldStocks.find((h) => h.ticker === r.ticker);
          const right = r.nav != null ? `$${Number(r.nav).toFixed(2)}` : held ? `${held.balance.toFixed(3)}` : r.kind === 'crypto' ? 'BASE' : '—';
          return `<button type="button" class="th-row${active ? ' on' : ''}" data-pick="${esc(r.ticker)}" data-pkind="${esc(r.kind)}">
            <span class="th-sym"><b>${esc(r.ticker)}</b><small>${esc(r.name)}</small></span>
            <span class="th-px">${esc(right)}</span>
          </button>`;
        }).join('')
      : '<p class="lp-desc" style="padding:10px">No matching assets on Base.</p>';
  }

  function renderTradeTicket() {
    const a = selectedAsset;
    if (a.address === BASE_NATIVE && counter === 'ETH') counter = 'USDC';
    el.querySelectorAll('[data-side]').forEach((b) => b.classList.toggle('on', b.dataset.side === tradeSide));
    el.querySelectorAll('[data-cnt]').forEach((b) => {
      b.classList.toggle('on', b.dataset.cnt === counter);
      b.disabled = a.address === BASE_NATIVE && b.dataset.cnt === 'ETH';
    });

    pickTitleEl.textContent = `${a.ticker} — ${a.name}`;
    pickSubEl.textContent = a.kind === 'stock' ? 'Coinbase Tokenized Stock on Base (8 dec)' : 'Base Mainnet Token · Live Relay Quote';
    pickTagEl.textContent = a.kind === 'stock' ? 'STOCK' : 'CRYPTO';
    navEl.textContent = a.nav != null ? `NAV $${Number(a.nav).toFixed(2)}` : '';
    buyBtn.textContent = tradeSide === 'buy' ? `Buy ${a.ticker} (${counter})` : `Sell ${a.ticker} -> ${counter}`;

    if (tradeSide === 'buy') {
      tradeLbl.textContent = counter === 'USDC'
        ? `Buy Amount (USDC · Bal: $${usdcBal.balance.toFixed(2)})`
        : `Buy Amount (ETH · Bal: ${ethBal.balance.toFixed(4)} ETH)`;
      tradeQuicks.innerHTML = counter === 'USDC'
        ? '<button type="button" data-qamt="10">$10</button><button type="button" data-qamt="25">$25</button><button type="button" data-qamt="100">$100</button>'
        : '<button type="button" data-qamt="0.005">0.005</button><button type="button" data-qamt="0.02">0.02</button><button type="button" data-qamt="0.05">0.05</button>';
      tradeQuicks.querySelectorAll('[data-qamt]').forEach((b) => {
        b.onclick = () => { sellExactRaw = null; amtEl.value = b.dataset.qamt; scheduleTradeQuote(); };
      });
    } else {
      const held = heldStocks.find((h) => h.ticker === a.ticker);
      tradeLbl.textContent = held
        ? `Sell ${a.ticker} (Wallet: ${held.balance.toFixed(6)})`
        : `Sell ${a.ticker} (Wallet balance checked on submit)`;
      tradeQuicks.innerHTML = '<button type="button" data-pct="0.25">25%</button><button type="button" data-pct="0.5">50%</button><button type="button" data-pct="1">MAX</button>';
      tradeQuicks.querySelectorAll('[data-pct]').forEach((b) => {
        b.onclick = async () => {
          if (!account) return;
          const pct = Number(b.dataset.pct);
          const balObj = a.address === BASE_NATIVE
            ? await getNativeEthBalance(account)
            : await getTokenBalanceRaw(a.address, account, a.decimals || 8);
          if (!balObj.raw || balObj.raw <= 0n) return;
          const dec = a.decimals || 8;
          sellExactRaw = pct === 1 ? balObj.raw : (balObj.raw * BigInt(Math.round(pct * 100))) / 100n;
          amtEl.value = formatUnits(sellExactRaw, dec);
          scheduleTradeQuote();
        };
      });
    }
  }

  function scheduleTradeQuote() {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(refreshTradeQuote, 220);
  }

  async function refreshTradeQuote() {
    const a = selectedAsset;
    const amt = Number(amtEl.value);
    if (!a?.address) { quoteEl.textContent = 'Select an asset on the left.'; return; }
    if (!Number.isFinite(amt) || amt <= 0) { quoteEl.textContent = 'Enter an amount to quote on Base.'; return; }
    const counterAddr = counter === 'ETH' ? BASE_NATIVE : BASE_USDC;
    const counterDec = counter === 'ETH' ? 18 : 6;
    const dec = a.decimals || 8;
    const tokenIn = tradeSide === 'buy' ? counterAddr : a.address;
    const tokenOut = tradeSide === 'buy' ? a.address : counterAddr;
    const inDec = tradeSide === 'buy' ? counterDec : dec;
    const outDec = tradeSide === 'buy' ? dec : counterDec;
    const outSym = tradeSide === 'buy' ? a.ticker : counter;
    quoteEl.textContent = `Quoting ${amt} ${tradeSide === 'buy' ? counter : a.ticker} -> ${outSym} on Base...`;
    try {
      const units = tradeSide === 'sell' && sellExactRaw != null ? sellExactRaw : parseUnits(String(amt), inDec);
      const useOnchain = a.kind === 'stock' && counter === 'USDC';
      const q = useOnchain
        ? await quoteBaseSwap({ tokenIn, tokenOut, amountInUnits: units }).catch(() => quoteRelaySwap({ user: account, tokenIn, tokenOut, amountInUnits: units }))
        : await quoteRelaySwap({ user: account, tokenIn, tokenOut, amountInUnits: units });
      const outHuman = Number(formatUnits(BigInt(q.amountOut || '0'), outDec));
      const via = q.dex === 'aerodrome' ? 'Aerodrome' : q.dex === 'uniswapv3' ? 'Uniswap V3' : q.dex === 'relay' ? 'Relay' : 'Base DEX';
      quoteEl.textContent = `Est. receive: ${outHuman.toLocaleString('en-US', { maximumFractionDigits: outDec === 6 ? 2 : 4 })} ${outSym} · via ${via}`;
    } catch {
      quoteEl.textContent = `No Base liquidity route found for ${a.ticker}/${counter} right now.`;
    }
  }

  // ---------- TAB 3: SECTOR BASKETS ----------
  function renderBasketView() {
    const sec = SECTOR_BASKETS.find((s) => s.id === selectedSector) || SECTOR_BASKETS[0];
    const items = activeSectorItems();
    el.querySelectorAll('[data-sec]').forEach((b) => b.classList.toggle('on', b.dataset.sec === selectedSector));
    secTitleEl.textContent = sec.label;
    secDescEl.textContent = sec.desc;
    dcountEl.textContent = String(items.length);

    let at = 0;
    const ring = items.map((it) => { const s = `${hex(it.ticker)} ${at}% ${at + it.weight}%`; at += it.weight; return s; }).join(', ');
    donutEl.style.background = `conic-gradient(${ring})`;

    const total = Math.max(0, Number(basketAmtEl.value) || 0);
    const per = items.length ? total / items.length : 0;
    basketSplitEl.textContent = `$${per.toFixed(2)} / stock · 1 signature`;
    basketBuyBtn.textContent = `Buy ${sec.label.split(' ')[0]} Basket ($${total || 0})`;

    basketGridEl.innerHTML = items.map((it) => {
      const st = basketSteps[it.ticker] || (it.address ? 'ready' : 'loading');
      const badge = st === 'done' ? 'DONE' : st === 'active' ? 'SWAPPING' : st === 'fail' ? 'SKIPPED' : it.nav ? `$${Number(it.nav).toFixed(0)}` : `${it.weight}%`;
      return `<button type="button" class="b10-leg ${st}" data-legtick="${esc(it.ticker)}"><i style="background:${hex(it.ticker)}"></i><b>${esc(it.ticker)}</b><span>$${((total * it.weight) / 100).toFixed(2)}</span><small>${esc(badge)}</small></button>`;
    }).join('');
    basketGridEl.querySelectorAll('[data-legtick]').forEach((b) => {
      b.onclick = () => {
        const hit = liveMap.get(b.dataset.legtick);
        if (hit) selectedAsset = hit;
        browserKind = 'stocks';
        activeTab = 'trade';
        tradeSide = 'buy';
        renderTabs();
      };
    });
  }

  function renderTabs() {
    el.querySelectorAll('[data-b10tab]').forEach((b) => b.classList.toggle('on', b.dataset.b10tab === activeTab));
    blockyForm.hidden = activeTab !== 'blocky';
    tradeView.hidden = activeTab !== 'trade';
    basketForm.hidden = activeTab !== 'basket';
    if (activeTab === 'blocky') { renderBlockyTab(); refreshBlockyQuote(); }
    if (activeTab === 'trade') { renderAssetBrowser(); renderTradeTicket(); refreshTradeQuote(); }
    if (activeTab === 'basket') renderBasketView();
  }

  function renderWallets() {
    const list = browserWallets();
    wlist.innerHTML = `${list.map((w, i) => `<button type="button" class="lp-w-item" data-wi="${i}"><span>${esc(w.name)}</span><small>Browser</small></button>`).join('')}
      <button type="button" class="lp-w-item" data-ws="1"><span>Base / Coinbase Smart Wallet</span><small>Passkey / App</small></button>`;
    const targetMsg = () => (activeTab === 'blocky' ? bkMsgEl : activeTab === 'basket' ? basketMsgEl : msgEl);
    wlist.querySelectorAll('[data-wi]').forEach((b) => {
      b.onclick = async () => {
        const w = list[Number(b.dataset.wi)];
        if (!w) return;
        try {
          account = await connect(w.provider, w);
          provider = w.provider;
          walletName = w.name;
          wbox.hidden = true;
          syncWalletBtns();
          refreshWalletBalances();
          setMsg(targetMsg(), `Connected ${esc(walletName)}.`, 'ok');
        } catch (e) { if (!rejected(e)) setMsg(targetMsg(), esc(e.message || 'Connection failed'), 'err'); }
      };
    });
    wlist.querySelector('[data-ws]')?.addEventListener('click', async () => {
      try {
        const p = await smartWallet(CONFIG.cityName || 'BaseCity', `${location.origin}/favicon.svg`);
        account = await connect(p, { name: 'Smart Wallet' });
        provider = p;
        walletName = 'Smart Wallet';
        wbox.hidden = true;
        syncWalletBtns();
        refreshWalletBalances();
        setMsg(targetMsg(), 'Connected Smart Wallet.', 'ok');
      } catch (e) { if (!rejected(e)) setMsg(targetMsg(), esc(e.message || 'Connection failed'), 'err'); }
    });
  }

  // ---------- EVENTS ----------
  $('#b10-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-b10tab]')?.dataset.b10tab;
    if (!tab) return;
    activeTab = tab;
    renderTabs();
  });

  $('#b10-bk-side').addEventListener('click', (e) => {
    const s = e.target.closest('[data-bkside]')?.dataset.bkside;
    if (!s || s === blockySide) return;
    blockySide = s;
    blockyExactRaw = null;
    bkAmtEl.value = blockySide === 'buy' ? (blockyCounter === 'USDC' ? '10' : '0.01') : '';
    renderBlockyTab();
    scheduleBlockyQuote();
  });

  $('#b10-bk-counter').addEventListener('click', (e) => {
    const c = e.target.closest('[data-bkcnt]')?.dataset.bkcnt;
    if (!c || c === blockyCounter) return;
    blockyCounter = c;
    if (blockySide === 'buy') bkAmtEl.value = blockyCounter === 'USDC' ? '10' : '0.01';
    renderBlockyTab();
    scheduleBlockyQuote();
  });

  bkAmtEl.oninput = () => { blockyExactRaw = null; renderBlockyTab(); scheduleBlockyQuote(); };

  $('#b10-bkind').addEventListener('click', (e) => {
    const k = e.target.closest('[data-bkind]')?.dataset.bkind;
    if (!k || k === browserKind) return;
    browserKind = k;
    searchQuery = '';
    searchEl.value = '';
    const rows = allBrowserRows();
    if (rows.length) selectedAsset = rows[0];
    renderAssetBrowser();
    renderTradeTicket();
    scheduleTradeQuote();
  });

  searchEl.oninput = () => { searchQuery = searchEl.value; renderAssetBrowser(); };

  assetListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pick]');
    if (!btn) return;
    const t = btn.dataset.pick;
    const k = btn.dataset.pkind;
    const hit = k === 'crypto' ? CRYPTO_ASSETS.find((x) => x.ticker === t) : liveMap.get(t);
    if (!hit) return;
    selectedAsset = hit;
    sellExactRaw = null;
    renderAssetBrowser();
    renderTradeTicket();
    scheduleTradeQuote();
  });

  $('#b10-side-seg').addEventListener('click', (e) => {
    const side = e.target.closest('[data-side]')?.dataset.side;
    if (!side || side === tradeSide) return;
    tradeSide = side;
    sellExactRaw = null;
    amtEl.value = tradeSide === 'buy' ? (counter === 'USDC' ? '10' : '0.01') : '';
    renderTradeTicket();
    scheduleTradeQuote();
  });

  $('#b10-cnt-seg').addEventListener('click', (e) => {
    const c = e.target.closest('[data-cnt]')?.dataset.cnt;
    if (!c || c === counter) return;
    counter = c;
    if (tradeSide === 'buy') amtEl.value = counter === 'USDC' ? '10' : '0.01';
    renderTradeTicket();
    scheduleTradeQuote();
  });

  amtEl.oninput = () => { sellExactRaw = null; scheduleTradeQuote(); };

  $('#b10-sectors').addEventListener('click', (e) => {
    const sec = e.target.closest('[data-sec]')?.dataset.sec;
    if (!sec) return;
    selectedSector = sec;
    basketSteps = {};
    renderBasketView();
  });
  basketAmtEl.oninput = renderBasketView;
  el.querySelectorAll('[data-bamt]').forEach((b) => {
    b.onclick = () => { basketAmtEl.value = b.dataset.bamt; renderBasketView(); };
  });

  el.querySelectorAll('.b10-conn-btn').forEach((btn) => {
    btn.onclick = () => { wbox.hidden = !wbox.hidden; if (!wbox.hidden) renderWallets(); };
  });
  $('#b10-wclose').onclick = () => { wbox.hidden = true; };

  // Submit: Buy / Sell $BLOCKY
  blockyForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!provider || !account) { wbox.hidden = false; renderWallets(); return setMsg(bkMsgEl, 'Connect a Base wallet first.', 'err'); }
    const amtStr = bkAmtEl.value.trim();
    const amt = Number(amtStr);
    if (!Number.isFinite(amt) || amt <= 0) return setMsg(bkMsgEl, 'Enter a positive amount.', 'err');
    const counterAddr = blockyCounter === 'ETH' ? BASE_NATIVE : BASE_USDC;
    const counterDec = blockyCounter === 'ETH' ? 18 : 6;
    const tokenIn = blockySide === 'buy' ? counterAddr : BLOCKY_ADDR;
    const tokenOut = blockySide === 'buy' ? BLOCKY_ADDR : counterAddr;
    const inDec = blockySide === 'buy' ? counterDec : 18;
    const units = blockySide === 'sell' && blockyExactRaw != null ? blockyExactRaw : parseUnits(amtStr, inDec);
    bkSubmitBtn.disabled = true;
    try {
      const res = await executeRelaySwap({
        provider, account, tokenIn, tokenOut, amountInUnits: units,
        onStatus: (txt) => setMsg(bkMsgEl, esc(txt)),
      });
      blockyExactRaw = null;
      const buyNote = blockySide === 'buy' ? ' Playable Blocky unlocked in Game Mode immediately (0 wait; hold 1h to claim NFT on /claim).' : '';
      setMsg(
        bkMsgEl,
        res.batched
          ? `${blockySide === 'buy' ? 'Bought' : 'Sold'} <b>$BLOCKY</b> on Base!${buyNote}`
          : `${blockySide === 'buy' ? 'Bought' : 'Sold'} <b>$BLOCKY</b> on Base.${buyNote} <a target="_blank" rel="noopener" href="${BASESCAN_TX}${esc(res.txHash)}">View on Basescan</a>`,
        'ok',
      );
      if (blockySide === 'buy') {
        window.dispatchEvent(new CustomEvent('basecity:blocky-bought', {
          detail: { account, provider, amount: amt, counter: blockyCounter, txHash: res.txHash || '' },
        }));
      }
      refreshWalletBalances();
    } catch (err) {
      if (!rejected(err)) setMsg(bkMsgEl, esc(err.shortMessage || err.message || 'Swap failed'), 'err');
      else setMsg(bkMsgEl, 'Swap cancelled.', 'err');
    } finally {
      bkSubmitBtn.disabled = false;
    }
  };

  // Submit: Stocks & Crypto Trade
  singleForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!provider || !account) { wbox.hidden = false; renderWallets(); return setMsg(msgEl, 'Connect a Base wallet first.', 'err'); }
    const a = selectedAsset;
    if (!a?.address) return setMsg(msgEl, 'Select an asset first.', 'err');
    const amtStr = amtEl.value.trim();
    const amt = Number(amtStr);
    if (!Number.isFinite(amt) || amt <= 0) return setMsg(msgEl, 'Enter a positive amount.', 'err');
    buyBtn.disabled = true;
    try {
      let res;
      if (a.kind === 'stock' && counter === 'USDC') {
        if (tradeSide === 'buy') {
          res = await executeUsdcSwap({ provider, account, tokenOut: a.address, usdcAmount: amtStr, onStatus: (txt) => setMsg(msgEl, esc(txt)) });
          fetch(`/api/stocks?go=b10&ticker=${encodeURIComponent(a.ticker)}`).catch(() => {});
        } else {
          res = await executeTokenSwap({
            provider, account, tokenIn: a.address, tokenInDecimals: a.decimals || 8, tokenOut: BASE_USDC,
            amount: amtStr, rawUnits: sellExactRaw, onStatus: (txt) => setMsg(msgEl, esc(txt)),
          });
        }
      } else {
        const counterAddr = counter === 'ETH' ? BASE_NATIVE : BASE_USDC;
        const counterDec = counter === 'ETH' ? 18 : 6;
        const dec = a.decimals || 8;
        const tokenIn = tradeSide === 'buy' ? counterAddr : a.address;
        const tokenOut = tradeSide === 'buy' ? a.address : counterAddr;
        const inDec = tradeSide === 'buy' ? counterDec : dec;
        const units = tradeSide === 'sell' && sellExactRaw != null ? sellExactRaw : parseUnits(amtStr, inDec);
        res = await executeRelaySwap({ provider, account, tokenIn, tokenOut, amountInUnits: units, onStatus: (txt) => setMsg(msgEl, esc(txt)) });
      }
      sellExactRaw = null;
      setMsg(
        msgEl,
        res.batched
          ? `${tradeSide === 'buy' ? 'Bought' : 'Sold'} <b>${esc(a.ticker)}</b> on Base.`
          : `${tradeSide === 'buy' ? 'Bought' : 'Sold'} <b>${esc(a.ticker)}</b> on Base. <a target="_blank" rel="noopener" href="${BASESCAN_TX}${esc(res.txHash)}">View on Basescan</a>`,
        'ok',
      );
      refreshWalletBalances();
    } catch (err) {
      if (!rejected(err)) setMsg(msgEl, esc(err.shortMessage || err.message || 'Swap failed'), 'err');
      else setMsg(msgEl, 'Swap cancelled.', 'err');
    } finally {
      buyBtn.disabled = false;
    }
  };

  // Submit: Sector Baskets
  basketForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!provider || !account) { wbox.hidden = false; renderWallets(); return setMsg(basketMsgEl, 'Connect a Base wallet first.', 'err'); }
    const total = Number(basketAmtEl.value);
    if (!Number.isFinite(total) || total < 1) return setMsg(basketMsgEl, 'Enter at least $1 USDC for the basket.', 'err');
    basketBuyBtn.disabled = true;
    basketSteps = {};
    renderBasketView();
    try {
      const items = activeSectorItems();
      const res = await executeBasketSwap({
        provider, account, items, totalUsdc: total,
        onStatus: (txt) => setMsg(basketMsgEl, esc(txt)),
        onStep: (ticker, st) => { basketSteps[ticker] = st; renderBasketView(); },
      });
      fetch(`/api/stocks?go=b10-basket&sector=${encodeURIComponent(selectedSector)}&count=${res.count}`).catch(() => {});
      const lastTx = res.txHashes?.[res.txHashes.length - 1]?.txHash;
      setMsg(
        basketMsgEl,
        res.batched
          ? `Bought <b>${res.count} stocks ($${total} USDC)</b> in 1 atomic Base batch!`
          : `Bought <b>${res.count} stocks</b> in 1 multicall tx.${lastTx ? ` <a target="_blank" rel="noopener" href="${BASESCAN_TX}${esc(lastTx)}">View on Basescan</a>` : ''}`,
        'ok',
      );
      refreshWalletBalances();
    } catch (err) {
      if (!rejected(err)) setMsg(basketMsgEl, esc(err.shortMessage || err.message || 'Basket swap failed'), 'err');
      else setMsg(basketMsgEl, 'Basket swap cancelled.', 'err');
    } finally {
      basketBuyBtn.disabled = false;
    }
  };

  $('.td-x').onclick = closeBlocky10;
  el.addEventListener('click', (e) => { if (e.target === el) closeBlocky10(); });
  el.addEventListener('keydown', (e) => e.stopPropagation());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) { e.preventDefault(); e.stopPropagation(); closeBlocky10(); } });

  el._refresh = () => {
    syncWalletBtns();
    loadStocksMeta().then(() => {
      renderTabs();
      refreshWalletBalances();
    });
  };
}

export function openBlocky10(initialTab = '', initialTicker = '') {
  if (!el) build();
  if (initialTab && ['blocky', 'trade', 'basket'].includes(initialTab)) activeTab = initialTab;
  if (initialTicker) {
    const up = initialTicker.toUpperCase();
    const hit = liveMap.get(up) || CRYPTO_ASSETS.find((x) => x.ticker.toUpperCase() === up);
    if (hit) {
      selectedAsset = hit;
      browserKind = hit.kind === 'crypto' ? 'crypto' : 'stocks';
    }
  }
  el.hidden = false;
  if (!account) {
    restoreWallet().then((w) => {
      if (!w || account) return;
      provider = w.provider;
      account = w.address;
      walletName = w.name;
      el._refresh?.();
    });
  }
  el._refresh?.();
}

export function closeBlocky10() {
  if (el) el.hidden = true;
}
