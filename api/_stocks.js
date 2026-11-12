// Blocky Street's data: Coinbase's tokenized stocks on Base, and how much of each moves, hour by hour.
//   stockList()       -> [{ symbol, ticker, name, address, decimals, multiplier, nav, navAt, paused, icon }]
//                        Coinbase's public list (api.coinbase.com/v1/tokenized-stocks, docs.base.org "List
//                        Tokenized Stocks"), every page; kept an hour.
//   readStockHours()  -> per finished hour, every transfer of every listed stock (mints and burns left out),
//                        as { [ticker]: [transfers, usd] } (usd: amount x multiplier x Chainlink NAV), kept in
//                        `store`; a few hours per call, so a cold start fills in over calls.
// The tokens are B20 with 8 decimals; one token is not one share: `multiplier` (dividends, splits) converts.
// Fake "…c" tokens abound on Base (even at 0xb200… vanity addresses): only Coinbase's list counts here.
import { rpc, getLogs, getBlock, T, tOf, blockAtTime, HOUR_MS } from './_baselive.js';
import { nyseHours } from '../src/nysehours.js';
import { RPC } from './_store.js';

export const COINBASE_STOCKS = 'https://api.coinbase.com/v1/tokenized-stocks';
const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : null; };

let listCache = null; // { at, list }
export function parseStocks(pages) {
  const out = new Map();
  for (const body of pages) for (const t of body?.tokens || []) {
    const symbol = String(t?.symbol || ''), address = String(t?.contract_address || '').toLowerCase();
    const decimals = num(t?.decimals), multiplier = num(t?.multiplier);
    if (!symbol || !/^0x[0-9a-f]{40}$/.test(address) || !Number.isInteger(decimals) || multiplier === null) continue;
    const navAt = Date.parse(t.nav_price_updated_at || '');
    out.set(address, {
      symbol, ticker: symbol.replace(/c$/, ''), name: String(t.name || symbol), address, decimals, multiplier,
      nav: num(t.nav_price), navAt: Number.isFinite(navAt) ? navAt : null,
      paused: Array.isArray(t.paused_features) ? t.paused_features.filter((x) => typeof x === 'number') : [],
      icon: typeof t.icon_url === 'string' ? t.icon_url : null,
    });
  }
  return [...out.values()];
}
export async function stockList({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (listCache && now - listCache.at < HOUR_MS) return listCache.list;
  const pages = [];
  let token = null;
  for (let i = 0; i < 10; i++) { // 218 stocks were 3 pages of 100 (Oct 2026); a list that never ends is a bug
    const r = await fetchImpl(token ? `${COINBASE_STOCKS}?page_token=${encodeURIComponent(token)}` : COINBASE_STOCKS, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`Coinbase's stock list answered ${r.status}`);
    const body = await r.json();
    pages.push(body);
    token = body?.next_page_token && body?.tokens?.length ? body.next_page_token : null;
    if (!token) break;
  }
  const list = parseStocks(pages);
  if (!list.length) throw new Error("Coinbase's stock list came back empty");
  listCache = { at: now, list };
  return list;
}

// the transfers of a stock token in a log, as [ticker, units]: mints and burns are issuance, not trading
export function stockMove(log, byAddress) {
  const s = byAddress.get(log.address.toLowerCase());
  if (!s || log.topics?.[0] !== T.transfer || log.topics.length !== 3 || log.topics[1] === ZERO || log.topics[2] === ZERO) return null;
  return [s, Number(BigInt(log.data)) / 10 ** s.decimals];
}
export const usdOf = (s, units) => (s.nav ? units * s.multiplier * s.nav : 0);

// the hour's logs, in ranges of `size` blocks, several ranges a batch, the batches side by side
async function hourLogs(from, to, addresses, url, size = 450) {
  const ranges = [];
  for (let a = from; a <= to; a += size) ranges.push([a, Math.min(to, a + size - 1)]);
  const batches = [];
  for (let i = 0; i < ranges.length; i += 8) batches.push(ranges.slice(i, i + 8));
  const out = await Promise.all(batches.map((b) => rpc(b.map(([a, z]) => getLogs(a, z, { address: addresses, topics: [T.transfer] })), url)));
  return out.flat(2);
}

export const WEEK = 168;
export async function readStockHours(store, list, { url = RPC, now = Date.now(), maxNew = 2 } = {}) {
  const byAddress = new Map(list.map((s) => [s.address, s]));
  const [top] = await rpc([getBlock('latest')], url);
  const head = parseInt(top.number, 16), headT = tOf(top);
  const blockAt = (t) => blockAtTime(t, head, headT);
  const cur = Math.floor(now / HOUR_MS);
  const hours = Array.from({ length: WEEK }, (_, i) => cur - 1 - i); // finished hours, newest first
  const have = await store.get(hours);
  const missing = hours.filter((h) => !have[h] && blockAt((h + 1) * HOUR_MS) <= head).slice(0, maxNew);
  const errors = [];
  await Promise.all(missing.map(async (h) => {
    try {
      const logs = await hourLogs(blockAt(h * HOUR_MS), blockAt((h + 1) * HOUR_MS) - 1, list.map((s) => s.address), url);
      const row = {};
      for (const l of logs) {
        const m = stockMove(l, byAddress);
        if (!m) continue;
        const [s, units] = m, r = (row[s.ticker] ||= [0, 0]);
        r[0] += 1; r[1] += usdOf(s, units);
      }
      for (const k in row) row[k][1] = Math.round(row[k][1]);
      have[h] = row;
      await store.set(h, row);
    } catch (e) { errors.push(String(e.message || e).slice(0, 160)); } // this hour waits for the next call
  }));
  return summarize(have, hours, errors);
}

// the week, from the hours in: per ticker over 24 h and 7 d, and the share that moved with Wall Street shut
export function summarize(have, hours, errors = []) {
  const inHours = hours.filter((h) => have[h]);
  const day = hours.slice(0, 24).filter((h) => have[h]);
  const per = {}, add = (h, k) => { for (const [t, [n, usd]] of Object.entries(have[h])) { const r = (per[t] ||= { n24: 0, usd24: 0, n7: 0, usd7: 0 }); r[`n${k}`] += n; r[`usd${k}`] += usd; } };
  for (const h of day) add(h, 24);
  for (const h of inHours) add(h, 7);
  let closed = 0, all = 0, closedH = 0;
  for (const h of inHours) {
    const usd = Object.values(have[h]).reduce((s, [, u]) => s + u, 0);
    all += usd;
    if (!nyseHours(h * HOUR_MS + HOUR_MS / 2).open) { closed += usd; closedH += 1; }
  }
  const sum = (k) => Object.values(per).reduce((s, r) => s + r[k], 0);
  return {
    hours: inHours.length, dayHours: day.length,
    usd24: Math.round(sum('usd24')), n24: sum('n24'), usd7: Math.round(sum('usd7')), n7: sum('n7'),
    closedShare: inHours.length >= 6 && all > 0 ? +(closed / all).toFixed(4) : null, closedHours: closedH,
    tickers: per, errors,
  };
}

// a wallet's Coinbase stocks: balanceOf on every listed token (batches of 60), as
// [{ ticker, name, address, units, shares (units x multiplier), usd (shares x NAV) }], biggest first
export async function readHoldings(address, list, url = RPC) {
  const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, '0')}`;
  const batches = [];
  for (let i = 0; i < list.length; i += 60) batches.push(list.slice(i, i + 60));
  const res = (await Promise.all(batches.map((b) => rpc(b.map((s) => ['eth_call', [{ to: s.address, data }, 'latest']]), url)))).flat();
  const out = [];
  list.forEach((s, i) => {
    const raw = res[i] && res[i] !== '0x' ? BigInt(res[i]) : 0n;
    if (raw === 0n) return;
    const units = Number(raw) / 10 ** s.decimals, shares = units * s.multiplier;
    out.push({ ticker: s.ticker, name: s.name, address: s.address, units, shares, usd: s.nav ? shares * s.nav : null });
  });
  return out.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
}
