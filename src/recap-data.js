// One day of the city (24 h from its start), replayed from the colony state: shared by the recap page
// (src/recap.js) and its share image (api/recap.js), so both show the same numbers.
import { CONFIG } from './config.js';
import { TRAIT_LABEL } from './sim.js';
import { replay } from './replay.js';
import { who } from './names.js';

export const DAY = 86400e3;
const RANK = { legendary: 0, rare: 1, uncommon: 2, common: 3 };
const reserved = (b) => b.id <= (CONFIG.nft.reserve?.count || 0) && b.from === CONFIG.nft.reserve?.wallet?.toLowerCase();
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
export const usd = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
export const plus = (v) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(-v)}` : '±0');

// how many days the city has (the one under way included), and the day a recap shows by default: the
// last full one (the first, while it's under way)
export function dayCount(start, now = Date.now()) { return Math.max(1, Math.floor((now - start) / DAY) + 1); }
export const defaultDay = (days) => Math.max(1, days - 1);

export function recapOf(state, n, now = Date.now()) {
  const r = replay(state);
  const t0 = r.start + (n - 1) * DAY, t1 = Math.min(r.start + n * DAY, now);
  const { sim, blockies } = r;
  const here = (b, t) => b.arrivedAt <= t && !(b.leftAt <= t);
  const before = blockies.filter((b) => b.arrivedAt < t0 && !(b.leftAt <= t0)).length; // (the day's own arrivals count in its change)
  const after = blockies.filter((b) => here(b, t1)).length;
  const arrived = blockies.filter((b) => b.arrivedAt >= t0 && b.arrivedAt < t1);
  const left = blockies.filter((b) => b.leftAt >= t0 && b.leftAt < t1);
  sim.advance(t1);
  const done = sim.done.filter((p) => p.at >= t0 && p.at < t1);
  const best = arrived.filter((b) => b.rarity.id !== 'common').sort((a, b) => RANK[a.rarity.id] - RANK[b.rarity.id] || a.id - b.id);
  const workers = blockies.filter((b) => !reserved(b) && here(b, t1)).map((b) => [b, sim.blocksBy(b, t1) - sim.blocksBy(b, Math.max(t0, b.arrivedAt))]).sort((a, b) => b[1] - a[1]);
  const s = {
    n, t0, t1, live: t1 < r.start + n * DAY, start: r.start,
    inCity: after, net: after - before, arrived, left,
    buildings: sim.buildingCount, built: done.filter((p) => p.kind === 'building').length,
    blocks: sim.workAt(t1) - sim.workAt(t0), totalBlocks: sim.workAt(t1),
    landmarks: done.filter((p) => p.kind === 'landmark' || p.kind === 'metro'),
    whales: done.filter((p) => p.kind === 'wonder'),
    land: done.filter((p) => p.kind === 'expand'),
    legendary: arrived.filter((b) => b.rarity.id === 'legendary').length,
    rare: arrived.filter((b) => b.rarity.id === 'rare').length,
    stars: best.slice(0, 6), mvp: workers[0]?.[1] > 0 ? workers[0] : null,
    bought: state?.boughtUsd ?? 0,
  };
  // the milestones, as plain text lines
  // (whale builds, then Base projects' HQs, then the city's landmarks, then land)
  s.lines = [
    ...s.whales.map((p) => `${p.build === 'fountain' ? '⛲' : '🏙️'} ${p.whale.tier || 'Whale Fountain'} for ${who(p.whale.from, 20)} (${usd(p.whale.usd)})`),
    ...[...s.landmarks].sort((a, b) => Boolean(b.brand) - Boolean(a.brand)).map((p) => `🏛️ ${p.name}`),
    ...s.land.map((p) => `🌍 ${p.name}`),
  ];
  return s;
}

export const starLabel = (b) => `${b.rarity.label}${b.trait ? ` · ${TRAIT_LABEL[b.trait]}` : ''}`;

// the post for X
export function recapPost(s, link) {
  return `${CONFIG.cityName}: Day ${s.n} recap${s.live ? ' (so far)' : ''} 🏙\n\n`
    + `🧱 ${fmt(s.inCity)} Blockies in the city (${plus(s.net)})\n`
    + `🏢 ${fmt(s.built)} buildings finished · ${fmt(s.blocks)} blocks placed\n`
    + (s.landmarks.length ? `🏛️ ${s.landmarks.map((p) => p.name).join(', ')}\n` : '')
    + (s.whales.length ? `🐋 ${s.whales.length} whale build${s.whales.length > 1 ? 's' : ''}\n` : '')
    + (s.legendary || s.rare ? `✨ ${[s.legendary && `${s.legendary} Legendary`, s.rare && `${s.rare} Rare`].filter(Boolean).join(', ')} arrived\n` : '')
    + `🚶 ${fmt(s.left.length)} walked out\n\n${link}${CONFIG.xHandle ? ` · @${CONFIG.xHandle}` : ''}`;
}
