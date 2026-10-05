// The Blocky ledger: which wallet brought which Blocky, who still holds, who left. Plain JS with no
// browser or Node APIs, shared by the API (api/colony.js) and demo mode (src/data.js), so both
// follow exactly the same rules:
//
// - Every `per` USD a wallet buys (added up per wallet) earns one Blocky, numbered in order: #1, #2, ...
//   Each buy counts at the price of its day (fractions carry over), so changing `per` only affects
//   later buys. Numbers are never reused.
// - At most `supply` Blockies live in the city at once.
// - Trading opens when `unlockUsd` has been bought in total (L.openedAt). Until then every Blocky is a
//   newcomer. From then on a Blocky that has been in the city `citizenDays` days is a citizen for good:
//   an NFT its wallet can claim, free to trade, whatever the wallet does with its $BLOCKY afterwards.
// - A wallet's newcomers stay while the $BLOCKY it still holds covers them, at what it paid per Blocky
//   on average; sell, and the newest newcomers leave the city. With only newcomers: sell half and half
//   of them leave. Any real sell costs at least one; dust does not.
// - Free places go to wallets still owed Blockies, first come first served (a waitlist once the city
//   is full), then to the next buyers.
// - The team's reserve (newLedger's `reserve`) holds Blockies #1 to #count from the start: granted,
//   not bought, so the hold rule leaves them alone. They are citizens from opening day.
// - A single buy of `whaleUsd`+ also builds a Whale Fountain.
// - A Blocky's rarity is rolled from its number and the block that brought it (rollSeed), so nobody
//   can know or pick a rare number before buying, and anyone can check it afterwards.
//
// The state is plain JSON (it lives in KV): wallets[] holds each address once, blockies[] is
// [walletIndex, secondsSinceStart, leftSecondsOrNull, seed] (index = number - 1), departures[] is an
// append-only log of [number, seconds] so clients can catch up incrementally.

const cents = (v) => Math.round(v * 100) / 100;

