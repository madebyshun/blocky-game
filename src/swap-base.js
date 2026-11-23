// In-app non-custodial token swap on Base Mainnet.
// Primary: KyberSwap Public Aggregator API.
// Zero-API Dual-DEX Onchain Engine: Direct Aerodrome Slipstream (primary Base liquidity for Coinbase tokenized stocks)
// + Uniswap V3 QuoterV2/SwapRouter02 on Base Mainnet (zero API keys, zero CORS, zero Cloudflare).
// Single-tx multi-stock baskets via SwapRouter.multicall(bytes[]) for EOAs and EIP-5792 wallet_sendCalls for Smart Wallets.
import { createPublicClient, fallback, http, encodeFunctionData, encodePacked, erc20Abi, parseAbi, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { toBase, sendTx, waitTx, rejected } from './wallet.js';
import { withBuilderCode } from './attribution.js';

export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_WETH = '0x4200000000000000000000000000000000000006';
export const BASE_NATIVE = '0x0000000000000000000000000000000000000000';
export const KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';
const RELAY_PAIRS = [
  { approvalProxy: '0xccc88a9d1b4ed6b0eaba998850414b24f1c315be', router: '0xb92fe925dc43a0ecde6c8b1a2709c170ec4fff4f' },
  { approvalProxy: '0x5567954cd026cebfe486062cb75848e0f1c12e58', router: '0x0729e2a4716d9f7dd17858d5d504426d228697f7' },
];
const SIM_USER = '0x000000000000000000000000000000000000dEaD';
// Canonical Aerodrome Slipstream Base Mainnet deployments (basescan.org)
export const AERO_SLIPSTREAM_QUOTER = '0x254cf9e1e6e233aa1ac962cb9b05b2cfeaae15b0';
export const AERO_SLIPSTREAM_ROUTER = '0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5';
// Canonical Uniswap V3 Base Mainnet deployments (developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments)
export const UNISWAP_V3_QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
export const UNISWAP_V3_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';

const KYBER_BASE = 'https://aggregator-api.kyberswap.com/base/api/v1';
const CLIENT_ID = 'BaseCity';

const AERO_QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, int24 tickSpacing, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
]);

const AERO_ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, int24 tickSpacing, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)',
  'function multicall(bytes[] data) external payable returns (bytes[] results)',
]);

const UNI_QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
  'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)',
]);

const UNI_ROUTER02_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)',
  'function multicall(bytes[] data) external payable returns (bytes[] results)',
]);

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://mainnet.base.org'),
    http('https://base-rpc.publicnode.com'),
    http('https://base.publicnode.com'),
  ]),
});

const COINBASE_STOCKS_API = 'https://api.coinbase.com/v1/tokenized-stocks';
const STOCKS_STORE_KEY = 'basecity:stocks:v1';
const SEEDED_STOCKS = [
  { symbol: 'NVDAc', ticker: 'NVDA', name: 'NVIDIA Corporation', address: '0xb20000000000000000000078ee7ce2fe4908108c', decimals: 8, nav: null },
  { symbol: 'TSLAc', ticker: 'TSLA', name: 'Tesla Inc.', address: '0xb2000000000000000000001e800a7f5189430cd0', decimals: 8, nav: null },
];
let stocksCache = null;

function sanitizeAmount(v) {
  return String(v ?? '').trim().replace(',', '.').replace(/[^0-9.]/g, '');
}

function normalizeStockRows(rows) {
  const out = [];
  for (const t of rows || []) {
    const symbol = String(t?.symbol || '');
    const ticker = String(t?.ticker || symbol.replace(/c$/, '')).toUpperCase();
    const address = String(t?.address || t?.contract_address || '').toLowerCase();
    if (!ticker || !/^0x[0-9a-f]{40}$/.test(address)) continue;
    const paused = Array.isArray(t?.paused) ? t.paused : Array.isArray(t?.paused_features) ? t.paused_features : [];
    if (paused.includes(0)) continue;
    out.push({
      symbol: symbol || `${ticker}c`,
      ticker,
      name: String(t?.name || symbol || ticker),
      address,
      decimals: Number.isInteger(Number(t?.decimals)) ? Number(t.decimals) : 8,
      nav: t?.nav != null ? Number(t.nav) : t?.nav_price != null ? Number(t.nav_price) : null,
    });
  }
  return out;
}

