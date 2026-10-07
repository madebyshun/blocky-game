// The Blocky ledger's rules (src/ledger.js): $ per Blocky per wallet, the hold rule, the waitlist,
// whales, incremental snapshots, fair rarity seeds, opening day and citizens. Run: npm test
import assert from 'node:assert/strict';
import { newLedger, applyTrade, applyBalances, snapshot, walletBlockies, rollSeed, citizenAt, citizensOf, openTrading, applyGrants, teamOrigin } from '../src/ledger.js';
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

// 5. trading opens at `unlockUsd` bought; from then a Blocky a day old is a citizen for good
{
  const DAY = 86400e3, c = { ...cfg, unlockUsd: 200, citizenDays: 1 };
  L = newLedger(0);
  applyTrade(L, { who: '0xE', kind: 'buy', usd: 50, tokens: 500, at: 1000 }, c); // #1-#10
  assert.equal(citizenAt(L, 1, c), Infinity, 'nobody is a citizen before trading opens');
  applyTrade(L, { who: '0xE', kind: 'sell', usd: 10, tokens: 100, at: 3 * DAY }, c);
  assert.deepEqual(walletBlockies(L, '0xe').active, [1, 2, 3, 4, 5, 6, 7, 8], 'before: a sell costs the newest, however old');
  applyTrade(L, { who: '0xF', kind: 'buy', usd: 100, tokens: 1000, at: 4 * DAY }, c); // #11-#30, the first 150 bought
  assert.equal(snapshot(L, c).openedAt, null);
  applyTrade(L, { who: '0xG', kind: 'buy', usd: 50, tokens: 500, at: 5 * DAY }, c); // $200: trading opens
  assert.equal(snapshot(L, c).openedAt, 5 * DAY);
  assert.equal(citizenAt(L, 1, c), 5 * DAY, 'held long enough: a citizen on opening day');
  assert.equal(citizenAt(L, 31, c), 6 * DAY, 'the opening buy waits its day');
  // citizens stay whatever their wallet does; newcomers still leave
  applyTrade(L, { who: '0xE', kind: 'sell', usd: 40, tokens: 400, at: 5 * DAY + 1 }, c);
  applyTrade(L, { who: '0xG', kind: 'sell', usd: 50, tokens: 500, at: 5 * DAY + 2 }, c);
  assert.equal(walletBlockies(L, '0xe').active.length, 8);
  assert.equal(walletBlockies(L, '0xg').active.length, 0, 'sold within its day: gone');
  assert.equal(citizensOf(L, L.acct[0], 5 * DAY, c), 8);
  applyBalances(L, { '0xf': 0 }, 7 * DAY, c);
  assert.equal(walletBlockies(L, '0xf').active.length, 20);
  // after opening, a new buy is a newcomer for a day; held tokens cover newcomers first
  applyTrade(L, { who: '0xF', kind: 'buy', usd: 25, tokens: 250, at: 8 * DAY }, c); // 5 newcomers
  assert.equal(walletBlockies(L, '0xf').active.length, 25, 'a buy after a zero balance check counts');
  applyTrade(L, { who: '0xF', kind: 'sell', usd: 15, tokens: 150, at: 8 * DAY + 60e3 }, c); // holds 100: covers 2
  assert.equal(walletBlockies(L, '0xf').active.length, 22);
  // a newcomer that arrived out of order (a late trade) never pushes a citizen out
  L = newLedger(0);
  applyTrade(L, { who: '0xX', kind: 'buy', usd: 200, tokens: 100, at: 1000 }, c); // opens trading
  applyTrade(L, { who: '0xH', kind: 'buy', usd: 5, tokens: 100, at: 5 * DAY }, c); // #41, citizen on day 6
  applyTrade(L, { who: '0xH', kind: 'buy', usd: 5, tokens: 100, at: 1 * DAY }, c); // #42, reported late: citizen on day 2
  applyTrade(L, { who: '0xH', kind: 'sell', usd: 10, tokens: 200, at: 5 * DAY + 60e3 }, c);
  assert.deepEqual(walletBlockies(L, '0xh').active, [42]);
  // lowering unlockUsd later opens trading at the next update
  L = newLedger(0);
  applyTrade(L, { who: '0xE', kind: 'buy', usd: 50, tokens: 500, at: 1000 }, c);
  applyBalances(L, { '0xe': 500 }, 3 * DAY, { ...c, unlockUsd: 50 });
  assert.equal(L.openedAt, 3 * DAY);
  // unlockUsd 0: open at the first update, citizens a day after they arrived
  L = newLedger(0);
  applyTrade(L, { who: '0xE', kind: 'buy', usd: 50, tokens: 500, at: 1000 }, { ...cfg, citizenDays: 1 });
  assert.equal(L.openedAt, undefined);
  assert.equal(openTrading(L, 2 * DAY, { ...c, unlockUsd: 0 }), true);
  assert.equal(openTrading(L, 3 * DAY, { ...c, unlockUsd: 0 }), false, 'opens once');
  assert.equal(citizenAt(L, 1, c), 2 * DAY);
  L = newLedger(0);
  applyTrade(L, { who: '0xE', kind: 'buy', usd: 50, tokens: 500, at: 1000 }, { ...c, unlockUsd: 0 });
  assert.equal(L.openedAt, 1000);
  assert.equal(citizenAt(L, 1, c), 1000 + DAY);
  // no setting, no opening: the plain hold rule forever
  L = newLedger(0);
  applyTrade(L, { who: '0xE', kind: 'buy', usd: 50, tokens: 500, at: at() }, cfg);
  applyTrade(L, { who: '0xE', kind: 'sell', usd: 50, tokens: 500, at: at() + 365 * DAY }, cfg);
  assert.equal(snapshot(L, cfg).minted, 0);
}

