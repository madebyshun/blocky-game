// The citizens' vote: what a wallet signs to vote, and the count. Shared by the vote page
// (src/vote.js) and the API (api/vote.js), so both agree on the exact message.
import { CONFIG } from './config.js';

export const ROUND = CONFIG.vote || null;
export const MAX_AGE = 10 * 60 * 1000; // a signed vote is good for 10 minutes

export const choiceOf = (id) => ROUND?.choices.find((c) => c.id === id) || null;
export const isOpen = (now = Date.now()) => Boolean(ROUND && now < Date.parse(ROUND.ends));

// The message a wallet signs (personal_sign / EIP-191): readable in the wallet, exact on the server.
export function voteMessage({ round = ROUND?.id, choice, address, time }) {
  const c = choiceOf(choice);
  return [`${CONFIG.cityName} citizens vote`, `Round: ${round}`, `Vote: ${c ? c.label : choice} (${choice})`, `Wallet: ${String(address).toLowerCase()}`, `Time: ${time}`, '', 'Each BaseCity Blocky you hold counts as one vote. Signing is free and sends no transaction.'].join('\n');
}

// votes: { tokenId: choiceId } -> { tally: { choiceId: count }, total, leader }
export function count(votes) {
  const tally = Object.fromEntries((ROUND?.choices || []).map((c) => [c.id, 0]));
  for (const v of Object.values(votes || {})) if (v in tally) tally[v]++;
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const leader = total ? Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0] : null;
  return { tally, total, leader };
}