function mergeWithSeeded(rows) {
  const byTicker = new Map(SEEDED_STOCKS.map((s) => [s.ticker, { ...s }]));
  for (const r of rows || []) byTicker.set(r.ticker, r);
  return [...byTicker.values()];
}

export async function fetchBaseStocks() {
  if (stocksCache?.length > 2) return stocksCache;
  try {
    const cached = JSON.parse(localStorage.getItem(STOCKS_STORE_KEY) || 'null');
    if (cached?.rows?.length && Date.now() - (cached.at || 0) < 3600e3) {
      stocksCache = mergeWithSeeded(cached.rows);
      return stocksCache;
    }
  } catch { /* ignore */ }
  try {
    const r = await fetch('/cb-stocks', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const j = await r.json();
      const rows = normalizeStockRows(j.tokens || j.stocks);
      if (rows.length) {
        stocksCache = mergeWithSeeded(rows);
        try { localStorage.setItem(STOCKS_STORE_KEY, JSON.stringify({ at: Date.now(), rows })); } catch { /* ignore */ }
        return stocksCache;
      }
    }
  } catch { /* fall through */ }
  try {
    const r = await fetch('/api/stocks?list=1', { signal: AbortSignal.timeout(15000) });
    if (r.ok) {
      const j = await r.json();
      const rows = normalizeStockRows(j.stocks);
      if (rows.length) {
        stocksCache = mergeWithSeeded(rows);
        try { localStorage.setItem(STOCKS_STORE_KEY, JSON.stringify({ at: Date.now(), rows })); } catch { /* ignore */ }
        return stocksCache;
      }
    }
  } catch { /* fall through */ }
  try {
    const r = await fetch(`${COINBASE_STOCKS_API}?page_size=500`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const j = await r.json();
      const rows = normalizeStockRows(j.tokens);
      if (rows.length) {
        stocksCache = mergeWithSeeded(rows);
        try { localStorage.setItem(STOCKS_STORE_KEY, JSON.stringify({ at: Date.now(), rows })); } catch { /* ignore */ }
        return stocksCache;
      }
    }
  } catch { /* fall through */ }
  return SEEDED_STOCKS;
}

async function fetchJsonTry(urls, init = {}) {
  let lastErr = null;
  for (const url of urls) {
    try {
      const headers = { ...(init.headers || {}) };
      if (/^https?:\/\//.test(url)) delete headers['x-client-id'];
      const r = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(6000) });
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;
      const j = await r.json().catch(() => null);
      if (j && typeof j === 'object') return { ok: r.ok, status: r.status, json: j };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Aggregator unreachable');
}

// Direct onchain Aerodrome Slipstream quote on Base Mainnet (primary liquidity hub for Coinbase tokenized stocks)
async function quoteAerodromeOnchain({ tokenIn, tokenOut, amountInUnits }) {
  const amt = BigInt(amountInUnits);
  const tickSpacings = [1, 10, 50, 100, 200, 2000];
  const singleCalls = tickSpacings.map((tickSpacing) =>
    client.simulateContract({
      address: AERO_SLIPSTREAM_QUOTER,
      abi: AERO_QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{ tokenIn, tokenOut, amountIn: amt, tickSpacing, sqrtPriceLimitX96: 0n }],
    }).then((r) => ({ dex: 'aerodrome', kind: 'single', tickSpacing, amountOut: r.result[0] })).catch(() => null),
  );
  const hopPaths = [
    [100, 100],
    [100, 50],
    [50, 100],
    [100, 200],
    [200, 100],
  ].map(([ts1, ts2]) => {
    const path = encodePacked(['address', 'int24', 'address', 'int24', 'address'], [tokenIn, ts1, BASE_WETH, ts2, tokenOut]);
    return client.simulateContract({
      address: AERO_SLIPSTREAM_QUOTER,
      abi: AERO_QUOTER_ABI,
      functionName: 'quoteExactInput',
      args: [path, amt],
    }).then((r) => ({ dex: 'aerodrome', kind: 'multi', path, amountOut: r.result[0] })).catch(() => null);
  });

  const results = (await Promise.all([...singleCalls, ...hopPaths])).filter((x) => x && x.amountOut > 0n);
  if (!results.length) return null;
  results.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
  const best = results[0];
  return {
    dex: 'aerodrome',
    tokenIn,
    tokenOut,
    amountInUnits: amt,
    route: best,
    routerAddress: AERO_SLIPSTREAM_ROUTER,
    amountOut: best.amountOut.toString(),
    amountOutUsd: 0,
    gasUsd: 0.01,
  };
}

