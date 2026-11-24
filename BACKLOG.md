# BaseCity backlog

Ideas agreed on, to build later.

## Builder Circle (Buildboard) data in the city
Data: builder-circle.xyz `/api/leaderboard?window=7d&metric=wtu`, `/api/movers`, `/api/live`, `/api/app/{code}`.
Ask @altagers first (permission, rate limits) and credit "Data: Builder Circle".
1. **Base Pulse** (first): Base-wide 7d users / tx / apps on the Stock Exchange board and the ticker; city lights follow users week over week. Proxy through `/api/buildboard`, cached 30–60 min, render-only (no sim change).
2. **Buildboard District**: one tower per app, height = 7d `wtu`. Only apps with a name / `app_verified` (the top rows were unnamed builder codes, 4 of the top 5 from one owner).
3. **Movers** on the city log once `/api/movers` returns climbers / fallers (history ready from 2026-10-14).
4. **BaseCity on Buildboard**: register a builder code, buy $BLOCKY in-site with it attached, so BaseCity ranks on Buildboard.

## Blocky Phone (after Stocks Maxxing)
- Phone entry points are disabled for the submission. Resume with the phone prototype in `src/blocky-phone.js` and verify live market coverage, wallet balance states, and chat interactions before enabling it again.
- Keep the submission focused on the existing Blocky Street, Stock Towers, Trade Dock, and stock research.

## Venice Campanile
- **First: VVV Market Board.** Add a small board to the existing Campanile on Base Avenue (plot 17). Show VVV price, 24h change, and update time. Press E to open the existing Venice dossier with pool liquidity and a source link. Use a verified VVV pool on Base and cache the quote server-side. Mark stale data and show unavailable fields as a dash.
- **Next: read-only wallet position.** For a connected Base wallet, show its VVV and verified staking position. Link to Venice's official token dashboard to manage staking. Keep market activity and wallet data distinct.
- **Later: Venice Studio Hub.** Start with Premiere Your HQ. Bring a BaseCity photo or voxel PFP into the Campanile, make a poster with the Venice API, then turn the chosen poster into a short video. Let creators download drafts or submit work to a billboard or the Cinema. Quote video generation before submission and persist queue IDs. Explore DIEM-backed inference after measuring usage and confirming how users can authorize a budget.
- References: [Venice token dashboard](https://venice.ai/token), [VVV and DIEM](https://docs.venice.ai/overview/vvv-diem), [Video generation](https://docs.venice.ai/guides/media/video-generation).

## Cinema
- Community submissions: X link + review queue (KV), then holder-signed submissions and votes.

## Halloween (from 24/10)
- Spooky mode (render-only, dated), Haunted District on ruins, Horror Night at the cinema, Trick or Treat, Halloween outfit for buys that week.

## NFT / PFP
- PFP Studio (accessories unlocked by behavior), Find yourself in BaseCity, dynamic NFT art, seasonal traits, collab accessories (with each project's ok).

## Launchpad (research first)
- Front end over an existing Base launchpad, pair with $BLOCKY, fees to buyback; no user-made pools with tokenized stocks.
