// Vercel serverless function: GET /api/colony
// Returns the live state every visitor renders (see snapshot() in src/ledger.js):
//   { minted, issued, departed, supply, waiting, blockies: [[from, at, leftAt, seed]...],
//     departures: [[number, at]...], whales: [{ from, usd, at }], boughtUsd, recentBuys, cityStart,
//     market, source, mode, updatedAt }
// `?since=N&dsince=D` returns only the Blockies after the first N and the departures after the first
// D (clients poll with the counts they have).
//
// COUNT_MODE=buys (default): the Blocky ledger (src/ledger.js). Every $USD_PER_BLOCKY of $BLOCKY a
//   wallet buys (added up per wallet) brings one Blocky, up to MAX_SUPPLY in the city at once. A
//   wallet keeps the share of its Blockies that matches the share of its bought $BLOCKY it still
//   holds; sellers' Blockies leave and their places go to the next wallets in line. A single buy of
//   WHALE_USD+ also builds a Whale Fountain. Trades come from the pool's public trade feed
//   (GeckoTerminal); each trade's real wallet is read from its receipt (smart wallets trade through
//   bundlers), and balances are checked every HOLD_CHECK_MINUTES so tokens moved away count as sold.
//   Counting starts at LAUNCH_TIME_MS, or the first time this API runs (BACKFILL_HOURS reaches back
//   for testing).
//
// COUNT_MODE=fees: every $USD_PER_BLOCKY of creator fees brings a Blocky. Fee sources:
//   FEES_USD_OVERRIDE  fixed number, handy for testing
//   FEES_URL           any JSON endpoint returning { feesUsd }
//   FEE_WALLET         creator wallet on Base; ETH + WETH + USDC (Chainlink) plus TOKEN_ADDRESS
//                      and its paired tokens (DexScreener), plus FEE_TOKENS, minus EXCLUDE_TOKENS.
//
// Upstash Redis / Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN) stores the running totals and
// every Blocky, so the city never shrinks and every visitor sees the same one. Without KV the state
// lives in memory (fine for `npm run dev`, not for production).

import { erc20Abi, parseAbi, getAddress } from 'viem';
import { base } from 'viem/chains';
import { applyTrade, applyBalances, snapshot, holders } from '../src/ledger.js';
import { env, TOKEN, LEDGER, LAUNCH, NFT, client, kv, useKv, KEY_BASE, loadLedger, saveLedger } from './_store.js';
import { CLAIM_ABI } from './_sig.js';