// Direct onchain Uniswap V3 quote on Base Mainnet
async function quoteUniswapV3Onchain({ tokenIn, tokenOut, amountInUnits }) {
  const amt = BigInt(amountInUnits);
  const fees = [100, 500, 3000, 10000];
  const singleCalls = fees.map((fee) =>
    client.simulateContract({
      address: UNISWAP_V3_QUOTER,
      abi: UNI_QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{ tokenIn, tokenOut, amountIn: amt, fee, sqrtPriceLimitX96: 0n }],
    }).then((r) => ({ dex: 'uniswapv3', kind: 'single', fee, amountOut: r.result[0] })).catch(() => null),
  );
  const hopPaths = [
    [500, 500],
    [500, 3000],
    [100, 500],
    [500, 100],
  ].map(([f1, f2]) => {
    const path = encodePacked(['address', 'uint24', 'address', 'uint24', 'address'], [tokenIn, f1, BASE_WETH, f2, tokenOut]);
    return client.simulateContract({
      address: UNISWAP_V3_QUOTER,
      abi: UNI_QUOTER_ABI,
      functionName: 'quoteExactInput',
      args: [path, amt],
    }).then((r) => ({ dex: 'uniswapv3', kind: 'multi', path, amountOut: r.result[0] })).catch(() => null);
  });

  const results = (await Promise.all([...singleCalls, ...hopPaths])).filter((x) => x && x.amountOut > 0n);
  if (!results.length) return null;
  results.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
  const best = results[0];
  return {
    dex: 'uniswapv3',
    tokenIn,
    tokenOut,
    amountInUnits: amt,
    route: best,
    routerAddress: UNISWAP_V3_ROUTER,
    amountOut: best.amountOut.toString(),
    amountOutUsd: 0,
    gasUsd: 0.01,
  };
}

// Dual-DEX onchain quote: checks Aerodrome Slipstream AND Uniswap V3 in parallel and picks the best output.
async function quoteOnchainDexes({ tokenIn, tokenOut, amountInUnits, preferAerodrome = false }) {
  const [aero, uni] = await Promise.all([
    quoteAerodromeOnchain({ tokenIn, tokenOut, amountInUnits }),
    quoteUniswapV3Onchain({ tokenIn, tokenOut, amountInUnits }),
  ]);
  if (preferAerodrome && aero) return aero;
  if (aero && uni) {
    return BigInt(aero.amountOut) >= BigInt(uni.amountOut) ? aero : uni;
  }
  if (aero) return aero;
  if (uni) return uni;
  throw new Error('No Base pool liquidity found on Aerodrome Slipstream or Uniswap V3 for this pair.');
}

export async function quoteBaseSwap({ tokenIn = BASE_USDC, tokenOut, amountInUnits, preferAerodrome = false }) {
  if (!tokenOut) throw new Error('Missing output token address on Base.');

  // For multi-stock basket buys, go straight to onchain Aerodrome Slipstream + Uniswap V3
  // so all legs pack cleanly into 1 single multicall transaction with zero external API latency.
  if (preferAerodrome) {
    return quoteOnchainDexes({ tokenIn, tokenOut, amountInUnits, preferAerodrome: true });
  }

  // 1. Try KyberSwap Base Aggregator (covers Aerodrome, Uniswap V3/V4, Curve, PancakeSwap)
  const qs = new URLSearchParams({ tokenIn, tokenOut, amountIn: String(amountInUnits) });
  try {
    const { ok, json: j } = await fetchJsonTry(
      [`/kyber/routes?${qs}`, `/api/swap?${qs}`, `${KYBER_BASE}/routes?${qs}`],
      { headers: { 'x-client-id': CLIENT_ID, accept: 'application/json' } },
    );
    if (ok && j.code === 0 && j.data?.routeSummary) {
      const router = String(j.data.routerAddress || '');
      if (router.toLowerCase() === KYBER_ROUTER.toLowerCase()) {
        return {
          dex: 'kyber',
          routeSummary: j.data.routeSummary,
          routerAddress: router,
          amountOut: j.data.routeSummary.amountOut,
          amountOutUsd: Number(j.data.routeSummary.amountOutUsd || 0),
          gasUsd: Number(j.data.routeSummary.gasUsd || 0),
        };
      }
    }
  } catch { /* fall through to direct onchain Aerodrome + Uniswap V3 */ }

  // 2. Direct Onchain Dual-DEX (Aerodrome Slipstream + Uniswap V3 via Base RPC)
  return quoteOnchainDexes({ tokenIn, tokenOut, amountInUnits });
}