// a wallet that had $BLOCKY before buying: selling the old bag keeps what it bought (its balance covers it)
L = newLedger(0);
applyBalances(L, { '0xo': 0 }, at(), cfg);
applyTrade(L, { who: '0xO', kind: 'buy', usd: 65, tokens: 3393808, at: at() }, cfg); // 13 Blockies
applyBalances(L, { '0xo': 6564086 }, at(), cfg); // it held 3.17M from before
applyTrade(L, { who: '0xO', kind: 'sell', usd: 60, tokens: 3204216, at: at() }, cfg);
assert.equal(walletBlockies(L, '0xo').active.length, 12, 'still holds 99% of what it bought: 12 of 13');
applyTrade(L, { who: '0xO', kind: 'sell', usd: 60, tokens: 1700000, at: at() }, cfg);
assert.equal(walletBlockies(L, '0xo').active.length, 6, 'selling into what it bought costs Blockies');
// a buy whose token amount is unknown counts until a balance check says the wallet holds nothing
L = newLedger(0);
applyTrade(L, { who: '0xZ', kind: 'buy', usd: 25, tokens: 0, at: at() }, cfg);
assert.equal(walletBlockies(L, '0xz').active.length, 5);
applyBalances(L, { '0xz': 0 }, at(), cfg);
assert.equal(walletBlockies(L, '0xz').active.length, 0);

// 6. each buy counts at the price of its day: raising the price later keeps what was earned
L = newLedger(0);
applyTrade(L, { who: '0xG', kind: 'buy', usd: 50, tokens: 500, at: at() }, cfg);
applyTrade(L, { who: '0xG', kind: 'buy', usd: 50, tokens: 500, at: at() }, { ...cfg, per: 25 });
assert.equal(walletBlockies(L, '0xg').active.length, 12);
applyTrade(L, { who: '0xH', kind: 'buy', usd: 30, tokens: 300, at: at() }, { ...cfg, per: 25 }); // 1.2: one, the rest carries over
applyTrade(L, { who: '0xH', kind: 'buy', usd: 20, tokens: 200, at: at() }, { ...cfg, per: 25 });
assert.equal(walletBlockies(L, '0xh').active.length, 2);
assert.equal(snapshot(L, { ...cfg, per: 25 }).price, 25);

// 7. the team's reserve: #1 to #count from the start, granted, untouched by the hold rule
L = newLedger(0, { wallet: '0xTeam', count: 5 });
assert.equal(snapshot(L, cfg).minted, 5);
applyTrade(L, { who: '0xU', kind: 'buy', usd: 10, tokens: 100, at: at() }, cfg);
assert.deepEqual(walletBlockies(L, '0xu').active, [6, 7]); // buyers come after the reserve
applyTrade(L, { who: '0xTeam', kind: 'buy', usd: 15, tokens: 150, at: at() }, cfg);
assert.equal(walletBlockies(L, '0xteam').active.length, 8);
applyTrade(L, { who: '0xTeam', kind: 'sell', usd: 15, tokens: 150, at: at() }, cfg);
assert.deepEqual(walletBlockies(L, '0xteam').active, [1, 2, 3, 4, 5]); // the bought ones leave, the reserve stays
applyBalances(L, { '0xteam': 0 }, at(), cfg);
assert.equal(walletBlockies(L, '0xteam').active.length, 5);
assert.equal(newLedger(0, { wallet: '0xTeam', count: 0 }).blockies.length, 0);

// 8. rarity: seeded by the block of the buy, same odds as the config
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

// 6. team grants: once each, at the next numbers, never sent away, citizens a hold after arriving
{
  const DAY = 86400e3, c = { ...cfg, unlockUsd: 0, citizenDays: 0.25 };
  const L = newLedger(0, { wallet: '0xT', count: 3 });
  applyTrade(L, { who: '0xG', kind: 'buy', usd: 10, tokens: 100, at: DAY - 60e3 }, c); // #4, #5, newcomers
  const grants = [{ id: 'g1', wallet: '0xG', count: 4 }, { id: 'g2', wallet: '0xH', count: 2 }];
  assert.equal(applyGrants(L, grants, DAY, c, 'block'), 6);
  assert.equal(applyGrants(L, grants, 2 * DAY, c, 'block'), 0, 'applied once');
  assert.deepEqual(L.granted.map((g) => [g.id, g.from, g.to]), [['g1', 6, 9], ['g2', 10, 11]]);
  assert.deepEqual(walletBlockies(L, '0xg').active, [4, 5, 6, 7, 8, 9]);
  assert.equal(citizenAt(L, 6, c), DAY + DAY / 4);
  // selling everything costs the bought newcomers only
  applyTrade(L, { who: '0xG', kind: 'sell', usd: 10, tokens: 100, at: DAY + 1000 }, c);
  assert.deepEqual(walletBlockies(L, '0xg').active, [6, 7, 8, 9]);
  applyBalances(L, { '0xh': 0 }, 3 * DAY, c);
  assert.equal(walletBlockies(L, '0xh').active.length, 2);
  const s = snapshot(L, c);
  assert.equal(teamOrigin({ reserve: { wallet: '0xT', count: 3 }, grants: s.grants }, 2, '0xt'), 'Team reserve');
  assert.equal(teamOrigin({ reserve: { wallet: '0xT', count: 3 }, grants: s.grants }, 7, '0xg'), 'Team');
  assert.equal(teamOrigin({ reserve: { wallet: '0xT', count: 3 }, grants: s.grants }, 4, '0xg'), null);
}