// The seed of Blocky #n's rarity roll: FNV-1a of "n:source", source being the block hash of the trade
// that brought it (its transaction hash when the block is unknown).
export function rollSeed(n, source) {
  let h = 0x811c9dc5;
  for (const ch of `${n}:${String(source).toLowerCase()}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

// reserve: { wallet, count }: the team's Blockies, #1 to #count, there from the start
export function newLedger(start, reserve = null) {
  const L = { v: 5, start, bought: 0, wallets: [], acct: {}, blockies: [], departures: [], waiting: [], whales: [], recent: [] };
  if (reserve?.wallet && reserve.count > 0) {
    const wi = indexOf(L, reserve.wallet), a = account(L, wi);
    a.grant = reserve.count;
    for (let n = 1; n <= reserve.count; n++) { L.blockies.push([wi, 0, null, rollSeed(n, 'team reserve')]); a.ids.push(n); }
  }
  return L;
}

function indexOf(L, addr) {
  if (!L._index) Object.defineProperty(L, '_index', { value: new Map(L.wallets.map((w, i) => [w, i])), enumerable: false });
  const a = (addr || '').toLowerCase();
  if (!L._index.has(a)) { L._index.set(a, L.wallets.length); L.wallets.push(a); }
  return L._index.get(a);
}
const sec = (L, ms) => Math.round((ms - L.start) / 1000);
const account = (L, wi) => (L.acct[wi] ||= { usd: 0, credits: 0, tin: 0, tout: 0, bal: null, ids: [] });

// When Blocky #n becomes a citizen (ms): `citizenDays` after it arrived, and not before trading opens
// (Infinity until then).
export const citizenAt = (L, n, cfg) =>
  Math.max(L.start + (L.blockies[n - 1][1] + (cfg.citizenDays ?? 0) * 86400) * 1000, L.openedAt ?? Infinity);

// How many of a wallet's bought Blockies in the city are citizens at `at` (ms). Its granted ones (the
// team's reserve) are the first `grant` of its ids.
export function citizensOf(L, a, at, cfg) {
  let c = 0;
  for (let i = a.grant || 0; i < a.ids.length; i++) if (citizenAt(L, a.ids[i], cfg) <= at) c++;
  return c;
}

// How many Blockies a wallet may keep: its grant (the team's reserve) and its `citizens` for good, plus
// the newcomers its $BLOCKY still covers (what it holds, at what it paid per Blocky on average), never
// more than its buys earned.
export function allowance(a, citizens = 0) {
  const grant = a.grant || 0, earned = Math.floor((a.credits || 0) + 1e-9);
  if (!(a.tin > 0) || earned === 0) return grant;
  let held = a.tin - a.tout;
  if (a.bal != null) held = Math.min(held, a.bal); // tokens moved away count as sold
  const covered = Math.floor((earned * Math.max(0, held)) / a.tin + 0.01);
  return grant + Math.min(earned, citizens + covered);
}

function rebalance(L, at, cfg, touched, source) {
  const added = {}, left = {}, s = sec(L, at);
  if (L.openedAt == null && cfg.unlockUsd > 0 && L.bought >= cfg.unlockUsd) L.openedAt = at; // trading opens
  // 1. wallets that sold lose their newest newcomers (citizens and the reserve stay)
  for (const wi of touched) {
    const a = L.acct[wi], keep = allowance(a, citizensOf(L, a, at, cfg));
    while (a.ids.length > keep) {
      let k = a.ids.length - 1;
      while (k >= (a.grant || 0) && citizenAt(L, a.ids[k], cfg) <= at) k--;
      if (k < (a.grant || 0)) break;
      const [n] = a.ids.splice(k, 1);
      L.blockies[n - 1][2] = s;
      L.departures.push([n, s]);
      left[wi] = (left[wi] || 0) + 1;
    }
    if (a.ids.length < keep && !L.waiting.includes(+wi)) L.waiting.push(+wi);
  }
  // 2. free places go to wallets owed Blockies, first come first served
  let active = L.blockies.length - L.departures.length;
  while (L.waiting.length && active < cfg.supply) {
    const wi = L.waiting[0], a = L.acct[wi];
    if (a.ids.length >= allowance(a, citizensOf(L, a, at, cfg))) { L.waiting.shift(); continue; }
    const n = L.blockies.length + 1;
    L.blockies.push([wi, s, null, rollSeed(n, source)]);
    a.ids.push(n);
    added[wi] = (added[wi] || 0) + 1;
    active++;
  }
  return { added, left };
}

// t: { who, kind: 'buy' | 'sell', usd, tokens, at, tx, block }
export function applyTrade(L, t, cfg) {
  const wi = indexOf(L, t.who), a = account(L, wi);
  if (t.kind === 'buy') {
    a.usd += t.usd; a.credits = (a.credits || 0) + t.usd / cfg.per; a.tin += t.tokens; L.bought += t.usd;
    if (a.bal != null) a.bal += t.tokens; // the last balance check, kept current until the next
    if (t.usd >= cfg.whaleUsd) L.whales.push({ from: L.wallets[wi], usd: cents(t.usd), at: t.at, tx: t.tx });
  } else {
    a.tout += t.tokens;
    if (a.bal != null) a.bal = Math.max(0, a.bal - t.tokens);
  }
  const { added, left } = rebalance(L, t.at, cfg, [String(wi)], t.block || t.tx || t.at);
  // a buy may also hand places to wallets that were waiting: report this wallet's share
  L.recent = [{ from: L.wallets[wi], kind: t.kind, usd: cents(t.usd), at: t.at, tx: t.tx, blockies: added[wi] || 0, left: left[wi] || 0 }, ...L.recent].slice(0, 12);
}

// balances: { address: tokens held now }. Wallets that moved tokens away lose Blockies too.
// source: the hash of the block the balances were read at (seeds any Blocky handed out now).
export function applyBalances(L, balances, at, cfg, source = at) {
  const touched = [];
  for (const [addr, bal] of Object.entries(balances)) {
    const wi = indexOf(L, addr);
    if (!L.acct[wi]) continue;
    L.acct[wi].bal = bal;
    touched.push(String(wi));
  }
  return rebalance(L, at, cfg, touched, source);
}

// Wallets that hold Blockies or are owed some (for balance checks).
export const holders = (L) => Object.entries(L.acct).filter(([, a]) => a.ids.length || a.tin > a.tout).map(([wi]) => L.wallets[wi]);

// A wallet's Blockies: in the city now, and the ones that left.
export function walletBlockies(L, addr) {
  const wi = L.wallets.indexOf((addr || '').toLowerCase());
  if (wi < 0) return { active: [], left: [] };
  const active = [], left = [];
  L.blockies.forEach(([w, , l], i) => { if (w === wi) (l == null ? active : left).push(i + 1); });
  return { active, left };
}

// What clients get: everything after the first `since` Blockies and `dsince` departures.
export function snapshot(L, cfg, since = 0, dsince = 0) {
  const ms = (s) => (s == null ? null : L.start + s * 1000);
  return {
    price: cfg.per, // USD of $BLOCKY per Blocky
    minted: L.blockies.length - L.departures.length, // in the city now
    issued: L.blockies.length,
    departed: L.departures.length,
    supply: cfg.supply,
    waiting: L.waiting.length,
    since,
    dsince,
    blockies: L.blockies.slice(since).map(([wi, s, l, r]) => [L.wallets[wi], ms(s), ms(l), r ?? null]),
    departures: L.departures.slice(dsince).map(([n, s]) => [n, ms(s)]),
    whales: L.whales,
    boughtUsd: L.bought,
    recentBuys: L.recent,
    cityStart: L.start,
    unlockUsd: cfg.unlockUsd ?? null, // total bought that opens trading
    openedAt: L.openedAt ?? null, // when it did (ms)
    citizenDays: cfg.citizenDays ?? null, // from then: a Blocky's newcomer days, then a citizen (an NFT)
  };
}