export async function buildBaseSwap({ quote, routeSummary, sender, slippageBps = 150 }) {
  if (quote?.dex === 'aerodrome') {
    const outBig = BigInt(quote.amountOut || '0');
    const minOut = (outBig * BigInt(10000 - slippageBps)) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
    const data = quote.route.kind === 'single'
      ? encodeFunctionData({
          abi: AERO_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: quote.tokenIn,
            tokenOut: quote.tokenOut,
            tickSpacing: quote.route.tickSpacing,
            recipient: sender,
            deadline,
            amountIn: quote.amountInUnits,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
          }],
        })
      : encodeFunctionData({
          abi: AERO_ROUTER_ABI,
          functionName: 'exactInput',
          args: [{
            path: quote.route.path,
            recipient: sender,
            deadline,
            amountIn: quote.amountInUnits,
            amountOutMinimum: minOut,
          }],
        });
    return {
      to: AERO_SLIPSTREAM_ROUTER,
      data,
      value: '0x0',
      amountOut: quote.amountOut,
      dex: 'aerodrome',
    };
  }

  if (quote?.dex === 'uniswapv3') {
    const outBig = BigInt(quote.amountOut || '0');
    const minOut = (outBig * BigInt(10000 - slippageBps)) / 10000n;
    const data = quote.route.kind === 'single'
      ? encodeFunctionData({
          abi: UNI_ROUTER02_ABI,
          functionName: 'exactInputSingle',
          args: [{
            tokenIn: quote.tokenIn,
            tokenOut: quote.tokenOut,
            fee: quote.route.fee,
            recipient: sender,
            amountIn: quote.amountInUnits,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
          }],
        })
      : encodeFunctionData({
          abi: UNI_ROUTER02_ABI,
          functionName: 'exactInput',
          args: [{
            path: quote.route.path,
            recipient: sender,
            amountIn: quote.amountInUnits,
            amountOutMinimum: minOut,
          }],
        });
    return {
      to: UNISWAP_V3_ROUTER,
      data,
      value: '0x0',
      amountOut: quote.amountOut,
      dex: 'uniswapv3',
    };
  }

  const rs = routeSummary || quote?.routeSummary;
  const { ok, json: j } = await fetchJsonTry(
    ['/kyber/route/build', '/api/swap', `${KYBER_BASE}/route/build`],
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-id': CLIENT_ID, accept: 'application/json' },
      body: JSON.stringify({
        routeSummary: rs,
        sender,
        recipient: sender,
        slippageTolerance: slippageBps,
        source: CLIENT_ID,
      }),
    },
  );
  if (!ok || j.code !== 0 || !j.data?.data) {
    throw new Error(j.message || 'Could not build Base swap transaction.');
  }
  const router = String(j.data.routerAddress || KYBER_ROUTER);
  if (router.toLowerCase() !== KYBER_ROUTER.toLowerCase()) {
    throw new Error('Unexpected swap router address returned; aborted for safety.');
  }
  return {
    to: router,
    data: j.data.data,
    value: `0x${BigInt(j.data.transactionValue || '0').toString(16)}`,
    amountOut: j.data.amountOut,
    dex: 'kyber',
  };
}

