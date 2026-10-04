// Vercel serverless function: GET /api/colony
// Returns the live colony state that every visitor renders:
//   { feesUsd, population, arrivals: [ms...], feePerCitizen, source, updatedAt }
//
// Fee sources (first one configured wins):
//   FEES_USD_OVERRIDE  fixed number, handy before launch / for testing
//   FEES_URL           any JSON endpoint returning { feesUsd } (Dune, your indexer, ...)
//   FEE_WALLET         dedicated creator-fee wallet on Base; we value its ETH + WETH + USDC
//                      balance with the Chainlink ETH/USD feed. Withdrawals are handled by
//                      the high-water mark below (needs KV) or FEES_OFFSET_USD.
//
// Optional Upstash Redis / Vercel KV (KV_REST_API_URL + KV_REST_API_TOKEN) stores the
// fee high-water mark and each citizen's arrival time, so the population never shrinks and
// every visitor sees identical trade histories.

const RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const FEE_PER = Number(process.env.FEE_PER_CITIZEN || 5);
const OFFSET = Number(process.env.FEES_OFFSET_USD || 0);
const LAUNCH = Number(process.env.LAUNCH_TIME_MS || 0) || Date.parse('2026-01-01T00:00:00Z');
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = process.env.KV_KEY || 'blocky:colony';

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
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const pad = (addr) => addr.toLowerCase().replace('0x', '').padStart(64, '0');

async function walletFeesUsd(wallet) {
  const [eth, weth, usdc, round] = await Promise.all([
    rpc('eth_getBalance', [wallet, 'latest']),
    call(WETH, '0x70a08231' + pad(wallet)),
    call(USDC, '0x70a08231' + pad(wallet)),
    call(ETH_USD_FEED, '0xfeaf968c'), // latestRoundData()
  ]);
  const price = Number(BigInt('0x' + round.slice(2 + 64, 2 + 128))) / 1e8; // answer, 8 decimals
  const ethAmt = Number(BigInt(eth) + BigInt(weth)) / 1e18;
  const usdcAmt = Number(BigInt(usdc)) / 1e6;
  return ethAmt * price + usdcAmt;
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
  if (process.env.FEES_USD_OVERRIDE) return { fees: Number(process.env.FEES_USD_OVERRIDE), source: 'override' };
  if (process.env.FEES_URL) {
    const r = await fetch(process.env.FEES_URL);
    return { fees: Number((await r.json()).feesUsd), source: 'feed' };
  }
  if (process.env.FEE_WALLET) return { fees: await walletFeesUsd(process.env.FEE_WALLET), source: 'onchain' };
  return { fees: 0, source: 'prelaunch' };
}

export default async function handler(req, res) {
  try {
    const { fees, source } = await readFees();
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
      updatedAt: now,
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
