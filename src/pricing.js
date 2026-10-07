// Suggested NFT prices (in ETH) for the claim page: the collection's floor on OpenSea times a rarity
// multiplier, never below the cost of earning a Blocky ($`anchorUsd` of $BLOCKY held a while). With no
// floor yet: `fallbackUsd` worth of ETH. Shared by the API (api/_market.js) and its test.
import { rarityOf } from './sim.js';

export const PRICING = {
  mult: { common: 1, uncommon: 2, rare: 5, legendary: 20 },
  special: 1.4, // a number people collect (see specialNumber)
  anchorUsd: 12, // about what earning one costs: $10 of $BLOCKY, swap fees, gas
  fallbackUsd: 15, // the floor to suggest before the collection has one
  lowWarn: 0.75, // a listing under this share of the suggestion gets a warning
  days: 7, // suggested listing length: an old price expires instead of getting sniped
};

// #101 (the first Blocky bought, after the team's reserve), 111, 2222, 1000, 420, 777...
export function specialNumber(n, reserveCount = 100) {
  if (n === reserveCount + 1) return true;
  if (n >= 11 && /^(\d)\1+$/.test(String(n))) return true;
  if (n >= 1000 && n % 1000 === 0) return true;
  return [69, 420, 777, 1337].includes(n);
}

const roundUp = (eth) => Math.ceil(eth * 1e4) / 1e4; // 0.0001 ETH steps

// The suggested price of Blocky #n (rolled with `seed`), or null when there's nothing to go by.
export function suggestEth(n, seed, { floor = null, ethUsd = null, reserveCount = 100 } = {}) {
  const anchor = ethUsd > 0 ? PRICING.anchorUsd / ethUsd : 0;
  const base = floor > 0 ? Math.max(floor, anchor) : ethUsd > 0 ? PRICING.fallbackUsd / ethUsd : null;
  if (!base) return null;
  const { rarity } = rarityOf(n, seed);
  return roundUp(base * (PRICING.mult[rarity.id] ?? 1) * (specialNumber(n, reserveCount) ? PRICING.special : 1));
}