export async function executeUsdcSwap({ provider, account, tokenOut, usdcAmount, slippageBps = 150, onStatus }) {
  const clean = sanitizeAmount(usdcAmount);
  const units = parseUnits(clean || '0', 6);
  if (units <= 0n) throw new Error('Enter a positive USDC amount.');

  onStatus?.('Finding best Base swap route (Aerodrome + Uniswap V3)...');
  const quote = await quoteBaseSwap({ tokenIn: BASE_USDC, tokenOut, amountInUnits: units });
  const dexLabel = quote.dex === 'aerodrome' ? 'Aerodrome Slipstream' : quote.dex === 'uniswapv3' ? 'Uniswap V3' : 'KyberSwap';
  onStatus?.(`Building ${dexLabel} Base swap...`);
  const built = await buildBaseSwap({ quote, routeSummary: quote.routeSummary, sender: account, slippageBps });

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [built.to, units],
  });

  const allow = await client.readContract({
    address: BASE_USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, built.to],
  }).catch(() => 0n);

  if (allow < units) {
    try {
      await toBase(provider);
      onStatus?.('Confirm Approve + Swap in your wallet...');
      const batch = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1.0',
          chainId: '0x2105',
          from: account,
          calls: [
            withBuilderCode({ to: BASE_USDC, data: approveData }),
            withBuilderCode({ to: built.to, data: built.data, value: built.value }),
          ],
        }],
      });
      if (batch) return { batched: true, txHash: '', quote };
    } catch (err) {
      if (rejected(err)) throw err;
      onStatus?.(`Step 1/2: Approve USDC for ${dexLabel}...`);
      const appHash = await sendTx(provider, { from: account, to: BASE_USDC, data: approveData });
      const appRes = await waitTx(appHash, provider);
      if (appRes.ok === false) throw new Error('USDC approval reverted.');
    }
  }

  onStatus?.(`Confirm ${dexLabel} Swap in your wallet...`);
  const txHash = await sendTx(provider, { from: account, to: built.to, data: built.data, value: built.value });
  onStatus?.('Confirming on Base...');
  const res = await waitTx(txHash, provider);
  if (res.ok === false) throw new Error('Swap transaction reverted.');
  return { batched: false, txHash, quote };
}

export async function getTokenBalanceRaw(tokenAddress, account, decimals = 8) {
  if (!tokenAddress || !account) return { raw: 0n, balance: 0, decimals };
  try {
    const raw = await client.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
    });
    return { raw, balance: Number(raw) / (10 ** decimals), decimals };
  } catch {
    return { raw: 0n, balance: 0, decimals };
  }
}

export async function getTokenBalance(tokenAddress, account, decimals = 8) {
  const res = await getTokenBalanceRaw(tokenAddress, account, decimals);
  return res.balance;
}

// 1-call Base multicall to fetch ONLY tokenized stocks with balance > 0 in the connected wallet.
export async function getWalletStockBalances(stocks, account) {
  if (!account || !Array.isArray(stocks) || !stocks.length) return [];
  const valid = stocks.filter((s) => s?.address && /^0x[0-9a-fA-F]{40}$/.test(s.address));
  if (!valid.length) return [];
  try {
    const res = await client.multicall({
      allowFailure: true,
      contracts: valid.map((s) => ({
        address: s.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [account],
      })),
    });
    const held = [];
    for (let i = 0; i < valid.length; i++) {
      const r = res[i];
      if (r?.status === 'success' && typeof r.result === 'bigint' && r.result > 0n) {
        const s = valid[i];
        const dec = s.decimals || 8;
        const balance = Number(r.result) / (10 ** dec);
        const usdVal = s.nav ? balance * Number(s.nav) : balance;
        held.push({ ...s, raw: r.result, balance, usdVal });
      }
    }
    held.sort((a, b) => b.usdVal - a.usdVal);
    return held;
  } catch {
    return [];
  }
}

// Generic non-custodial token swap on Base (used for Sell: Stock -> USDC, or any ERC-20 pair).
// Uses exact rawUnits (BigInt) when provided and clamps to onchain balanceOf so Sell MAX never reverts by 1 wei.
export async function executeTokenSwap({ provider, account, tokenIn, tokenInDecimals = 8, tokenOut = BASE_USDC, amount, rawUnits = null, slippageBps = 150, onStatus }) {
  const clean = sanitizeAmount(amount);
  let units = typeof rawUnits === 'bigint' && rawUnits > 0n
    ? rawUnits
    : parseUnits(clean || '0', tokenInDecimals);
  if (units <= 0n) throw new Error('Enter a positive token amount.');

  const bal = await client.readContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account],
  }).catch(() => null);
  if (typeof bal === 'bigint') {
    if (bal <= 0n) throw new Error('Wallet holds 0 balance of this token.');
    if (units > bal) units = bal;
  }

  onStatus?.('Finding best Base route (Aerodrome + Uniswap V3)...');
  const quote = await quoteBaseSwap({ tokenIn, tokenOut, amountInUnits: units });
  const dexLabel = quote.dex === 'aerodrome' ? 'Aerodrome Slipstream' : quote.dex === 'uniswapv3' ? 'Uniswap V3' : 'KyberSwap';
  onStatus?.(`Building ${dexLabel} Sell transaction...`);
  const built = await buildBaseSwap({ quote, routeSummary: quote.routeSummary, sender: account, slippageBps });

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'approve',
    args: [built.to, units],
  });

  const allow = await client.readContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account, built.to],
  }).catch(() => 0n);

  if (allow < units) {
    try {
      await toBase(provider);
      onStatus?.('Confirm Approve + Sell in your wallet...');
      const batch = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1.0',
          chainId: '0x2105',
          from: account,
          calls: [
            withBuilderCode({ to: tokenIn, data: approveData }),
            withBuilderCode({ to: built.to, data: built.data, value: built.value }),
          ],
        }],
      });
      if (batch) return { batched: true, txHash: '', quote };
    } catch (err) {
      if (rejected(err)) throw err;
      onStatus?.(`Step 1/2: Approve token for ${dexLabel}...`);
      const appHash = await sendTx(provider, { from: account, to: tokenIn, data: approveData });
      const appRes = await waitTx(appHash, provider);
      if (appRes.ok === false) throw new Error('Token approval reverted.');
    }
  }

  onStatus?.(`Confirm ${dexLabel} Sell in your wallet...`);
  const txHash = await sendTx(provider, { from: account, to: built.to, data: built.data, value: built.value });
  onStatus?.('Confirming on Base...');
  const res = await waitTx(txHash, provider);
  if (res.ok === false) throw new Error('Sell transaction reverted.');
  return { batched: false, txHash, quote };
}

