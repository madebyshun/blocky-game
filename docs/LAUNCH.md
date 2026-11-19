# Blocky Agent launch: checklist (2026-11-19)

Positioning: **your Blocky does jobs and earns USDC on Base.** Owner-controlled; payments go wallet to wallet.

## Live and verified
- 50 Blockies (#717–#766) each with their own ERC-8004 agent (on-chain `register`, tokenURI = agent card), all on duty.
- 12 skills in 5 guilds (Role → guild, Rarity → how many skills, paid work → level / price cap), strict per Blocky.
- Instant hire over x402 (CDP facilitator, charged only on a successful answer): basecity.space/api/x402, Blue Agent
  "Hire now" on app.blueagent.dev/agents (Workers) and the job form's "Get it now".
- Blue Agent job board → fleet worker (review mode, 7-day session); ERC-8004 feedback on paid unlocks (first one on chain).
- Payout wallet (owner-signed EOA) so payers see no "flagged address" warning.
- Pages: /agents (setup, review, fleet, prices, payout, FAQ), x402 HQ in the city, /metrics (public numbers).

## Before announcing
- [ ] Owner sets a payout EOA on /agents, then one Hire on app.blueagent.dev shows no Blockaid warning.
- [ ] Mobile pass: /agents, /metrics, x402 HQ popup, Blue's Hire modal.
- [ ] One paid call per guild (Market, Security ✓, Builder ✓, Agents, Creative) so every guild has a real example.
- [ ] x402 Bazaar: the hourly scan confirms a BaseCity route (x402 HQ shows "Listed on the x402 Bazaar").
- [ ] First outside payer (not a team wallet): /metrics "outside payers" > 0.

## Launch content (write when asked)
- [ ] Launch post + X thread: real tx links, /metrics, x402 HQ clip, "Hire a Blocky".
- [ ] Stocks Maxxing submission, Agentic Stock Finance track, deadline 2026-12-05.

## Numbers at launch prep (all team tests)
6 paid x402 calls, $0.065; Security 3, Market 2, Builder 1. Earlier: 1 paid Blue Agent job ($0.10, NVDA NAV premium),
before the metrics counter existed. Source of truth: GET /api/work-feed?metrics=1.
