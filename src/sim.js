// Deterministic citizen simulation. Every visitor computes the exact same
// jobs, trading styles and trade history from (citizen id, arrival time),
// so the colony looks identical for everyone without a game server.

export const START_BALANCE = 5;

export function hash(...xs) {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h ^= Math.imul((x | 0) ^ 0x85ebca6b, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export const JOBS = [
  { id: 'miner', label: 'Miner', hat: 0x5b6470, station: 'mine' },
  { id: 'farmer', label: 'Farmer', hat: 0xe8b04a, station: 'farm' },
  { id: 'lumberjack', label: 'Lumberjack', hat: 0xc0392b, station: 'sawmill' },
  { id: 'builder', label: 'Builder', hat: 0xf5c518, station: 'crane' },
  { id: 'merchant', label: 'Merchant', hat: 0x2e86de, station: 'market' },
];

// interval: seconds between trades. win: win probability.
// up/down: average % move on a win/loss. size: fraction of portfolio per trade.
export const STYLES = [
  { id: 'scalper', label: 'Scalper', interval: 45, win: 0.58, up: 0.6, down: 0.7, size: 0.5 },
  { id: 'breakout', label: 'Breakout', interval: 180, win: 0.36, up: 6, down: 2.5, size: 0.4 },
  { id: 'swing', label: 'Swing', interval: 420, win: 0.5, up: 4, down: 3.5, size: 0.5 },
  { id: 'diamond', label: 'Diamond Hands', interval: 900, win: 0.55, up: 8, down: 7, size: 0.9 },
  { id: 'degen', label: 'Degen', interval: 90, win: 0.3, up: 25, down: 10, size: 1 },
  { id: 'meanrev', label: 'Mean Reversion', interval: 240, win: 0.62, up: 2, down: 3, size: 0.5 },
  { id: 'momentum', label: 'Momentum', interval: 300, win: 0.45, up: 5, down: 3, size: 0.6 },
];

const NAMES = [
  'Pixel', 'Cubert', 'Nova', 'Brick', 'Mossy', 'Flint', 'Echo', 'Dot', 'Ziggy', 'Pebble',
  'Rusty', 'Juno', 'Bolt', 'Sprout', 'Cobble', 'Luna', 'Gizmo', 'Tofu', 'Rook', 'Sunny',
  'Basalt', 'Clay', 'Opal', 'Waffle', 'Nugget', 'Quartz', 'Bean', 'Fizz', 'Onyx', 'Maple',
];

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xf5d0a9];
const SHIRT = [0x3fa34d, 0x2e86de, 0xe67e22, 0x9b59b6, 0xe74c3c, 0x1abc9c, 0xf1c40f, 0x34495e];

export const REKT_BELOW = 0.1;

export function makeCitizen(id, arrivedAt) {
  const job = JOBS[Math.floor(hash(id, 11) * JOBS.length)];
  const style = STYLES[Math.floor(hash(id, 12) * STYLES.length)];
  const interval = style.interval * (0.75 + 0.5 * hash(id, 13)) * 1000;
  return {
    id,
    name: `${NAMES[Math.floor(hash(id, 14) * NAMES.length)]} #${id}`,
    job,
    style,
    interval,
    arrivedAt,
    skin: SKIN[Math.floor(hash(id, 15) * SKIN.length)],
    shirt: SHIRT[Math.floor(hash(id, 16) * SHIRT.length)],
    // trade state, advanced lazily
    k: 0,
    portfolio: START_BALANCE,
    wins: 0,
    best: 0,
    last: null,
  };
}

// Advance a citizen's trade history up to time `now` (ms).
// Returns the trades that happened, newest last (capped to avoid floods).
export function advance(c, now, collect = true) {
  const due = Math.floor((now - c.arrivedAt) / c.interval);
  const events = [];
  const s = c.style;
  while (c.k < due) {
    if (c.portfolio < REKT_BELOW) break; // rekt citizens stop trading
    const k = c.k++;
    const won = hash(c.id, k, 21) < s.win;
    const mag = (won ? s.up : s.down) / 100 * (0.4 + 1.2 * hash(c.id, k, 22));
    const pnl = c.portfolio * s.size * (won ? mag : -mag);
    c.portfolio = Math.max(0, c.portfolio + pnl);
    if (won) c.wins++;
    if (pnl > c.best) c.best = pnl;
    c.last = { pnl, at: c.arrivedAt + (k + 1) * c.interval };
    if (collect && events.length < 3) events.push({ citizen: c, pnl, at: c.last.at });
  }
  return events;
}

export function stats(c) {
  return {
    portfolio: c.portfolio,
    profit: c.portfolio - START_BALANCE,
    trades: c.k,
    winRate: c.k ? c.wins / c.k : 0,
    rekt: c.portfolio < REKT_BELOW,
  };
}
