// The Blocky ledger's rules (src/ledger.js): $ per Blocky per wallet, the hold rule, the waitlist,
// whales, incremental snapshots, fair rarity seeds, and the unlock. Run: npm test
import assert from 'node:assert/strict';
import { newLedger, applyTrade, applyBalances, snapshot, walletBlockies, rollSeed } from '../src/ledger.js';
import { rarityOf } from '../src/sim.js';

const cfg = { per: 5, supply: 10000, whaleUsd: 1000 };
let t = 1000;
const at = () => (t += 1000);

// 1. buy, partial sell, buy again
let L = newLedger(0);
applyTrade(L, { who: '0xA', kind: 'buy', usd: 100, tokens: 1000, at: at() }, cfg);
assert.equal(snapshot(L, cfg).minted, 20);
applyTrade(L, { who: '0xA', kind: 'sell', usd: 60, tokens: 500, at: at() }, cfg);
let s = snapshot(L, cfg);
assert.equal(s.minted, 10);
assert.deepEqual(s.departures.map((d) => d[0]), [20, 19, 18, 17, 16, 15, 14, 13, 12, 11]); // newest leave first
applyTrade(L, { who: '0xA', kind: 'buy', usd: 50, tokens: 500, at: at() }, cfg);
s = snapshot(L, cfg);
assert.equal(s.minted, 20);
assert.equal(s.issued, 30); // numbers are never reused
assert.deepEqual(walletBlockies(L, '0xa').active, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
// a dust sell keeps every Blocky, a real sell costs at least one
applyTrade(L, { who: '0xA', kind: 'sell', usd: 0.01, tokens: 0.001, at: at() }, cfg);
assert.equal(snapshot(L, cfg).minted, 20);
applyTrade(L, { who: '0xA', kind: 'sell', usd: 2, tokens: 20, at: at() }, cfg);
assert.equal(snapshot(L, cfg).minted, 19);
// small buys add up per wallet
L = newLedger(0);
for (let i = 0; i < 4; i++) applyTrade(L, { who: '0xB', kind: 'buy', usd: 2.5, tokens: 25, at: at() }, cfg);
assert.equal(snapshot(L, cfg).minted, 2);

// 2. the waitlist once the city is full
L = newLedger(0);
const small = { ...cfg, supply: 25 };
applyTrade(L, { who: '0xA', kind: 'buy', usd: 100, tokens: 1000, at: at() }, small);
applyTrade(L, { who: '0xB', kind: 'buy', usd: 50, tokens: 500, at: at() }, small);
s = snapshot(L, small);
assert.equal(s.minted, 25);
assert.equal(s.waiting, 1);
applyTrade(L, { who: '0xC', kind: 'buy', usd: 20, tokens: 200, at: at() }, small); // waits behind B
applyTrade(L, { who: '0xA', kind: 'sell', usd: 100, tokens: 1000, at: at() }, small); // A leaves: B first, then C
s = snapshot(L, small);
assert.equal(walletBlockies(L, '0xb').active.length, 10);
assert.equal(walletBlockies(L, '0xc').active.length, 4);
assert.equal(s.minted, 14);
assert.equal(s.waiting, 0);

// 3. moving tokens away (balance check) counts as selling
L = newLedger(0);
applyTrade(L, { who: '0xD', kind: 'buy', usd: 40, tokens: 400, at: at() }, cfg);
applyBalances(L, { '0xd': 100 }, at(), cfg);
assert.equal(snapshot(L, cfg).minted, 2);
applyBalances(L, { '0xd': 400 }, at(), cfg); // tokens came back: owed again, new numbers
assert.equal(snapshot(L, cfg).minted, 8);
assert.equal(snapshot(L, cfg).issued, 14);

// 4. whales, incremental snapshots, a JSON round trip (the ledger lives in KV)
L = newLedger(0);
applyTrade(L, { who: '0xW', kind: 'buy', usd: 1200, tokens: 12000, at: at() }, cfg);
s = snapshot(L, cfg, 200, 0);
assert.equal(snapshot(L, cfg).whales.length, 1);
assert.equal(s.blockies.length, 40);
assert.equal(snapshot(L, cfg).minted, 240);
L = JSON.parse(JSON.stringify(L));
applyTrade(L, { who: '0xW', kind: 'sell', usd: 600, tokens: 6000, at: at() }, cfg);
assert.equal(snapshot(L, cfg).minted, 120);

// 5. once the collection unlocks (frozen), selling no longer sends Blockies away
L = newLedger(0);
applyTrade(L, { who: '0xE', kind: 'buy', usd: 50, tokens: 500, at: at() }, cfg);
L.frozen = true;
applyTrade(L, { who: '0xE', kind: 'sell', usd: 50, tokens: 500, at: at() }, cfg);
assert.equal(snapshot(L, cfg).minted, 10);

// 6. each buy counts at the price of its day: raising the price later keeps what was earned
L = newLedger(0);
applyTrade(L, { who: '0xG', kind: 'buy', usd: 50, tokens: 500, at: at() }, cfg);
applyTrade(L, { who: '0xG', kind: 'buy', usd: 50, tokens: 500, at: at() }, { ...cfg, per: 25 });
assert.equal(walletBlockies(L, '0xg').active.length, 12);
applyTrade(L, { who: '0xH', kind: 'buy', usd: 30, tokens: 300, at: at() }, { ...cfg, per: 25 }); // 1.2: one, the rest carries over
applyTrade(L, { who: '0xH', kind: 'buy', usd: 20, tokens: 200, at: at() }, { ...cfg, per: 25 });
assert.equal(walletBlockies(L, '0xh').active.length, 2);
assert.equal(snapshot(L, { ...cfg, per: 25 }).price, 25);

// 7. rarity: seeded by the block of the buy, same odds as the config
L = newLedger(0);
applyTrade(L, { who: '0xF', kind: 'buy', usd: 10, tokens: 100, at: at(), tx: '0xt', block: '0xb1' }, cfg);
assert.equal(snapshot(L, cfg).blockies[0][3], rollSeed(1, '0xb1'));
assert.notEqual(rollSeed(5, '0xaa'), rollSeed(5, '0xab'));
const count = {};
for (let n = 1; n <= 100000; n++) {
  const id = rarityOf(n, rollSeed(n, `0x${(n * 2654435761 >>> 0).toString(16)}`)).rarity.id;
  count[id] = (count[id] || 0) + 1;
}
assert.ok(Math.abs(count.legendary / 1000 - 1) < 0.15, `legendary ${count.legendary / 1000}%`);
assert.ok(Math.abs(count.rare / 1000 - 7) < 0.4, `rare ${count.rare / 1000}%`);
assert.ok(Math.abs(count.uncommon / 1000 - 22) < 0.6, `uncommon ${count.uncommon / 1000}%`);
console.log('ledger: all checks pass');
