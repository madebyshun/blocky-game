// The $BLOCKY market from the DEX: DexScreener first, the GeckoTerminal pool as a fallback. Shared by
// the API (api/colony.js) and the browser (demo mode, or when the API has no market): the price is
// never made up. Returns null when neither answers.
import { CONFIG } from './config.js';

const best = (pairs, address) => pairs
  .filter((p) => p.chainId === 'base' && p.baseToken?.address?.toLowerCase() === address)
  .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

// stocks: more token addresses on Base to quote (the token $BLOCKY trades against comes free)
export async function fetchMarket({ token = CONFIG.tokenAddress, pool = CONFIG.poolId, stocks = [] } = {}) {
  const t = token.toLowerCase();
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/base/${[t, ...stocks].join(',')}`);
    if (res.ok) {
      const pairs = await res.json();
      const p = Array.isArray(pairs) ? best(pairs, t) : null;
      if (p && Number(p.priceUsd) > 0) {
        const quotes = [];
        const native = Number(p.priceNative);
        if (p.quoteToken?.symbol && native > 0) {
          // the token $BLOCKY trades against (NVDAc): its price from the pair, its 24h move from its own
          // best pair (it powers the GPU District's grid, src/city.js)
          const q = { symbol: p.quoteToken.symbol, priceUsd: Number(p.priceUsd) / native };
          const qa = p.quoteToken.address?.toLowerCase();
          if (qa && !stocks.includes(qa)) {
            try {
              const r = await fetch(`https://api.dexscreener.com/tokens/v1/base/${qa}`);
              const own = r.ok ? best(await r.json(), qa) : null;
              const ch = Number(own?.priceChange?.h24);
              if (own && Number.isFinite(ch)) q.change24h = ch;
            } catch { /* the price alone */ }
          }
          quotes.push(q);
        }
        for (const a of stocks) {
          const s = best(pairs, a);
          if (s && !quotes.some((x) => x.symbol === s.baseToken.symbol)) quotes.push({ symbol: s.baseToken.symbol, priceUsd: Number(s.priceUsd), change24h: Number(s.priceChange?.h24 ?? 0) });
        }
        return { priceUsd: Number(p.priceUsd), change1h: Number(p.priceChange?.h1 ?? 0), change24h: Number(p.priceChange?.h24 ?? 0), volume24h: Number(p.volume?.h24 ?? 0), stocks: quotes, source: 'DexScreener' };
      }
    }
  } catch { /* try the pool */ }
  if (!pool) return null;
  try {
    const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/base/pools/${pool}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const a = (await res.json())?.data?.attributes;
    // the pool's price changes are its base token's: only use them when that is $BLOCKY
    if (!a || !(Number(a.base_token_price_usd) > 0)) return null;
    const [baseName, quoteName] = String(a.name || '').split('/').map((x) => x.trim());
    if (baseName && !/blocky/i.test(baseName)) return null;
    return {
      priceUsd: Number(a.base_token_price_usd),
      change1h: Number(a.price_change_percentage?.h1 ?? 0),
      change24h: Number(a.price_change_percentage?.h24 ?? 0),
      volume24h: Number(a.volume_usd?.h24 ?? 0),
      stocks: quoteName && Number(a.quote_token_price_usd) > 0 ? [{ symbol: quoteName, priceUsd: Number(a.quote_token_price_usd) }] : [],
      source: 'GeckoTerminal',
    };
  } catch {
    return null;
  }
}
