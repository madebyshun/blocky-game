// Replay the city from a colony state (same rules as the game) to know what every builder has built.
// Used by the pages around the city: Base Builders, Blockies, Claim.
import { cityCrew, makeBlocky, CitySim } from './sim.js';

export function replay(state) {
  const start = state?.cityStart ?? Date.now();
  const crew = cityCrew(start);
  const blockies = (state?.blockies || []).map(([from, at, left, seed], i) => {
    const b = makeBlocky(i + 1, Math.max(start, at ?? start), from, seed ?? null);
    if (left != null) b.leftAt = Math.max(b.arrivedAt, left);
    return b;
  });
  const sim = new CitySim(start);
  sim.setCrew([...crew, ...blockies], state?.whales || []);
  return { start, crew: [...crew, ...blockies], team: crew, blockies, sim, minted: state?.minted ?? 0 };
}