// Quote all stocks in a basket in parallel (prefers Aerodrome Slipstream so all 10 legs pack into 1 multicall tx).
export async function quoteBasketSwap({ items, totalUsdc }) {
  const total = Number(sanitizeAmount(totalUsdc));
  if (!Number.isFinite(total) || total <= 0) throw new Error('Enter a positive USDC total.');
  const totalUnits = parseUnits(String(total), 6);
  const weightSum = items.reduce((a, x) => a + (x.weight || 10), 0) || 100;

  return Promise.all(items.map(async (it) => {
    const shareUnits = (totalUnits * BigInt(Math.round((it.weight || 10) * 100))) / BigInt(Math.round(weightSum * 100));
    if (!it.address || shareUnits <= 0n) return { ...it, shareUnits, ok: false, error: 'Missing contract' };
    try {
      const quote = await quoteBaseSwap({ tokenIn: BASE_USDC, tokenOut: it.address, amountInUnits: shareUnits, preferAerodrome: true });
      return { ...it, shareUnits, ok: true, quote };
    } catch (e) {
      return { ...it, shareUnits, ok: false, error: e?.message || 'No route' };
    }
  }));
}

// Execute a 1-signature multi-stock basket swap:
// 1. Smart Wallets: ONE atomic EIP-5792 wallet_sendCalls batch (Approve + all swaps in 1 click).
// 2. Standard EOA Wallets: packs ALL Aerodrome Slipstream legs into ONE single SwapRouter.multicall(bytes[]) tx
//    (and any Uniswap V3 fallback legs into ONE SwapRouter02.multicall(bytes[]) tx).
export async function executeBasketSwap({ provider, account, items, totalUsdc, slippageBps = 150, onStatus, onStep }) {
  onStatus?.(`Quoting ${items.length} basket stocks on Base (Aerodrome + Uniswap V3)...`);
  const quoted = await quoteBasketSwap({ items, totalUsdc });
  const routable = quoted.filter((x) => x.ok && x.quote);
  quoted.filter((x) => !x.ok).forEach((x) => onStep?.(x.ticker, 'fail', ''));
  if (!routable.length) throw new Error('No routable Base pools found for the basket right now.');

  onStatus?.(`Building ${routable.length} Base swap routes...`);
  const builtList = [];
  for (const item of routable) {
    try {
      const built = await buildBaseSwap({ quote: item.quote, routeSummary: item.quote.routeSummary, sender: account, slippageBps });
      builtList.push({ item, built });
    } catch {
      onStep?.(item.ticker, 'fail', '');
    }
  }
  if (!builtList.length) throw new Error('Could not build basket swap transactions.');

  const neededByRouter = new Map();
  for (const { item, built } of builtList) {
    const r = built.to.toLowerCase();
    neededByRouter.set(r, { router: built.to, units: (neededByRouter.get(r)?.units || 0n) + item.shareUnits });
  }

  const approveCalls = [];
  for (const { router, units } of neededByRouter.values()) {
    const allow = await client.readContract({
      address: BASE_USDC,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account, router],
    }).catch(() => 0n);
    if (allow < units) {
      const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, units] });
      approveCalls.push({ router, data });
    }
  }

  await toBase(provider);

  const aeroLegs = builtList.filter(({ built }) => built.to.toLowerCase() === AERO_SLIPSTREAM_ROUTER.toLowerCase());
  const uniLegs = builtList.filter(({ built }) => built.to.toLowerCase() === UNISWAP_V3_ROUTER.toLowerCase());
  const otherLegs = builtList.filter(({ built }) =>
    built.to.toLowerCase() !== AERO_SLIPSTREAM_ROUTER.toLowerCase()
    && built.to.toLowerCase() !== UNISWAP_V3_ROUTER.toLowerCase(),
  );

  const packMulticall = (legs, routerAddr, abi) => {
    if (!legs.length) return null;
    const data = legs.length > 1
      ? encodeFunctionData({ abi, functionName: 'multicall', args: [legs.map((x) => x.built.data)] })
      : legs[0].built.data;
    return { to: routerAddr, data, value: '0x0', legs };
  };

  const packedGroups = [
    packMulticall(aeroLegs, AERO_SLIPSTREAM_ROUTER, AERO_ROUTER_ABI),
    packMulticall(uniLegs, UNISWAP_V3_ROUTER, UNI_ROUTER02_ABI),
  ].filter(Boolean);

  // 1. Try EIP-5792 atomic batch first (Smart Wallets)
  try {
    onStatus?.(`Confirm 1-click Basket (${builtList.length} stocks) in your wallet...`);
    const calls = [
      ...approveCalls.map((a) => withBuilderCode({ to: BASE_USDC, data: a.data })),
      ...packedGroups.map((g) => withBuilderCode({ to: g.to, data: g.data, value: g.value })),
      ...otherLegs.map(({ built }) => withBuilderCode({ to: built.to, data: built.data, value: built.value })),
    ];
    const batch = await provider.request({
      method: 'wallet_sendCalls',
      params: [{ version: '1.0', chainId: '0x2105', from: account, calls }],
    });
    if (batch) {
      builtList.forEach(({ item }) => onStep?.(item.ticker, 'done', ''));
      return { batched: true, count: builtList.length, skipped: items.length - builtList.length, txHashes: [] };
    }
  } catch (err) {
    if (rejected(err)) throw err;
  }

  // 2. Standard EOA path: 1-time USDC approval + SINGLE multicall tx per router (1 tx total for all Aerodrome stocks!)
  for (const a of approveCalls) {
    onStatus?.('Step 1: Approve USDC for Base router (1-time)...');
    const appHash = await sendTx(provider, { from: account, to: BASE_USDC, data: a.data });
    const appRes = await waitTx(appHash, provider);
    if (appRes.ok === false) throw new Error('USDC approval reverted.');
  }

  const txHashes = [];
  for (const grp of packedGroups) {
    grp.legs.forEach(({ item }) => onStep?.(item.ticker, 'active', ''));
    onStatus?.(`Confirm 1 single tx to buy ${grp.legs.length} stocks on Base...`);
    const txHash = await sendTx(provider, { from: account, to: grp.to, data: grp.data, value: grp.value });
    onStatus?.(`Confirming ${grp.legs.length}-stock multicall on Base...`);
    const res = await waitTx(txHash, provider);
    if (res.ok === false) {
      grp.legs.forEach(({ item }) => onStep?.(item.ticker, 'fail', txHash));
      throw new Error('Basket multicall transaction reverted.');
    }
    grp.legs.forEach(({ item }) => {
      txHashes.push({ ticker: item.ticker, txHash });
      onStep?.(item.ticker, 'done', txHash);
    });
  }

  for (let i = 0; i < otherLegs.length; i++) {
    const { item, built } = otherLegs[i];
    onStatus?.(`Swapping ${item.ticker} (${i + 1}/${otherLegs.length})...`);
    onStep?.(item.ticker, 'active', '');
    const txHash = await sendTx(provider, { from: account, to: built.to, data: built.data, value: built.value });
    const res = await waitTx(txHash, provider);
    if (res.ok === false) {
      onStep?.(item.ticker, 'fail', txHash);
    } else {
      txHashes.push({ ticker: item.ticker, txHash });
      onStep?.(item.ticker, 'done', txHash);
    }
  }

  return { batched: false, count: txHashes.length, skipped: items.length - txHashes.length, txHashes };
}

