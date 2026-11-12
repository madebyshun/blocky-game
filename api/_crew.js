// Street Crew (Blocky Street): every wallet that holds $10+ of Coinbase's stocks on Base and has been
// looked up on Blocky Street joins the crew. Every $10 of stock is one Blocky in a hard hat of its top
// stock's colour (at most CREW_PER_WALLET), building the street. Held CITIZEN_MS without dropping under
// $10, they are citizens of the street for good (a gold hat). Sell under $10 and the crew packs up.
// No dollar amounts leave the server: only tickers, the Blocky count and the dates.
export const CREW_USD = 10;
export const CREW_PER_WALLET = 5;
export const CITIZEN_MS = 24 * 3600e3;
export const RECHECK_MS = 6 * 3600e3; // a member's holdings are read again at most this often
export const RECHECK_PER_CALL = 6;

// the entry to keep for a wallet after reading its holdings (null: not on the crew, or off it now)
export function crewEntry(prev, { address, name, holdings }, now = Date.now()) {
  const usd = (holdings || []).reduce((a, h) => a + (h.usd || 0), 0);
  if (usd < CREW_USD) return null;
  return {
    a: address,
    name: name || prev?.name || null,
    since: prev?.since ?? now,
    checked: now,
    tickers: holdings.filter((h) => h.usd > 0).slice(0, 3).map((h) => h.ticker),
    blockies: Math.min(CREW_PER_WALLET, Math.floor(usd / CREW_USD)),
    usd: Math.round(usd), // server only: crewView never sends it; crewTotals sums it, rounded
  };
}

// the whole crew, for the board and the pitch: wallets, Blockies, citizens, and what they hold in all
// (rounded to $100, so no one wallet can be read back out of it)
export function crewTotals(entries, now = Date.now()) {
  const usd = entries.reduce((a, e) => a + (e.usd || 0), 0);
  return {
    wallets: entries.length,
    blockies: entries.reduce((a, e) => a + e.blockies, 0),
    citizens: entries.filter((e) => now - e.since >= CITIZEN_MS).length,
    usd: entries.length >= 3 ? Math.round(usd / 100) * 100 : null,
  };
}

// "go" clicks: a visitor leaving BaseCity to buy on Quadra (the kind of link, a counter per kind)
export const GO_KINDS = ['block', 'basket', 'city'];

// the members whose holdings are due a re-read, stalest first
export const dueForCheck = (entries, now = Date.now(), n = RECHECK_PER_CALL) =>
  entries.filter((e) => now - e.checked >= RECHECK_MS).sort((a, b) => a.checked - b.checked).slice(0, n);

// what the street shows: oldest members first (they've held longest)
export function crewView(entries, now = Date.now()) {
  return entries
    .slice()
    .sort((a, b) => a.since - b.since)
    .map((e) => ({
      label: e.name || `${e.a.slice(0, 6)}…${e.a.slice(-4)}`,
      a: e.a,
      tickers: e.tickers,
      blockies: e.blockies,
      citizen: now - e.since >= CITIZEN_MS,
      since: e.since,
    }));
}
