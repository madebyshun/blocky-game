// Blocky Street's data: Coinbase's stock list, stock transfers, NYSE hours, the hourly week.
import assert from 'node:assert/strict';
import http from 'node:http';
import { parseStocks, stockList, summarize, readStockHours, readHoldings } from '../api/_stocks.js';
import { stockMoves, T, DENIM, HOUR_MS } from '../api/_baselive.js';
import { nyseHours } from '../src/nysehours.js';

// NYSE: 9:30-16:00 New York, weekdays; Good Friday closed (banks open), Veterans Day open (banks closed)
const ny = (iso) => nyseHours(Date.parse(iso));
assert.equal(ny('2026-11-12T15:00:00Z').open, true); // Thu 10:00 ET
assert.equal(ny('2026-11-12T14:00:00Z').why, 'pre-market'); // 9:00 ET
assert.equal(ny('2026-11-12T21:30:00Z').why, 'after hours'); // 16:30 ET
assert.equal(ny('2026-11-14T16:00:00Z').why, 'weekend');
assert.equal(ny('2026-11-11T16:00:00Z').open, true); // Veterans Day: NYSE open
assert.equal(ny('2026-04-03T15:00:00Z').why, 'holiday'); // Good Friday
assert.equal(ny('2026-11-27T19:00:00Z').why, 'after hours'); // the day after Thanksgiving closes at 13:00

// Coinbase's list: the shape api.coinbase.com/v1/tokenized-stocks sends (pages of `tokens`)
const NVDA = '0xb20000000000000000000078ee7ce2fe4908108c', TSLA = '0xb2000000000000000000001e800a7f5189430cd0';
const page1 = { tokens: [
  { symbol: 'NVDAc', name: 'NVIDIA Corporation', contract_address: '0xB20000000000000000000078ee7CE2fe4908108C', decimals: 8, multiplier: '1', nav_price: '160.5', nav_price_updated_at: '2026-11-12T20:00:00Z', paused_features: [] },
  { symbol: 'BADc', contract_address: 'nope', decimals: 8, multiplier: '1' },
], next_page_token: 'abc' };
const page2 = { tokens: [{ symbol: 'TSLAc', name: 'Tesla Inc.', contract_address: TSLA, decimals: 8, multiplier: '1.0004', nav_price: '386', paused_features: [0] }], next_page_token: '' };
const list = parseStocks([page1, page2]);
assert.deepEqual(list.map((s) => [s.ticker, s.address, s.multiplier]), [['NVDA', NVDA, 1], ['TSLA', TSLA, 1.0004]]);
assert.deepEqual(list[1].paused, [0]);
{
  const seen = [];
  const fetchImpl = async (url) => { seen.push(url); return { ok: true, json: async () => (url.includes('page_token') ? page2 : page1) }; };
  assert.equal((await stockList({ fetchImpl, now: 1 })).length, 2);
  assert.deepEqual(seen, ['https://api.coinbase.com/v1/tokenized-stocks', 'https://api.coinbase.com/v1/tokenized-stocks?page_token=abc']);
}

// a block's stock transfers: mints and burns left out, USD at NAV x multiplier
const pad = (a) => `0x${a.slice(2).padStart(64, '0')}`, ZERO = `0x${'0'.repeat(64)}`, A = '0x' + '1'.repeat(40), B = '0x' + '2'.repeat(40);
const amt = (units) => `0x${(BigInt(Math.round(units * 1e8))).toString(16).padStart(64, '0')}`;
const tlog = (address, from, to, units, block = 1) => ({ address, blockNumber: `0x${block.toString(16)}`, topics: [T.transfer, from, to], data: amt(units) });
assert.deepEqual(stockMoves([tlog(NVDA, pad(A), pad(B), 2), tlog(NVDA, ZERO, pad(B), 100), tlog(TSLA, pad(A), pad(B), 1), tlog('0x' + '9'.repeat(40), pad(A), pad(B), 5)], list), { NVDA: [1, 321], TSLA: [1, 386] });

// the week: per ticker, and the share while NYSE was shut
{
  const fri = Math.floor(Date.parse('2026-11-13T15:00:00Z') / HOUR_MS), sat = Math.floor(Date.parse('2026-11-14T15:00:00Z') / HOUR_MS);
  const hours = Array.from({ length: 168 }, (_, i) => sat + 1 - i);
  const have = {};
  for (let i = 0; i < 8; i++) { have[fri - i] = { NVDA: [2, 100] }; have[sat - i] = { NVDA: [1, 300], TSLA: [1, 0] }; }
  const w = summarize(have, hours);
  assert.equal(w.hours, 16);
  assert.equal(w.usd7, 3200);
  assert.equal(w.tickers.NVDA.n7, 24);
  assert.equal(w.closedShare, 0.9375); // all but Friday's 9:30 and 10:30 ET hours (200 of 3,200): Saturday, and Friday's pre-market
}

// readStockHours over a stand-in RPC: an hour's logs read in ranges, kept in the store
{
  const HEAD = DENIM.block + 18000 * 3, now = DENIM.t + 3 * HOUR_MS + 1000;
  const ranges = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const q = JSON.parse(body);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(q.map((x) => {
      if (x.method === 'eth_getBlockByNumber') return { jsonrpc: '2.0', id: x.id, result: { number: `0x${HEAD.toString(16)}`, timestamp: `0x${Math.floor(now / 1000).toString(16)}`, timestampMs: `0x${now.toString(16)}`, transactions: [] } };
      const f = x.params[0], a = parseInt(f.fromBlock, 16), z = parseInt(f.toBlock, 16);
      ranges.push([a, z]);
      const at = DENIM.block + 18000 * 2; return { jsonrpc: '2.0', id: x.id, result: a <= at && at <= z ? [tlog(NVDA, pad(A), pad(B), 10, at)] : [] };
    })));
  });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const kept = {}, store = { async get(hs) { return Object.fromEntries(hs.filter((h) => kept[h]).map((h) => [h, kept[h]])); }, async set(h, v) { kept[h] = v; } };
  const w = await readStockHours(store, list, { url, now, maxNew: 2 });
  assert.ok(ranges.every(([a, z]) => z - a < 450));
  assert.equal(Object.keys(kept).length, 2);
  assert.equal(w.tickers.NVDA.n24, 1);
  assert.equal(w.tickers.NVDA.usd24, 1605);
  server.close();
}
// a wallet's stocks: balanceOf on each, units x multiplier x NAV, biggest first, zero balances left out
{
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const q = JSON.parse(body);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(q.map((x) => ({ jsonrpc: '2.0', id: x.id, result: x.params[0].to === NVDA ? amt(2) : x.params[0].to === TSLA ? amt(10) : '0x' }))));
  });
  await new Promise((r) => server.listen(0, r));
  const h = await readHoldings(A, list, `http://127.0.0.1:${server.address().port}`);
  assert.deepEqual(h.map((x) => [x.ticker, +x.shares.toFixed(3), Math.round(x.usd)]), [['TSLA', 10.004, 3862], ['NVDA', 2, 321]]);
  server.close();
}
console.log('stocks: ok');
