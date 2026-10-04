// Vercel serverless function: GET /api/colony
// Returns the live colony state that every visitor renders:
//   { feesUsd, population, arrivals: [ms...], feePerCitizen, source, breakdown, updatedAt }
//
// Fee sources (first one configured wins):
//   FEES_USD_OVERRIDE  fixed number, handy before launch / for testing
//   FEES_URL           any JSON endpoint returning { feesUsd } (Dune, your indexer, ...)
//   FEE_WALLET         dedicated creator-fee wallet on Base. We value its ETH + WETH + USDC
//                      (Chainlink ETH/USD) plus TOKEN_ADDRESS and every token it is paired
//                      with (DexScreener prices), plus any FEE_TOKENS.
//                      Withdrawals are handled by the high-water mark below (needs KV);
//                      FEES_OFFSET_USD (may be negative) shifts the total, e.g. to subtract
//                      what the wallet held before launch.
//
// Optional Upstash Redis / Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN) stores the
// fee high-water mark and each citizen's arrival time, so the population never shrinks and
// every visitor sees identical trade histories.

const env = process.env;
const RPC = env.BASE_RPC_URL || 'https://mainnet.base.org';
const FEE_PER = Number(env.FEE_PER_CITIZEN || 5);
const OFFSET = Number(env.FEES_OFFSET_USD || 0);
const LAUNCH = Number(env.LAUNCH_TIME_MS || 0) || Date.parse('2026-01-01T00:00:00Z');
const KV_URL = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
const KEY = env.KV_KEY || 'blocky:colony';
const TOKEN = env.TOKEN_ADDRESS || '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885';
const EXTRA_TOKENS = (env.FEE_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean);

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ETH_USD_FEED = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70'; // Chainlink ETH/USD on Base

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const pad = (addr) => addr.toLowerCase().replace('0x', '').padStart(64, '0');
const big = (hex) => BigInt(hex && hex !== '0x' ? hex : '0x0');
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

async function walletFees(wallet) {
  const [eth, weth, usdc, round, prices] = await Promise.all([
    rpc('eth_getBalance', [wallet, 'latest']),
    call(WETH, '0x70a08231' + pad(wallet)),
    call(USDC, '0x70a08231' + pad(wallet)),
    call(ETH_USD_FEED, '0xfeaf968c'), // latestRoundData() -> answer is the 2nd word, 8 decimals
    dexPrices().catch((e) => { console.warn('[colony]', e.message); return new Map(); }),
  ]);
  const ethUsd = Number(big('0x' + round.slice(2 + 64, 2 + 128))) / 1e8;
  const breakdown = [
    { symbol: 'ETH+WETH', amount: units(big(eth) + big(weth), 18), usd: units(big(eth) + big(weth), 18) * ethUsd },
    { symbol: 'USDC', amount: units(big(usdc), 6), usd: units(big(usdc), 6) },
  ];
  const skip = new Set([WETH.toLowerCase(), USDC.toLowerCase()]);
  const tokens = [...prices].filter(([a]) => !skip.has(a));
  const rows = await Promise.all(tokens.map(async ([addr, p]) => {
    const [bal, dec] = await Promise.all([call(addr, '0x70a08231' + pad(wallet)), call(addr, '0x313ce567')]);
    const amount = units(big(bal), Number(big(dec)));
    return { symbol: p.symbol, address: addr, amount, usd: amount * p.usd };
  }));
  breakdown.push(...rows.filter((r) => r.amount > 0));
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

async function readFees() {
  if (env.FEES_USD_OVERRIDE) return { fees: Number(env.FEES_USD_OVERRIDE), source: 'override' };
  if (env.FEES_URL) {
    const r = await fetch(env.FEES_URL);
    return { fees: Number((await r.json()).feesUsd), source: 'feed' };
  }
  if (env.FEE_WALLET) return { ...(await walletFees(env.FEE_WALLET)), source: 'onchain' };
  return { fees: 0, source: 'prelaunch' };
}

export default async function handler(req, res) {
  try {
    const { fees, source, breakdown } = await readFees();
    const now = Date.now();
    let feesUsd = Math.max(0, fees + OFFSET);
    let arrivals = null;

    if (KV_URL && KV_TOKEN) {
      const saved = JSON.parse((await kv('GET', KEY)) || '{"high":0,"arrivals":[]}');
      feesUsd = Math.max(saved.high, feesUsd);
      arrivals = saved.arrivals.length ? saved.arrivals : [LAUNCH];
      const population = 1 + Math.floor(feesUsd / FEE_PER);
      while (arrivals.length < population) arrivals.push(now);
      if (feesUsd !== saved.high || arrivals.length !== saved.arrivals.length) {
        await kv('SET', KEY, JSON.stringify({ high: feesUsd, arrivals }));
      }
    }

    res.setHeader('cache-control', 's-maxage=10, stale-while-revalidate=30');
    res.status(200).json({
      feesUsd,
      population: 1 + Math.floor(feesUsd / FEE_PER),
      arrivals,
      feePerCitizen: FEE_PER,
      source,
      breakdown,
      updatedAt: now,
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
