# BaseCity: a city built 24/7 by Blockies, the builders of Base

A live, watch-only voxel city tied to the `$BLOCKY` token on Base.

- Every **$5 of `$BLOCKY` bought** brings a new **Blocky** (a builder on Base) to the city by blimp. Each Blocky remembers the wallet whose buy brought it, and every buy shows up in the city log.
- The city **starts from empty land**: grass, forest, a river. The founder builds the first garage, then the town square, then the city grows outward, roads appearing next to every new lot.
- ~20 building types by district: cottages, family houses, townhouses, apartments, villas, shops, cafés, offices, dev hubs, a school, GPU farms, towers, skyscrapers, parks, playgrounds, courts, gardens, farms, wind turbines, water towers. Plus cars, buses and boats.
- **The land is a square that expands**: when every lot is built, the Blockies reclaim a new ring of land, but only once enough Blockies live in the city (3, 6, 10, 16…). Until then the city waits, which is where new trades come in.
- Landmarks are built as the crew grows: Founder's Garage → Town Square → gm Café → Builder HQ → … → Onchain Beacon.
- Day/night cycle, a city log with exact completion times, and a "while you were away" recap.
- Same city for every visitor. No wallet needed. **The Blockies are simulated; the buys are real.**

## Run

```bash
npm install
cp .env.example .env.local   # then uncomment one fee source
npm run dev                  # http://localhost:5173, also serves /api/colony locally
npm run build
```

With no fee source in `.env.local`, the island shows one founder and $0 fees. Check `http://localhost:5173/api/colony`: with `FEE_WALLET` it returns a `breakdown` of every asset counted, so you can sanity-check the number before going live.

URL flags: `?demo` fakes fee growth (a new Blocky about every 30s); `?speed=600` fast-forwards the city clock for timelapse videos. Combine them: `/?demo&speed=600`.

## Deploy (Vercel)

Import the repo; Vercel detects Vite and serves `api/colony.js` as a serverless function.

Environment variables (see `.env.example`):

| Var | What |
| --- | --- |
| `COUNT_MODE` | `buys` (default): every `USD_PER_BLOCKY` of `$BLOCKY` bought brings a Blocky. `fees`: creator fees instead. |
| `USD_PER_BLOCKY` | Default `5`. Keep in sync with `usdPerBlocky` in `src/config.js`. |
| `MIN_BUY_USD` / `MAX_USD_PER_BUY` | Ignore dust buys (default $1); cap one buy's credit (default $100 = 20 Blockies). |
| `POOL_ID` | The BLOCKY/NVDAc Uniswap v4 pool. Buys are read from its public GeckoTerminal trade feed. |
| `LAUNCH_TIME_MS` | When the city starts from empty land and buys start counting. Default: the first time the API runs. |
| `BACKFILL_HOURS` | Testing: also count buys from the last N hours (the feed covers ~24h). |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis (Vercel KV). **Required in production**: stores the running total and every Blocky's arrival so the city never shrinks and every visitor sees the same one. |
| `FEE_WALLET`, `EXCLUDE_TOKENS`, `BASE_RPC_URL`, `FEES_URL`, `FEES_USD_OVERRIDE`, `FEES_OFFSET_USD`, `FEE_TOKENS` | Only for `COUNT_MODE=fees`. |

## Customize

- `src/config.js`: city name, ticker, token links, fee per Blocky, `blocksPerHour`, day length, land size and expansion thresholds, landmark milestones.
- `src/sim.js`: Blocky roles and work rates, the river, the building catalog and the deterministic build plan (landmarks, buildings, land expansions).
- `src/city.js`: voxel designs, land/river/bridges, progressive roads, construction sites, day/night.
- `src/vehicles.js`: cars, buses and boats.
- `src/citizens.js`: builders walking the roads, hauling and placing blocks.

## How "24/7, same for every visitor" works

No game server. Each builder works at a fixed rate from the moment they arrive, so total blocks placed is `Σ rate × hours since arrival`. The city plan is a fixed, seeded sequence of buildings; the first `n` whose combined cost fits in that total are finished and the next one is under construction. Any browser that knows the fee total and arrival times (from `/api/colony` + KV) computes the exact same skyline, including when each building was completed.
