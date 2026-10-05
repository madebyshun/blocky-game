// Vercel serverless function: GET /api/colony
// Returns the live state every visitor renders:
//   { progressUsd, population, arrivals: [ms...], crew: [...], cityStart, usdPerBlocky, source, mode, updatedAt }
//
// COUNT_MODE=buys (default): every $USD_PER_BLOCKY of $BLOCKY *bought* brings a new Blocky.
//   Buys come from the pool's public trade feed (GeckoTerminal). Only buys count, at least
//   MIN_BUY_USD each, capped at MAX_USD_PER_BUY per trade; small buys add up. Counting starts at
//   LAUNCH_TIME_MS, or the first time this API runs (BACKFILL_HOURS reaches back for testing).
//   Each Blocky remembers the wallet whose buy brought it.
//
// COUNT_MODE=fees: every $USD_PER_BLOCKY of creator fees brings a Blocky. Fee sources:
//   FEES_USD_OVERRIDE  fixed number, handy for testing
//   FEES_URL           any JSON endpoint returning { feesUsd }
//   FEE_WALLET         creator wallet on Base; ETH + WETH + USDC (Chainlink) plus TOKEN_ADDRESS
//                      and its paired tokens (DexScreener), plus FEE_TOKENS, minus EXCLUDE_TOKENS.
//
// Upstash Redis / Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN) stores the running totals and
// each Blocky's arrival, so the city never shrinks and every visitor sees the same one. Without KV
// the state lives in memory (fine for `npm run dev`, not for production).

import { createPublicClient, http, erc20Abi, parseAbi, getAddress } from 'viem';
import { base } from 'viem/chains';

const env = process.env;
const RPC = env.BASE_RPC_URL || 'https://mainnet.base.org';
const MODE = env.COUNT_MODE || 'buys';
const FEE_PER = Number(env.USD_PER_BLOCKY || env.FEE_PER_CITIZEN || 5);
const MIN_BUY = Number(env.MIN_BUY_USD || 1);
const MAX_PER_BUY = Number(env.MAX_USD_PER_BUY || 100);
const BACKFILL_MS = Number(env.BACKFILL_HOURS || 0) * 3600000;
const POOL = env.POOL_ID || '0x61ccc84e302c1a95fb66435a285e95581134bfc2a11d4fbb88ed07e68ca2e4c0'; // BLOCKY/NVDAc
const OFFSET = Number(env.FEES_OFFSET_USD || 0);
const LAUNCH = Number(env.LAUNCH_TIME_MS || 0) || null; // when the city starts from empty land
const KV_URL = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
const KEY_BASE = env.KV_KEY || 'blocky:colony';
const KEY = MODE === 'fees' ? KEY_BASE : `${KEY_BASE}:buys`; // separate state per counting mode
const TOKEN = env.TOKEN_ADDRESS || '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885';
const EXTRA_TOKENS = (env.FEE_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean);
// Tokens shown in the breakdown but NOT counted as fees (e.g. the creator's own $BLOCKY bag).
const EXCLUDED = new Set((env.EXCLUDE_TOKENS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
const CACHE_MS = Number(env.CACHE_MS || 20000); // one chain read per 20s, however many visitors
const STALE_MS = 10 * 60 * 1000; // on RPC errors, keep serving the last good answer this long

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ETH_USD_FEED = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'; // Chainlink ETH/USD on Base

const client = createPublicClient({ chain: base, transport: http(RPC, { retryCount: 2 }) });
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

async function kv(...cmd) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${KV_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  return (await res.json()).result;
}

// persistent state: KV when configured, otherwise this process's memory
let memory = null;
const useKv = () => Boolean(KV_URL && KV_TOKEN);
async function load() { return useKv() ? JSON.parse((await kv('GET', KEY)) || 'null') : memory; }
async function save(state) { if (useKv()) await kv('SET', KEY, JSON.stringify(state)); else memory = state; }

// ---------- buys ----------

async function recentBuys() {
  const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/base/pools/${POOL}/trades`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GeckoTerminal HTTP ${res.status} for pool ${POOL}`);
  const token = TOKEN.toLowerCase();
  return ((await res.json()).data || [])
    .map((d) => ({ id: d.id, ...d.attributes }))
    .filter((t) => (t.to_token_address ? t.to_token_address.toLowerCase() === token : t.kind === 'buy'))
    .map((t) => ({ id: t.id || t.tx_hash, tx: t.tx_hash, from: t.tx_from_address, usd: Number(t.volume_in_usd) || 0, at: Date.parse(t.block_timestamp) }))
    .sort((a, b) => a.at - b.at);
}

async function computeBuys() {
  const now = Date.now();
  const loaded = await load();
  const state = loaded || { start: LAUNCH ?? now - BACKFILL_MS, credited: 0, bought: 0, arrivals: [], crew: [], seen: [], recent: [] };
  if (!state.arrivals.length) { state.arrivals.push(state.start); state.crew.push(null); }
  const seen = new Set(state.seen);
  let changed = false;
  for (const b of await recentBuys()) {
    if (b.at < state.start || seen.has(b.id)) continue;
    seen.add(b.id);
    changed = true;
    if (b.usd < MIN_BUY) continue;
    const credit = Math.min(b.usd, MAX_PER_BUY);
    const before = Math.floor(state.credited / FEE_PER);
    state.credited += credit;
    state.bought += b.usd;
    const after = Math.floor(state.credited / FEE_PER);
    for (let n = before; n < after; n++) { state.arrivals.push(b.at); state.crew.push({ from: b.from, usd: Math.round(b.usd * 100) / 100, tx: b.tx }); }
    state.recent = [{ from: b.from, usd: Math.round(b.usd * 100) / 100, at: b.at, blockies: after - before }, ...state.recent].slice(0, 10);
  }
  state.seen = [...seen].slice(-600);
  if (changed || !loaded) await save(state);
  return {
    progressUsd: state.credited,
    feesUsd: state.credited, // older clients read this name
    boughtUsd: state.bought,
    population: state.arrivals.length,
    arrivals: state.arrivals,
    crew: state.crew,
    recentBuys: state.recent,
    cityStart: state.start,
    source: 'onchain',
  };
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
  return { progressUsd: feesUsd, feesUsd, population: 1 + Math.floor(feesUsd / FEE_PER), arrivals, cityStart, source, breakdown };
}

// Price moves drive the city's weather. Best-liquidity pair where $BLOCKY is the base token.
async function market() {
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/base/${TOKEN}`);
    if (!res.ok) return null;
    const pairs = (await res.json()).filter((p) => p.baseToken?.address?.toLowerCase() === TOKEN.toLowerCase());
    const p = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (!p) return null;
    return { priceUsd: Number(p.priceUsd), change1h: Number(p.priceChange?.h1 ?? 0), change24h: Number(p.priceChange?.h24 ?? 0), volume24h: Number(p.volume?.h24 ?? 0) };
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
    res.status(200).json(cache.body);
  } catch (e) {
    const msg = String(e.shortMessage || e.message || e);
    console.warn('[colony]', msg);
    if (cache && Date.now() - cache.at < STALE_MS) return res.status(200).json({ ...cache.body, stale: true });
    res.status(502).json({ error: msg });
  }
}
