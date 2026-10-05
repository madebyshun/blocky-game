# BaseCity: a city built 24/7 by Blockies, the builders of Base

A live, watch-only voxel city tied to the `$BLOCKY` token on Base.

- **One buy = one Blocky**, flown in by blimp. The size of the buy decides who arrives:
  - **$5+**: a **Blocky**, 1–2× skill (more for bigger buys).
  - **$100+**: a **Base Builder**, 3–4× skill, in Base-blue uniform. Only a crew with a Base Builder can build towers, skyscrapers, the Ferris wheel, the roller coaster and the biggest landmarks.
  - **$1k+**: a **Whale**, 5× skill, gold hard hat, and a **Whale Fountain** wonder signed with its wallet that jumps the build queue.
  - Buys under $5 add up in a **community pot**; every full $5 brings a Blocky.
  Each Blocky remembers the wallet whose buy brought it, and every buy shows up in the city log.
- **Builds take time**: a crew shares one site, so speed grows with the square root of the crew's total skill (4× the skill = 2× faster). A cottage takes under an hour, a skyscraper most of a day. The HUD shows the time left and the next community goal.
- The city **starts from empty land**: grass, forest, a river. The founder builds the first garage, then the town square, then the city grows outward, roads appearing next to every new lot.
- ~30 building types by district: cottages, family houses, townhouses, apartments, villas, shops, cafés, offices, dev hubs, a school, GPU farms, towers, skyscrapers, wind turbines, water towers, farms, gardens, and leisure: a **roller coaster**, **Ferris wheel** and **carousel** (all animated), lake parks with ducks, flower gardens, playgrounds, skate parks, a public pool, soccer field, basketball court, concert stage and ice cream stand. Plus cars, buses and boats.
- **Legends**: real Base builders live in the city with hand-made looks: Blocky #1 is the founder, and the next Base Builders arrive as Nibel, Jesse (Builder 001), Xen, Poet, Brian (CEO), Saumya Saxena, Jerry Pan, Ahaan Raizada, Jeremy Grinberg, Jon Roethke, Kien Nguyen, Toady Hawk, mleejr, Kevin, deployer, David Tso, mrtdlgc, Quigley, DonJohnson, everythingempty, Cobie, statuette, Oxxbid and Joey, in that order. Add one line per builder to `legends` in `src/config.js`; give it a `wallet` and that wallet's own buy brings them. `gallery.html?only=legends` shows them all, `?only=Jesse,Ahaan Raizada` just those.
- Every other Blocky role has its own look: Founder (blue cap, gold badge), Smart Contract Dev (hard hat, hoodie, backpack), Frontend Dev (headphones), Designer (beret, scarf), Community (backwards cap, megaphone), Researcher (glasses, lab coat, clipboard).
- `gallery.html` (dev only) shows every design and Blocky side by side; `?only=blockies` or `?only=coaster,ferris` to zoom in.
- **The land is a square that expands**: when every lot is built, the Blockies reclaim a new ring of land, but only once enough Blockies live in the city (3, 6, 10, 16…). Until then the city waits, which is where new buys come in.
- Landmarks are built as the crew grows: Founder's Garage → Town Square → **Statue of Blockerty** (the city icon, on a riverside point, unlocked by the first buy) → gm Café → Builder HQ → … → Onchain Beacon.
- Day/night cycle, clouds drifting around the city, flocks of birds and river gulls (they sleep at night), a city log with exact completion times, and a "while you were away" recap.
- **Market weather**: the sky follows `$BLOCKY`'s 24h price change: storm with lightning (≤ -15%), rain, cloudy, sunny, and a fireworks bull run (≥ +15%). Base Builder buys fire a volley over the Statue of Blockerty, whales fire three. `?weather=storm` forces a look for recording.
- **Named districts**: 3×3-lot neighbourhoods are named after what was built there (Downtown, GPU Valley, Fun Pier, Builder Heights…) and labelled on the map.
- **BaseCity News**: a SimCity-style ticker with buys, completions, weather, City Hall notices and the builder of the day.
- **Base Airport** (community goal at 10 Blockies): runway, terminal, control tower, and a plane that lands and takes off on a loop.
- **What Base is building: AI agents and onchain stocks.**
  - **Base Stock Exchange** (community goal at 6 Blockies): columns, a live LED ticker on the frieze and a big board on the roof showing `$BLOCKY`'s price and 24h move, the token it trades against (NVDAc, priced from the pool) and any `STOCK_TOKENS`. A gold bull stands out front while `$BLOCKY` is up over 24h, a bear when it is down.
  - **AI Agent Hub** (community goal at 7 Blockies): a dark glass tower with glowing floors, server racks and a holographic agent head. It launches the city's **AI agent drones**, which pick up parcels and fly them over the rooftops to other buildings; every **AI Startup** adds two more. **Brokerages** carry the same live ticker.
  - The news ticker adds MARKETS (live quotes) and AGENTS (drones flying, parcels delivered) lines.