const MODE = env.COUNT_MODE || 'buys';
const FEE_PER = LEDGER.per;
const SUPPLY = LEDGER.supply;
const MIN_BUY = Number(env.MIN_BUY_USD || 1);
const POOL = env.POOL_ID || '0x61ccc84e302c1a95fb66435a285e95581134bfc2a11d4fbb88ed07e68ca2e4c0'; // BLOCKY/NVDAc
const OFFSET = Number(env.FEES_OFFSET_USD || 0);
const KEY = KEY_BASE; // fee mode state
const EXTRA_TOKENS = (env.FEE_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean);
// Tokens shown in the breakdown but NOT counted as fees (e.g. the creator's own $BLOCKY bag).
const EXCLUDED = new Set((env.EXCLUDE_TOKENS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const CACHE_MS = Number(env.CACHE_MS || 20000); // one feed read per 20s, however many visitors
const STALE_MS = 10 * 60 * 1000; // on errors, keep serving the last good answer this long
const HOLD_CHECK_MS = Number(env.HOLD_CHECK_MINUTES || 15) * 60000;
const RESOLVE = env.RESOLVE_WALLETS !== '0';

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ETH_USD_FEED = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'; // Chainlink ETH/USD on Base
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const FEED_ABI = parseAbi(['function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)']);
const MULTICALL_ABI = parseAbi(['function getEthBalance(address) view returns (uint256)']);
const units = (raw, decimals) => Number(raw) / 10 ** decimals;

// USD price of TOKEN, every token it trades against, and FEE_TOKENS (best-liquidity pair wins).
async function dexPrices() {
  const list = [TOKEN, ...EXTRA_TOKENS].join(',');
  const res = await fetch(`https://api.dexscreener.com/tokens/v1/base/${list}`);
  if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
  const best = new Map(); // address -> { usd, liq, symbol }
  const put = (t, usd, liq) => {
    const a = t.address.toLowerCase();
    if (!(usd > 0)) return;
    const cur = best.get(a);
    if (!cur || liq > cur.liq) best.set(a, { usd, liq, symbol: t.symbol });
  };
  for (const p of await res.json()) {
    if (p.chainId !== 'base') continue;
    const liq = p.liquidity?.usd || 0;
    const usd = Number(p.priceUsd), native = Number(p.priceNative);
    put(p.baseToken, usd, liq);
    if (native > 0) put(p.quoteToken, usd / native, liq); // priceNative = base price in quote units
  }
  return best;
}

// Every balance, decimals and the ETH price in ONE eth_call (Multicall3), so public RPCs don't rate limit us.
async function walletFees(walletRaw) {
  const wallet = getAddress(walletRaw.trim().toLowerCase());
  let priceError;
  const prices = await dexPrices().catch((e) => { priceError = e.message; console.warn('[colony]', e.message); return new Map(); });
  const skip = new Set([WETH.toLowerCase(), USDC.toLowerCase()]);
  const tokens = [...prices].filter(([a]) => !skip.has(a));
  const bal = (address) => ({ address, abi: erc20Abi, functionName: 'balanceOf', args: [wallet] });
  const results = await client.multicall({
    allowFailure: true,
    contracts: [
      { address: base.contracts.multicall3.address, abi: MULTICALL_ABI, functionName: 'getEthBalance', args: [wallet] },
      { address: ETH_USD_FEED, abi: FEED_ABI, functionName: 'latestRoundData' },
      bal(WETH),
      bal(USDC),
      ...tokens.flatMap(([a]) => [bal(a), { address: a, abi: erc20Abi, functionName: 'decimals' }]),
    ],
  });
  const ok = (i) => {
    const e = results[i].error;
    if (results[i].status !== 'success') throw new Error(`RPC read #${i} failed: ${e?.details || e?.shortMessage || e}`);
    return results[i].result;
  };
  const ethUsd = Number(ok(1)[1]) / 1e8; // answer, 8 decimals
  const eth = units(ok(0) + ok(2), 18);
  const usdc = units(ok(3), 6);
  const breakdown = [
    { symbol: 'ETH+WETH', amount: eth, usd: eth * ethUsd },
    { symbol: 'USDC', amount: usdc, usd: usdc },
  ];
  tokens.forEach(([address, p], k) => {
    const b = results[4 + k * 2], d = results[5 + k * 2];
    if (b.status !== 'success' || d.status !== 'success') return;
    const amount = units(b.result, Number(d.result));
    const usd = amount * p.usd;
    breakdown.push(EXCLUDED.has(address)
      ? { symbol: p.symbol, address, amount, usd: 0, excluded: true, valueUsd: usd }
      : { symbol: p.symbol, address, amount, usd });
  });
  // make a missing price visible instead of silently counting the token as $0
  if (priceError) breakdown.push({ symbol: 'TOKEN PRICES UNAVAILABLE', error: priceError, usd: 0 });
  return { fees: breakdown.reduce((s, r) => s + r.usd, 0), breakdown };
}

// ---------- buys and sells: the Blocky ledger ----------

async function recentTrades() {
  const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/base/pools/${POOL}/trades`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GeckoTerminal HTTP ${res.status} for pool ${POOL}`);
  return ((await res.json()).data || []).map((d) => {
    const t = { id: d.id, ...d.attributes };
    const buy = t.to_token_address ? t.to_token_address.toLowerCase() === TOKEN : t.kind === 'buy';
    const sell = t.from_token_address ? t.from_token_address.toLowerCase() === TOKEN : t.kind === 'sell';
    if (!buy && !sell) return null;
    return {
      id: t.id || t.tx_hash, tx: t.tx_hash, who: (t.tx_from_address || '').toLowerCase(), kind: buy ? 'buy' : 'sell',
      usd: Number(t.volume_in_usd) || 0, tokens: Number(buy ? t.to_token_amount : t.from_token_amount) || 0, at: Date.parse(t.block_timestamp),
    };
  }).filter(Boolean).sort((a, b) => a.at - b.at);
}

// Smart wallets (Coinbase Smart Wallet, the Base App) trade through a bundler, so the transaction's
// sender is not the trader. Read the wallet the $BLOCKY actually went to (buy) or came from (sell):
// the biggest $BLOCKY transfer in the receipt, its last hop for a buy and its first hop for a sell.
// Also returns the trade's block hash, which seeds the rarity of the Blockies it brings.
async function realWallet(t) {
  if (!RESOLVE || !t.tx) return { who: t.who };
  try {
    const r = await client.getTransactionReceipt({ hash: t.tx });
    const moves = r.logs.filter((l) => l.address.toLowerCase() === TOKEN && l.topics[0] === TRANSFER && l.topics.length === 3);
    if (!moves.length) return { who: t.who, block: r.blockHash };
    const amount = (l) => BigInt(l.data);
    const max = moves.reduce((m, l) => (amount(l) > m ? amount(l) : m), 0n);
    const big = moves.filter((l) => amount(l) * 100n >= max * 95n);
    const addr = (topic) => `0x${topic.slice(26)}`.toLowerCase();
    return { who: t.kind === 'buy' ? addr(big[big.length - 1].topics[2]) : addr(big[0].topics[1]), block: r.blockHash };
  } catch {
    return { who: t.who };
  }
}

async function inBatches(list, size, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  return out;
}

// Tokens moved away count as sold: read every holder's balance (Multicall3, 500 per call).
// Once the NFT collection unlocks, Blockies stay whatever their wallets do.
async function checkBalances(L) {
  if (NFT && !L.frozen) L.frozen = await client.readContract({ address: NFT, abi: CLAIM_ABI, functionName: 'unlocked' }).catch(() => false);
  if (L.frozen) return;
  const wallets = holders(L);
  if (!wallets.length) return;
  L.decimals ??= Number(await client.readContract({ address: TOKEN, abi: erc20Abi, functionName: 'decimals' }));
  const balances = {};
  for (let i = 0; i < wallets.length; i += 500) {
    const chunk = wallets.slice(i, i + 500);
    const res = await client.multicall({ allowFailure: true, contracts: chunk.map((w) => ({ address: TOKEN, abi: erc20Abi, functionName: 'balanceOf', args: [w] })) });
    res.forEach((r, k) => { if (r.status === 'success') balances[chunk[k]] = Number(r.result) / 10 ** L.decimals; });
  }
  const head = await client.getBlock().catch(() => null);
  applyBalances(L, balances, Date.now(), LEDGER, head?.hash);
}

async function computeBuys() {
  const now = Date.now();
  const { ledger: L, fresh } = await loadLedger();
  const seen = new Set(L.seen);
  let changed = fresh;
  const trades = (await recentTrades()).filter((t) => t.at >= L.start && !seen.has(t.id));
  const wallets = await inBatches(trades, 6, realWallet);
  trades.forEach((t, i) => {
    seen.add(t.id);
    changed = true;
    if (t.kind === 'buy' && t.usd < MIN_BUY) return; // dust buys don't count; every sell does
    applyTrade(L, { ...t, ...wallets[i] }, LEDGER);
  });
  if (now - (L.checkedAt || 0) > HOLD_CHECK_MS) {
    try { await checkBalances(L); changed = true; } catch (e) { console.warn('[colony] balance check skipped:', e.shortMessage || e.message); }
    L.checkedAt = now;
  }
  L.seen = [...seen].slice(-1000);
  if (changed) await saveLedger(L);
  return { ...snapshot(L, LEDGER), source: 'onchain' };
}

// ---------- fees ----------

async function readFees() {
  if (env.FEES_USD_OVERRIDE) return { fees: Number(env.FEES_USD_OVERRIDE), source: 'override' };
  if (env.FEES_URL) {
    const r = await fetch(env.FEES_URL);
    return { fees: Number((await r.json()).feesUsd), source: 'feed' };
  }
  if (env.FEE_WALLET) return { ...(await walletFees(env.FEE_WALLET)), source: 'onchain' };
  return { fees: 0, source: 'prelaunch' };
}

let cache = null; // { at, body }, survives between requests on a warm server
let inflight = null; // concurrent requests share one chain read

async function computeFees() {
  const { fees, source, breakdown } = await readFees();
  const now = Date.now();
  let feesUsd = Math.max(0, fees + OFFSET);
  let arrivals = null;
  let cityStart = LAUNCH;

  if (useKv()) {
    const saved = JSON.parse((await kv('GET', KEY)) || '{"high":0,"arrivals":[]}');
    // the city starts from empty land at LAUNCH_TIME_MS, or the first time this API ever ran
    const start = LAUNCH ?? saved.start ?? now;
    feesUsd = Math.max(saved.high, feesUsd);
    arrivals = saved.arrivals.length ? saved.arrivals : [start];
    const population = 1 + Math.floor(feesUsd / FEE_PER);
    while (arrivals.length < population) arrivals.push(now);
    if (feesUsd !== saved.high || arrivals.length !== saved.arrivals.length || saved.start !== start) {
      await kv('SET', KEY, JSON.stringify({ high: feesUsd, arrivals, start }));
    }
    cityStart = start;
  }
  const minted = Math.min(SUPPLY, Math.floor(feesUsd / FEE_PER));
  const blockies = Array.from({ length: minted }, (_, i) => [null, arrivals?.[i + 1] ?? cityStart ?? Date.now(), null]);
  return { minted, issued: minted, departed: 0, supply: SUPPLY, waiting: 0, blockies, departures: [], whales: [], boughtUsd: feesUsd, feesUsd, cityStart, source, breakdown };
}

// Price moves drive the city's weather; the Base Stock Exchange shows the quotes. Best-liquidity pair
// where $BLOCKY is the base token, plus the token it trades against (NVDAc: its USD price follows
// from the pair) and any STOCK_TOKENS (comma-separated token addresses on Base).
const STOCKS = (env.STOCK_TOKENS || '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
const bestPair = (pairs, address) => pairs
  .filter((p) => p.chainId === 'base' && p.baseToken?.address?.toLowerCase() === address)
  .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
async function market() {
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/base/${[TOKEN, ...STOCKS].join(',')}`);
    if (!res.ok) return null;
    const pairs = await res.json();
    const p = bestPair(pairs, TOKEN);
    if (!p) return null;
    const stocks = [];
    const native = Number(p.priceNative);
    if (p.quoteToken?.symbol && native > 0) stocks.push({ symbol: p.quoteToken.symbol, priceUsd: Number(p.priceUsd) / native });
    for (const a of STOCKS) {
      const s = bestPair(pairs, a);
      if (s && !stocks.some((x) => x.symbol === s.baseToken.symbol)) stocks.push({ symbol: s.baseToken.symbol, priceUsd: Number(s.priceUsd), change24h: Number(s.priceChange?.h24 ?? 0) });
    }
    return { priceUsd: Number(p.priceUsd), change1h: Number(p.priceChange?.h1 ?? 0), change24h: Number(p.priceChange?.h24 ?? 0), volume24h: Number(p.volume?.h24 ?? 0), stocks };
  } catch {
    return null;
  }
}

async function compute() {
  const [body, mkt] = await Promise.all([MODE === 'fees' ? computeFees() : computeBuys(), market()]);
  return { ...body, market: mkt, mode: MODE, usdPerBlocky: FEE_PER, feePerCitizen: FEE_PER, updatedAt: Date.now() };
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 's-maxage=10, stale-while-revalidate=30');
  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      inflight ??= compute().then((body) => (cache = { at: Date.now(), body })).finally(() => (inflight = null));
      await inflight;
    }
    // clients send how many Blockies and departures they already have
    const q = new URL(req.url, 'http://x').searchParams;
    const since = Math.max(0, Number(q.get('since')) || 0), dsince = Math.max(0, Number(q.get('dsince')) || 0);
    const body = cache.body;
    res.status(200).json(since || dsince ? { ...body, blockies: body.blockies.slice(since), departures: body.departures.slice(dsince), since, dsince } : body);
  } catch (e) {
    const msg = String(e.shortMessage || e.message || e);
    console.warn('[colony]', msg);
    if (cache && Date.now() - cache.at < STALE_MS) return res.status(200).json({ ...cache.body, stale: true }); // full list: the client resyncs
    res.status(502).json({ error: msg });
  }
}