export async function getNativeEthBalance(account) {
  if (!account) return { raw: 0n, balance: 0 };
  try {
    const raw = await client.getBalance({ address: account });
    return { raw, balance: Number(raw) / 1e18 };
  } catch {
    return { raw: 0n, balance: 0 };
  }
}

// Quadra-style verified Relay swap on Base Mainnet (supports $BLOCKY V4 pool, ETH, USDC, Crypto & Stocks).
export async function quoteRelaySwap({ user, tokenIn, tokenOut, amountInUnits, slippageBps = 150 }) {
  const wallet = user || SIM_USER;
  const payload = {
    user: wallet,
    recipient: wallet,
    originChainId: 8453,
    destinationChainId: 8453,
    originCurrency: tokenIn,
    destinationCurrency: tokenOut,
    amount: String(amountInUnits),
    tradeType: 'EXACT_INPUT',
    slippageTolerance: String(slippageBps),
  };
  const directUrl = `${KYBER_BASE.slice(0, 8)}api.relay.link/quote`;
  let body = null;
  let lastErr = '';
  for (const url of [directUrl, '/api/swap?dex=relay']) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(9000),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.steps?.length) { body = j; break; }
      lastErr = j?.message || j?.error || `HTTP ${r.status}`;
    } catch (e) {
      lastErr = e?.message || 'Relay unreachable';
    }
  }
  if (!body) throw new Error(lastErr || 'No Relay route found on Base.');

  const isNativeIn = tokenIn.toLowerCase() === BASE_NATIVE;
  const steps = [];
  for (const s of body.steps || []) {
    if (s.id !== 'approve' && s.id !== 'swap') continue;
    for (const item of s.items || []) {
      const d = item?.data;
      if (!d || d.chainId !== 8453 || !d.to || !d.data) continue;
      const to = String(d.to).toLowerCase();
      if (s.id === 'approve') {
        if (isNativeIn || to !== tokenIn.toLowerCase()) throw new Error('Relay approval target mismatch.');
      } else {
        const key = isNativeIn ? 'router' : 'approvalProxy';
        if (!RELAY_PAIRS.some((p) => p[key] === to)) {
          throw new Error('Relay swap target is not a verified Base Relay contract.');
        }
      }
      steps.push({
        id: s.id,
        to: d.to,
        data: d.data,
        value: d.value ? `0x${BigInt(d.value).toString(16)}` : '0x0',
      });
    }
  }
  if (!steps.some((x) => x.id === 'swap')) throw new Error('Relay quote returned no swap step.');
  const details = body.details || {};
  return {
    dex: 'relay',
    steps,
    amountOut: String(details.currencyOut?.amount || '0'),
    minOut: String(details.currencyOut?.minimumAmount || '0'),
    amountOutUsd: Number(details.currencyOut?.amountUsd || 0),
    impact: details.totalImpact?.percent ?? null,
    gasUsd: Number(details.totalImpact?.gasUsd || 0.01),
  };
}