- **City services**: a Fire Station, Police Station, Hospital, Recycling Center and Solar Farm arrive early in every city (more as it grows). Each sends its vehicles out on the roads with flashing light bars: fire trucks, police cars, ambulances and garbage trucks.
- **BaseCity Metro** (community goal at 15 Blockies): an elevated loop over the ring road, on pillars between the car lanes. It rises piece by piece while the crew builds it, then a three-car train runs the loop and stops at a station on every side. The loop grows with the land. Set it in `metro` in `src/config.js`.
- **Billboards** on the Town Square, Builder HQ, the airport and some rooftops show Base projects (Coinbase Wallet, o1.exchange, Virtuals, bankrbot, Aero, logos drawn in code) plus one "YOUR PROJECT HERE" slot that sells the space. Edit `sponsors` in `src/config.js` (`{ name, tagline, color, logo?, url, sponsored? }`); clicking a board opens its link.
- **Photo mode** for screenshots and recordings: 📷 button or `P` hides the panels and holds the camera still (`Esc` to exit); `R` toggles auto-rotate (remembered). `?photo` / `?still` start that way.
- Same city for every visitor. No wallet needed. **The Blockies are simulated; the buys are real.**

## Run

```bash
npm install
cp .env.example .env.local   # then uncomment one fee source
npm run dev                  # http://localhost:5173, also serves /api/colony locally
npm run build
```

With no fee source in `.env.local`, the island shows one founder and $0 fees. Check `http://localhost:5173/api/colony`: with `FEE_WALLET` it returns a `breakdown` of every asset counted, so you can sanity-check the number before going live.

URL flags: `?demo` fakes 3 days of history and then a buy every 30s (with a Base Builder every 6th and a Whale at #14); `?speed=600` fast-forwards the city clock for timelapse videos; `?weather=bull` forces the weather; `?photo` starts in photo mode. Combine them: `/?demo&speed=600&photo`.

## Deploy (Vercel)

Import the repo; Vercel detects Vite and serves `api/colony.js` as a serverless function.

Environment variables (see `.env.example`):

| Var | What |
| --- | --- |
| `COUNT_MODE` | `buys` (default): one buy of `USD_PER_BLOCKY`+ brings one Blocky; the client picks its tier from the buy size (`tiers` in `src/config.js`). `fees`: creator fees instead. |
| `USD_PER_BLOCKY` | Default `5`. Keep in sync with `usdPerBlocky` in `src/config.js`. Smaller buys fill the community pot. |
| `MIN_BUY_USD` | Ignore dust buys (default $1). |
| `POOL_ID` | The BLOCKY/NVDAc Uniswap v4 pool. Buys are read from its public GeckoTerminal trade feed. |
| `STOCK_TOKENS` | Optional: comma-separated addresses of more tokenized stocks on Base for the Stock Exchange ticker. |
| `LAUNCH_TIME_MS` | When the city starts from empty land and buys start counting. Default: the first time the API runs. |
| `BACKFILL_HOURS` | Testing: also count buys from the last N hours (the feed covers ~24h). |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis (Vercel KV). **Required in production**: stores the running total and every Blocky's arrival so the city never shrinks and every visitor sees the same one. |
| `FEE_WALLET`, `EXCLUDE_TOKENS`, `BASE_RPC_URL`, `FEES_URL`, `FEES_USD_OVERRIDE`, `FEES_OFFSET_USD`, `FEE_TOKENS` | Only for `COUNT_MODE=fees`. |

## Customize

- `src/config.js`: city name, ticker, token links, buy tiers and skills, legends, billboards, `blocksPerHour`, day length, land size and expansion thresholds, landmark milestones.
- `src/sim.js`: Blocky roles and work rates, the river, the building catalog and the deterministic build plan (landmarks, buildings, land expansions).
- `src/city.js`: voxel designs, land/river/bridges, progressive roads, construction sites, day/night.
- `src/vehicles.js`: cars, buses, boats and service patrols; `src/fleet.js`: the service vehicles.
- `src/metro.js`: the elevated metro loop, its stations and the train.
- `src/agents.js`: the AI agent drones.
- `src/citizens.js`: builders walking the roads, hauling and placing blocks.

## How "24/7, same for every visitor" works

No game server. The crew's speed only changes when a Blocky arrives (`blocksPerHour × √(total skill)`), so total blocks placed is a piecewise-linear function of time. The city plan is a fixed, seeded sequence of buildings; each starts when the previous one is done and finishes once the crew has placed its cost in blocks. Any browser that knows the fee total and arrival times (from `/api/colony` + KV) computes the exact same skyline, including when each building was completed.
