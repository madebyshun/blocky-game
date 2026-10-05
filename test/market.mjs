// The market fetcher (src/market.js): DexScreener first, the GeckoTerminal pool when it fails, null
// when both fail (the boards then say so instead of showing a made-up price). Run: npm test
import assert from 'node:assert/strict';
import { fetchMarket } from '../src/market.js';

const TOKEN = '0xE72A0C42b584a3E7A4503a82D1337dEB52adE885';
const reply = (body, ok = true) => ({ ok, json: async () => body });
let dex, gecko;
globalThis.fetch = async (url) => (url.includes('dexscreener') ? dex() : gecko());

dex = () => reply([
  { chainId: 'base', baseToken: { address: TOKEN.toLowerCase(), symbol: 'BLOCKY' }, quoteToken: { symbol: 'WETH' }, priceUsd: '0.00001', priceNative: '0.000000003', priceChange: { h24: 1 }, liquidity: { usd: 100 } },
  { chainId: 'base', baseToken: { address: TOKEN.toLowerCase(), symbol: 'BLOCKY' }, quoteToken: { symbol: 'NVDAc' }, priceUsd: '0.00001234', priceNative: '0.0000000678', priceChange: { h1: -1.2, h24: 5.5 }, volume: { h24: 2345 }, liquidity: { usd: 50000 } },
]);
let m = await fetchMarket({ token: TOKEN, pool: '0xpool' });
assert.equal(m.priceUsd, 0.00001234); // the deepest pool
assert.equal(m.change24h, 5.5);
assert.equal(m.volume24h, 2345);
assert.equal(m.stocks[0].symbol, 'NVDAc');
assert.ok(Math.abs(m.stocks[0].priceUsd - 182) < 1);
assert.equal(m.source, 'DexScreener');

dex = () => reply({}, false);
gecko = () => reply({ data: { attributes: { name: 'BLOCKY / NVDAc', base_token_price_usd: '0.0000124', quote_token_price_usd: '181.2', price_change_percentage: { h1: '0.5', h24: '-3.2' }, volume_usd: { h24: '1500' } } } });
m = await fetchMarket({ token: TOKEN, pool: '0xpool' });
assert.equal(m.priceUsd, 0.0000124);
assert.equal(m.change24h, -3.2);
assert.equal(m.stocks[0].symbol, 'NVDAc');
assert.equal(m.source, 'GeckoTerminal');

gecko = () => reply({ data: { attributes: { name: 'NVDAc / BLOCKY', base_token_price_usd: '181.2', quote_token_price_usd: '0.0000124' } } });
assert.equal(await fetchMarket({ token: TOKEN, pool: '0xpool' }), null); // its price changes would be NVDAc's
gecko = () => { throw new Error('offline'); };
assert.equal(await fetchMarket({ token: TOKEN, pool: '0xpool' }), null);
console.log('market: all checks pass');
