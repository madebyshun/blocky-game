import { parseAbi } from 'viem';
// Stock research templates for the Blocky worker. One template per Blue Agent job skill; all data is free:
// BaseCity's /api/stocks (Coinbase list, NAV, on-chain hourly volume) and Blue Agent's weekend scorecard.
const SITE = process.env.SITE_URL || 'https://www.basecity.space';
const json = async (url, fetchImpl = fetch) => { const r = await fetchImpl(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`Data source returned ${r.status}`); return r.json(); };
const usd = (n) => (n == null || !Number.isFinite(+n) ? 'n/a' : `$${(+n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const pct = (n) => (n == null || !Number.isFinite(+n) ? 'n/a' : `${(+n).toFixed(2)}%`);
const NOTE = 'Not financial advice. Coinbase tokenized stocks are not offered to U.S. persons.';

export const STOCK_SKILLS = ['stock-weekend-gap', 'stock-after-hours-volume', 'stock-nav-premium'];

// Ticker from structured inputs first, else "Ticker: NVDA" in the brief.
export function tickerOf(job) {
  const t = job.contract?.inputs?.ticker || (/ticker\s*:\s*\$?([A-Z]{1,6})\b/i.exec(job.brief || '') || [])[1];
  return t ? t.toUpperCase() : null;
}
export function skillOf(job) {
  const s = job.contract?.skill;
  if (s) return s;
  return job.title?.trim().toLowerCase() === 'trending tokens on base i can still exit' ? 'base-token-exit-screen' : null;
}
export function supportsStockJob(job) {
  if (!STOCK_SKILLS.includes(skillOf(job))) return false;
  const c = job.contract || {};
  if (c.chainId && c.chainId !== 8453) return false;
  if (c.inputs?.chainId && c.inputs.chainId !== 8453) return false;
  if (c.inputs?.token && !/^0x[0-9a-fA-F]{40}$/.test(c.inputs.token)) return false;
  return !!tickerOf(job);
}

function find(data, ticker) {
  const s = (data.stocks || []).find((x) => x.ticker === ticker || x.symbol === ticker);
  if (!s) throw new Error(`${ticker} is not in Coinbase's tokenized stock list on Base`);
  return s;
}

