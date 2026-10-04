# BLOCKY: a floating island that grows with every trade

A live, watch-only voxel game tied to a Base token.

- Every trade of `$BLOCKY` pays a creator fee.
- Every **$5** of fees lands a new **Blocky** on the island (by airship).
- Every Blocky has a **job** (miner, farmer, lumberjack, builder, merchant) and its own **trading style** (scalper, breakout, degen, diamond hands…).
- Their trades are simulated. **The fees are real.**
- Buildings unlock as the population grows (farm → mine → market → … → castle).
- Same island for every visitor. No wallet needed.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 (no API locally → demo mode)
npm run build
```

Add `?demo` to any URL to force demo mode (fees grow by themselves, about one new Blocky every 30s). That's handy for recording launch videos.

## Deploy (Vercel)

Import the repo; Vercel detects Vite and serves `api/colony.js` as a serverless function.

Environment variables (pick one fee source):

| Var | What |
| --- | --- |
| `FEE_WALLET` | Dedicated creator-fee wallet on Base. Its ETH + WETH + USDC balance is valued with Chainlink ETH/USD onchain. |
| `FEES_URL` | Any JSON endpoint returning `{ "feesUsd": number }` (Dune API, your own indexer, launchpad API). |
| `FEES_USD_OVERRIDE` | Fixed number, for pre-launch or testing. |
| `FEES_OFFSET_USD` | Added to the fee total (e.g. fees you already withdrew). |
| `FEE_PER_CITIZEN` | Default `5`. Keep it in sync with `feePerCitizen` in `src/config.js`. |
| `BASE_RPC_URL` | Default `https://mainnet.base.org`. Use Alchemy/QuickNode in prod. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis (Vercel KV). **Recommended.** Stores the fee high-water mark (population never shrinks when you withdraw) and each Blocky's arrival time (identical trade history for every visitor). |
| `LAUNCH_TIME_MS` | Arrival time of Blocky #1 (the founder). |

With no fee source configured, the API returns `$0` and one founder: "One crew member. No coin yet."

## Customize

- `src/config.js`: name, ticker, fee per citizen, buy link, X handle, unlock milestones.
- `src/sim.js`: jobs, trading styles, deterministic trade simulation.
- `src/world.js`: island generation and every voxel building.
- `src/citizens.js`: Blocky characters, walking and work routes, floating PnL labels.

## How "same for every visitor" works

No game server. Each Blocky's job, style and every trade come from a seeded hash of `(id, trade index)`. Trade `k` happens at `arrivedAt + k × interval`. Any browser that knows the fee total and arrival times computes the exact same colony.
