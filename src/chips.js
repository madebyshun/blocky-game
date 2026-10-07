// BaseCity's chip economy: the Chip Fab (Base Avenue plot 15) turns silicon into chips, and the city's
// tech buildings need chips to switch on. Derived from the city like everything else (the same for
// every visitor, replayed from the ledger) and only from CONFIG.chips.from on, so the past never changes:
// - silicon: a crate with every Blocky someone buys (the team's don't count), and the Fab's river
//   dredge once it stands;
// - power: the Fab runs as fast as the grid allows, a base plus every windmill and solar farm in town;
// - chips go to the tech buildings finished since, first come first served; one without its chips yet
//   stands dark, "waiting for chips" (nothing stops building, homes never wait);
// - the Power Plant's GPU gets an upgrade at every tier of chips made.
// In-game resources only: not tokens, they can't be traded or claimed.
import { CONFIG } from './config.js';

const HOUR = 3600000;
export const POWER_TYPES = new Set(['windmill', 'solarfarm']);
export const FAB = 'hq-fab'; // the Fab's landmark type (src/projects.js id 'fab')

// wallets whose Blockies the team got (reserve, grants): not buys, no silicon
export function teamWallets(nft = CONFIG.nft) {
  return new Set([nft?.reserve?.wallet, ...(nft?.grants || []).map((g) => g.wallet)].filter(Boolean).map((a) => a.toLowerCase()));
}

// done: completed projects ({ k, type, at }); standing: the k of every project standing (not a ruin);
// deliveries: the times silicon crates arrived (a bought Blocky each); fabAt: when the Fab was done
export function chipEconomy({ done, standing, deliveries, fabAt = Infinity, now, cfg = CONFIG.chips }) {
  const from = Date.parse(cfg.from);
  const out = { made: 0, used: 0, stock: 0, silicon: 0, rate: 0, limit: 'nofab', plants: 0, cap: 0, online: new Set(), waiting: [], tier: cfg.tiers[0], next: cfg.tiers[1] || null, fabAt };
  if (!(now > from)) return out;
  const events = [];
  for (const t of deliveries) if (t >= from && t <= now) events.push([t, 'si']);
  let plants = 0;
  for (const p of done) if (POWER_TYPES.has(p.type) && p.at <= now) { if (p.at <= from) plants++; else events.push([p.at, 'pw']); }
  if (fabAt > from && fabAt <= now) events.push([fabAt, 'fab']);
  events.sort((a, b) => a[0] - b[0]);
  let t0 = from, silicon = 0, made = 0;
  const run = (t1) => { // the Fab between two events: its pace, and the river dredge, steady
    const on = t0 >= fabAt, h = (t1 - t0) / HOUR;
    if (!on || h <= 0) return;
    const dredge = cfg.dredgePerHour, cap = Math.min(cfg.fabPerHour, cfg.powerBase + cfg.powerPerPlant * plants);
    if (cap <= dredge) { made += cap * h; silicon += (dredge - cap) * h; return; }
    const empty = silicon / (cap - dredge); // hours until the silicon runs out
    if (empty >= h) { made += cap * h; silicon -= (cap - dredge) * h; } else { made += cap * empty + dredge * (h - empty); silicon = 0; }
  };
  for (const [t, kind] of events) {
    run(t);
    t0 = t;
    if (kind === 'si') silicon += cfg.siliconPerBlocky;
    if (kind === 'pw') plants++;
  }
  run(now);
  // now: how fast, and what holds it back
  const on = now >= fabAt, cap = Math.min(cfg.fabPerHour, cfg.powerBase + cfg.powerPerPlant * plants);
  Object.assign(out, { made, silicon, plants, cap: on ? cap : 0 });
  if (on) {
    if (silicon > 0.5 || cfg.dredgePerHour >= cap) { out.rate = cap; out.limit = cap >= cfg.fabPerHour ? 'full' : 'power'; } else { out.rate = cfg.dredgePerHour; out.limit = 'silicon'; }
  }
  // the chips, to the tech buildings finished since `from`, in order (one waiting holds the line)
  let blocked = false;
  for (const p of done.filter((x) => cfg.cost[x.type] && x.at >= from && x.at <= now && standing.has(x.k)).sort((a, b) => a.at - b.at)) {
    const c = cfg.cost[p.type];
    if (!blocked && out.used + c <= made) { out.used += c; out.online.add(p.k); } else { blocked = true; out.waiting.push(p); }
  }
  out.stock = Math.max(0, made - out.used);
  const tiers = cfg.tiers;
  let i = 0;
  while (i + 1 < tiers.length && made >= tiers[i + 1][0]) i++;
  out.tier = tiers[i]; out.next = tiers[i + 1] || null;
  return out;
}