export async function researchStock(job, { fetchImpl = fetch, site = SITE, client = null } = {}) {
  const skill = skillOf(job), ticker = tickerOf(job);
  const data = await json(`${site}/api/stocks`, fetchImpl);
  const s = find(data, ticker), want = job.contract?.inputs?.token;
  // a ticker never identifies a stock token on its own (NVDA is also on Robinhood Chain): check the address
  if (want && want.toLowerCase() !== s.address.toLowerCase()) throw new Error(`${ticker}: job token ${want} is not Coinbase's Base token ${s.address}`);
  const at = new Date().toISOString();
  const head = [`${ticker} (${s.name}) — ${skill}`, `Token: ${s.address} on Base (8453); snapshot ${at}`];
  const sources = [`${site}/api/stocks`, `https://basescan.org/token/${s.address}`];
  let lines, preview;
  if (skill === 'stock-after-hours-volume') {
    const w = data.week, t = w?.tickers?.[ticker];
    if (!w || !w.hours) throw new Error('On-chain hourly volume not available yet');
    lines = [`24h on-chain transfers: ${t?.n24 || 0} worth ${usd(t?.usd24 || 0)}`, `7d (${w.hours}h read): ${t?.n7 || 0} transfers worth ${usd(t?.usd7 || 0)}`,
      `All stocks, share of volume while NYSE was shut: ${pct((w.closedShare || 0) * 100)}`, `NYSE now: ${data.nyse?.open ? 'open' : 'closed'}`,
      'Method: ERC-20 Transfer logs of the token over the hours read, valued at Chainlink NAV × multiplier.'];
    preview = `${ticker} on Base: ${usd(t?.usd24 || 0)} moved in 24h, ${usd(t?.usd7 || 0)} over ${w.hours}h; ${pct((w.closedShare || 0) * 100)} of all stock volume ran while NYSE was shut.`;
  } else {
    const rows = data.weekend?.call?.rows || [], r = rows.find((x) => x.ticker === ticker);
    sources.push(data.weekend?.page || 'https://blueagent.dev/markets/weekend');
    if (skill === 'stock-weekend-gap') {
      if (!r) throw new Error(`Blue's weekend scorecard has no ${ticker} row`);
      lines = [`Friday close: ${usd(r.close)}`, `Base DEX price over the weekend: ${usd(r.dex)}`, `Weekend move: ${pct(r.move)}${data.weekend.call.provisional ? ' (provisional, weekend still open)' : ''}`, `Scorecard call: ${r.call || 'n/a'}`,
        'Method: Blue Agent weekend scorecard (Base DEX vs Friday NYSE close).'];
      preview = `${ticker} weekend gap: Base DEX ${usd(r.dex)} vs Friday close ${usd(r.close)} (${pct(r.move)}).`;
    } else {
      // NAV premium at one pinned Base block: pool price from the pool's slot0 at block B; oracle from the
      // Chainlink round live at B (Blue Agent hood-live, free) — a round holds until the next update.
      const hood = await fetchImpl('https://blueagent.dev/api/x402/hood-live', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chain: 'base' }), signal: AbortSignal.timeout(20000) }).then((r) => r.json()).catch(() => null);
      const h = (hood?.rows || []).find((x) => x.contract?.toLowerCase() === s.address.toLowerCase());
      if (!h?.oracle_usd || !h.pool_ref) throw new Error(`${ticker}: no Chainlink oracle + pool on Blue's Base desk`);
      sources.push('https://blueagent.dev/api/x402/hood-live', `https://basescan.org/address/${h.pool_ref}`);
      let dex = h.dex_usd, block = null, blockAt = null, how = 'Blue hood-live pool price';
      if (client) {
        block = await client.getBlockNumber();
        const b = await client.getBlock({ blockNumber: block }); blockAt = Number(b.timestamp);
        const P = parseAbi(['function token0() view returns (address)', 'function token1() view returns (address)', 'function slot0() view returns (uint160)']);
        const D = parseAbi(['function decimals() view returns (uint8)']);
        const at = { address: h.pool_ref, blockNumber: block };
        const [t0, t1, sq] = await Promise.all(['token0', 'token1', 'slot0'].map((f) => client.readContract({ ...at, abi: P, functionName: f })));
        const [d0, d1] = await Promise.all([t0, t1].map((a) => client.readContract({ address: a, abi: D, functionName: 'decimals', blockNumber: block })));
        const raw = (Number(Array.isArray(sq) ? sq[0] : sq) / 2 ** 96) ** 2 * 10 ** (d0 - d1); // token1 per token0
        const stockIs0 = t0.toLowerCase() === s.address.toLowerCase(), other = stockIs0 ? t1 : t0;
        if (!stockIs0 && t1.toLowerCase() !== s.address.toLowerCase()) throw new Error('Pool does not hold this token');
        if (other.toLowerCase() !== '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') throw new Error('Pool is not paired with USDC; no same-block USD price');
        dex = stockIs0 ? raw : 1 / raw; how = `pool slot0 at block ${block} (USDC pair)`;
      }
      if (!dex) throw new Error(`${ticker}: pool price unavailable`);
      const oracleAt = h.oracle_updated_at, valid = !blockAt || !oracleAt || oracleAt <= blockAt;
      const prem = (dex / h.oracle_usd - 1) * 100;
      lines = [`Block: ${block ?? 'n/a'}${blockAt ? ` (${new Date(blockAt * 1000).toISOString()})` : ''}`,
        `Chainlink oracle (NAV, multiplier-adjusted): ${usd(h.oracle_usd)} — round updated ${oracleAt ? new Date(oracleAt * 1000).toISOString() : 'n/a'}${valid ? ', the live round at this block' : ''}`,
        `Pool price: ${usd(dex)} — ${how}; pool ${h.pool_ref}`, `Premium (+) / discount (−) to NAV: ${pct(prem)}`,
        `Market session: ${h.market_session || 'n/a'}; pool TVL ${usd(h.primary_pool_tvl_usd)}`,
        'Method: sqrtPriceX96 from slot0 at the pinned block, decimals-adjusted; oracle is the Chainlink round in force at that block (rounds hold until the next update).'];
      preview = `${ticker} at Base block ${block ?? 'n/a'}: pool ${usd(dex)} vs Chainlink NAV ${usd(h.oracle_usd)} → ${pct(prem)}.`;
    }
  }
  const req = job.contract?.required || [];
  const result = [...head, '', ...lines, ...(req.length ? ['', `Required by the job: ${req.join('; ')}`] : []), '', `Sources: ${sources.join('; ')}`, NOTE].join('\n');
  return { preview, result, evidence: { timestamp: at, chainId: 8453, ticker, skill }, costUnits: 0 };
}