export async function executeRelaySwap({ provider, account, tokenIn, tokenOut, amountInUnits, slippageBps = 150, onStatus }) {
  onStatus?.('Quoting live Base route via Relay...');
  const quote = await quoteRelaySwap({ user: account, tokenIn, tokenOut, amountInUnits, slippageBps });
  await toBase(provider);

  if (quote.steps.length > 1) {
    try {
      onStatus?.('Confirm Approve + Swap in your wallet...');
      const batch = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1.0',
          chainId: '0x2105',
          from: account,
          calls: quote.steps.map((s) => withBuilderCode({ to: s.to, data: s.data, value: s.value })),
        }],
      });
      if (batch) return { batched: true, txHash: '', quote };
    } catch (err) {
      if (rejected(err)) throw err;
    }
  }

  let lastHash = '';
  for (let i = 0; i < quote.steps.length; i++) {
    const s = quote.steps[i];
    onStatus?.(s.id === 'approve' ? `Step ${i + 1}/${quote.steps.length}: Approve exact token amount...` : 'Confirm Swap in your wallet...');
    const txHash = await sendTx(provider, { from: account, to: s.to, data: s.data, value: s.value });
    onStatus?.('Confirming on Base...');
    const res = await waitTx(txHash, provider);
    if (res.ok === false) throw new Error(s.id === 'approve' ? 'Token approval reverted.' : 'Swap transaction reverted.');
    lastHash = txHash;
  }
  return { batched: false, txHash: lastHash, quote };
}

