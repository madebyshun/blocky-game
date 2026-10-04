# BaseCity: a city built 24/7 by builders on Base

A live, watch-only voxel city tied to the `$BLOCKY` token on Base.

- Every trade of `$BLOCKY` pays a creator fee.
- Every **$5** of fees brings a new **Builder** to the city (by blimp).
- Builders haul blocks from the depot to the construction site **24/7**: offices, dev hubs, towers, cafés and parks rise floor by floor. More builders, faster city.
- Landmarks unlock as the crew grows: Founder's Garage → gm Café → Builder HQ → … → Onchain Beacon.
- Day/night cycle, a city log with exact completion times, and a "while you were away" recap.
- Same city for every visitor. No wallet needed. **The builders are simulated; the fees are real.**

## Run

```bash
npm install
cp .env.example .env.local   # then uncomment one fee source
npm run dev                  # http://localhost:5173, also serves /api/colony locally
npm run build
```

With no fee source in `.env.local`, the island shows one founder and $0 fees. Check `http://localhost:5173/api/colony`: with `FEE_WALLET` it returns a `breakdown` of every asset counted, so you can sanity-check the number before going live.

URL flags: `?demo` fakes fee growth (a new builder about every 30s); `?speed=600` fast-forwards the city clock for timelapse videos. Combine them: `/?demo&speed=600`.

## Deploy (Vercel)

Import the repo; Vercel detects Vite and serves `api/colony.js` as a serverless function.

Environment variables (pick one fee source):

| Var | What |
| --- | --- |
| `FEE_WALLET` | Dedicated creator-fee wallet on Base. Counts ETH + WETH + USDC (Chainlink ETH/USD) plus `TOKEN_ADDRESS` and every token it is paired with (DexScreener prices). |
| `TOKEN_ADDRESS` | Default `0xE72A0C42b584a3E7A4503a82D1337dEB52adE885` ($BLOCKY). |
| `FEE_TOKENS` | Extra ERC20 addresses (comma-separated) in the fee wallet to count. |
| `EXCLUDE_TOKENS` | ERC20 addresses listed in the breakdown but not counted, e.g. `$BLOCKY` when the fee wallet is also the launch wallet holding supply. |
| `FEES_URL` | Any JSON endpoint returning `{ "feesUsd": number }` (Dune API, your own indexer, launchpad API). |
| `FEES_USD_OVERRIDE` | Fixed number, for pre-launch or testing. |
| `FEES_OFFSET_USD` | Added to the fee total: positive for fees already withdrawn, negative to subtract what the wallet held before launch. |
| `FEE_PER_CITIZEN` | Default `5`. Keep it in sync with `feePerCitizen` in `src/config.js`. |
| `BASE_RPC_URL` | Default `https://mainnet.base.org` (rate limits quickly). Use a free Alchemy/QuickNode URL. Each refresh is a single Multicall3 `eth_call`, cached for `CACHE_MS` (20s); on RPC errors the last good answer is served for up to 10 min. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis (Vercel KV). **Recommended.** Stores the fee high-water mark (population never shrinks when you withdraw) and each Blocky's arrival time (identical trade history for every visitor). |
| `LAUNCH_TIME_MS` | Arrival time of Blocky #1 (the founder). |

With no fee source configured, the API returns `$0` and one founder: "One crew member. No coin yet."

## Customize

- `src/config.js`: city name, ticker, token links, fee per builder, `cityStart` (when the founder started building), `blocksPerHour`, day length, landmark milestones.
- `src/sim.js`: builder roles and work rates, the deterministic city plan (which building goes on which lot, and its size).
- `src/city.js`: voxel designs for every building and landmark, construction sites, roads, day/night.
- `src/citizens.js`: builders walking the roads, hauling and placing blocks.

## How "24/7, same for every visitor" works

No game server. Each builder works at a fixed rate from the moment they arrive, so total blocks placed is `Σ rate × hours since arrival`. The city plan is a fixed, seeded sequence of buildings; the first `n` whose combined cost fits in that total are finished and the next one is under construction. Any browser that knows the fee total and arrival times (from `/api/colony` + KV) computes the exact same skyline, including when each building was completed.
