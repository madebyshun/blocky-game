# BaseCity: a city built 24/7 by Blockies, the builders of Base

A live, watch-only voxel city tied to the `$BLOCKY` token on Base.

- **Every $10 = 1 Blocky.** Every $10 of `$BLOCKY` a wallet buys (added up per wallet) brings one Blocky to the city by blimp (`usdPerBlocky` in `src/config.js`; each buy counts at the price of its day, so changing it only affects later buys): Blocky #1, #2, ... with at most **10,000** in the city at once. Each Blocky is an NFT its wallet claims (**BaseCity Blockies, BCB**, see below). Big buys arrive in batches. A single buy of $1,000+ also builds a **Whale Fountain** signed with the wallet, and jumps the build queue.
- **Hold to stay.** A wallet keeps the share of its Blockies that matches the share of its bought `$BLOCKY` it still holds: sell half and its newest half leave the city (tokens moved away count as sold). Freed places go to the next wallets in line (a waitlist once the city is full). Once the NFT collection unlocks, Blockies stay for good.
- **Builds take time**: a crew shares one site, so speed grows with the square root of the crew's total skill (4× the skill = 2× faster), and bigger buildings take longer by tier (`buildTime` in `src/config.js`: ×3 small, ×4 mid, ×5 large, ×6 towers and skyscrapers; landmarks, fountains, land and the metro have their own). With ~100 Blockies a cottage takes ~25 min, apartments ~4 h, a skyscraper ~1.5 days. The HUD shows the time left, the next community goal and how many of the 10,000 Blockies are left. Land expansions and landmarks unlock at Blocky counts (10, 30, 75, … for land; 15 for Builder HQ, 100 for the airport, 200 for the metro, …). Up to ~120 Blockies walk the streets at once (the founder, the Base Builders, the first 20 OGs, every Legendary and the newest arrivals); all of them build.
- The city **starts from empty land**: grass, forest, a river. The founder builds the first garage, then the town square, then the city grows outward, roads appearing next to every new lot.
- ~30 building types by district: cottages, family houses, townhouses, apartments, villas, shops, cafés, offices, dev hubs, a school, GPU farms, towers, skyscrapers, wind turbines, water towers, farms, gardens, and leisure: a **roller coaster**, **Ferris wheel** and **carousel** (all animated), lake parks with ducks, flower gardens, playgrounds, skate parks, a public pool, soccer field, basketball court, concert stage and ice cream stand. Plus cars, buses and boats.
- **Base Builders**: real Base builders you add by hand build the city from day one with hand-made looks: the Founder, then Jesse (Builder 001), Nibel, Xen, Poet, Brian (CEO), Saumya Saxena, Jerry Pan, Ahaan Raizada, Jeremy Grinberg, Jon Roethke, Kien Nguyen, Toady Hawk, mleejr, deployer, David Tso, mrtdlgc, Quigley, DonJohnson, everythingempty, Cobie, statuette, Oxxbid and Joey. Add one line per builder to `legends` in `src/config.js` (`joined: 'YYYY-MM-DD'` to start later). `gallery.html?only=legends` shows them all, `?only=Jesse,Ahaan Raizada` just those.
- **Rare Blockies**: every Blocky rolls a rarity from its number and the block hash of the buy that brought it (`rollSeed` in `src/ledger.js`), so nobody can know or snipe a rare number before buying and anyone can check it afterwards: Common 70%, Uncommon 22% (Shades, Base Cap), Rare 7% (Gold Hard Hat, Laser Eyes, Astronaut), Legendary 1% (Diamond Skin, Crown). Rare ones walk the city, get a toast and fireworks when they arrive, and show on their card and PFP. Odds live in `rarity` in `src/config.js`; `gallery.html?only=rare` shows them.
- **Base Builders page** (`/builders.html`, linked from the HUD): every Base Builder's profile with a voxel PFP, title, live stats (hours building, blocks placed, share of the city, skill, building since) in a profile you can link to (`/builders.html#jesse`) and share on X, and a **Download PFP** button (1024×1024 PNG with a small BaseCity tag). Clicking any Blocky in the city shows its PFP too, so every buyer can download the Blocky their buy brought. Add `x` (handle) or `bg` (PFP colour) to a legend in `src/config.js`.
- Every other Blocky role has its own look: Founder (blue cap, gold badge), Smart Contract Dev (hard hat, hoodie, backpack), Frontend Dev (headphones), Designer (beret, scarf), Community (backwards cap, megaphone), Researcher (glasses, lab coat, clipboard).
- `gallery.html` (dev only) shows every design and Blocky side by side; `?only=blockies` or `?only=coaster,ferris` to zoom in.
- **Zones, like SimCity**: buildings follow rings around Town Square: Downtown (towers, offices), Midtown (apartments, shops, parks), Suburbs (Suburban Homes: four houses with yards; family houses, villas, schools), Outskirts (farms, wind, solar). Industry gathers in a park on the east bank; some lots from ring 3 out stay forest for good (`isReserve` in `src/sim.js`) and get named woods districts. Weights per zone live in `CATALOG` (`w: [downtown, midtown, suburbs, outskirts]`).
- **Never finished**: when the land is full and there aren't enough Blockies for the next ring, the crew redevelops: the oldest home, shop or office comes down and something at least as big for its zone goes up (cottages downtown become apartments, then towers; top-tier buildings are only renewed once nothing else can grow). New land, landmarks and whale fountains still come first. `CitySim.redevelop` in `src/sim.js`; `npm test` checks the crew never runs out of work.
- **The land is a square that expands**: when every lot is built, the Blockies reclaim a new ring of land, but only once enough Blockies live in the city (10, 30, 75, 150…, `expandNeeds` in `src/config.js`). Until then the city waits, which is where new buys come in.
- Landmarks are built as the crew grows: Founder's Garage → Town Square → **Statue of Blockerty** (the city icon, on a riverside point, unlocked by the first buy) → gm Café → Builder HQ → … → Onchain Beacon.
- The city sits in open countryside (crop fields, farms, woods, the river running on past the city limits, highways into town) that fades into haze; no floating island.
- Day/night cycle, clouds drifting high over the countryside, flocks of birds and river gulls (they sleep at night), a city log with exact completion times, and a "while you were away" recap.
- **Market weather**: the sky follows `$BLOCKY`'s 24h price change: storm with lightning (≤ -15%), rain, cloudy, sunny, and a fireworks bull run (≥ +15%). Buys of 10+ Blockies fire a volley over the Statue of Blockerty, whales fire three. `?weather=storm` forces a look for recording.
- **Named districts**: 3×3-lot neighbourhoods are named after what was built there (Downtown, GPU Valley, Fun Pier, Builder Heights…) and labelled on the map.
- **BaseCity News**: a SimCity-style ticker with buys, completions, weather, City Hall notices and the builder of the day.
- **Base Airport** (community goal at 100 Blockies): runway, terminal, control tower, and a plane that lands and takes off on a loop.
- **What Base is building: AI agents and onchain stocks.**
  - **Base Stock Exchange** (community goal at 25 Blockies): columns, a live LED ticker on the frieze and a big board on the roof showing `$BLOCKY`'s price and 24h move, the token it trades against (NVDAc, priced from the pool) and any `STOCK_TOKENS`. A gold bull stands out front while `$BLOCKY` is up over 24h, a bear when it is down.
  - **AI Agent Hub** (community goal at 40 Blockies): a dark glass tower with glowing floors, server racks and a holographic agent head. It launches the city's **AI agent drones**, which pick up parcels and fly them over the rooftops to other buildings; every **AI Startup** adds two more. **Brokerages** carry the same live ticker.
  - The news ticker adds MARKETS (live quotes) and AGENTS (drones flying, parcels delivered) lines.
- **City services**: a Fire Station, Police Station, Hospital, Recycling Center and Solar Farm arrive early in every city (more as it grows). Each sends its vehicles out on the roads with flashing light bars: fire trucks, police cars, ambulances and garbage trucks.
- **BaseCity Metro** (community goal at 200 Blockies): an elevated loop over the ring road, on pillars between the car lanes. It rises piece by piece while the crew builds it, then a three-car train runs the loop and stops at a station on every side. The loop grows with the land. Set it in `metro` in `src/config.js`.
- **Billboards** on the Town Square, Builder HQ, the airport and some rooftops show Base projects (Coinbase Wallet, o1.exchange, Virtuals, bankrbot, Aero, logos drawn in code) plus one "YOUR PROJECT HERE" slot that sells the space. Edit `sponsors` in `src/config.js` (`{ name, tagline, color, logo?, url, sponsored? }`); clicking a board opens its link.
- **Camera**: drag to rotate, scroll or pinch to zoom, shift+drag / right-drag / two fingers to move around the city; the view stays where you leave it.
- **Photo mode** for screenshots and recordings: 📷 button or `P` hides the panels and holds the camera still (`Esc` to exit); The camera holds still by default; `R` or ⟳ turns a slow auto-rotate on (remembered). `?photo` starts in photo mode, `?spin` / `?still` force rotation on / off.
- Same city for every visitor. No wallet needed to watch. The buys are real, read onchain; nothing is faked.

## Pages

| Page | What |
| --- | --- |
| `/` | The city, live. Click any Blocky for its card, PFP and NFT page. |
| `/collection.html` | **The Blockies**: every Blocky with filters (rarity, trait, in the city / left), search by #number, name or wallet, top holders, and a card per Blocky (`/collection.html#206`) with its NFT portrait, stats, PNG download and OpenSea / Basescan links. |
| `/claim.html` | **Claim**: connect the wallet that bought (browser wallets via EIP-6963, Coinbase Smart Wallet / Base App via the Coinbase Wallet SDK), see its Blockies, claim them 50 per transaction. The buyer pays the gas. `?address=0x…` opens a wallet. |
| `/builders.html` | **Base Builders**: profiles, live stats and downloadable voxel PFPs. |
| `/about.html` | **How it works**: the rules, rarity odds, goals, contracts, FAQ. |
| `/deploy.html` | Owner tool (not linked): deploys the NFT contract from your browser wallet. |

## The NFT: BaseCity Blockies (BCB)

`contracts/BaseCityBlockies.sol`: ERC-721 + ERC-2981 (5% royalty to the treasury) + ERC-4906, OpenZeppelin 5.

- **Token id = Blocky number.** The ledger (`src/ledger.js`, run by `api/colony.js`) decides which wallet brought which Blocky. `api/claim.js` signs an EIP-712 claim for the wallet's unclaimed Blockies (it re-checks the wallet's `$BLOCKY` balance first); the wallet sends `claim(ids, evictIds, deadline, signature)` itself and pays the gas. Only the wallet named in the signature can use it; signatures last 30 minutes.
- **Max 10,000 at once** (`MAX_SUPPLY`, set at deploy).
- **Team reserve**: Blockies #1 to #100 belong to the team wallet from day one (`nft.reserve` in `src/config.js`, or `TEAM_RESERVE_WALLET` / `TEAM_RESERVE_COUNT`): claimable like any other, never sent away by the hold rule, counted in the 10,000, disclosed on the About page and as `Origin: Team reserve` in their metadata. Set the count to 0 for none.
- **Locked until 10,000 are claimed**: no transfers or approvals. While locked, a Blocky whose wallet sold leaves the city and, if it was claimed, is burned by the next claims (up to 20 per claim, `evictIds`); its number never comes back. The collection unlocks by itself at 10,000 (or the owner calls `unlock()`); from then on Blockies trade freely and none can be evicted, and the ledger stops applying the hold rule.
- **Metadata** from `api/nft/[id].js`: `/api/nft/206` (name, rarity, trait, role, status, blocks placed, arrival date), `/api/nft/206.svg` (the portrait, drawn from the same 3D model by `src/voxel-svg.js`, cached for a year), `/api/nft/collection` (contractURI).
- Owner functions: `setSigner`, `setBaseURI` (also asks marketplaces to refresh, ERC-4906), `setContractURI`, `setRoyalty`, `evict` (locked only), `unlock`.
- Build and test: `cd contracts && npm install && npm test` compiles (solc 0.8.26, Cancun), runs the contract tests on an in-memory Base and an end-to-end test of the claim and metadata APIs against it. `contracts/out/` holds the artifact (ABI + bytecode, used by `/deploy.html`) and the Standard JSON Input for Basescan verification.

## Run

```bash
npm install
cp .env.example .env.local
npm run dev                  # http://localhost:5173, also serves /api/colony, /api/claim and /api/nft/* locally
                             # (installs any dependency a git pull added before it starts)
npm run build
```

Locally the API reads trades from GeckoTerminal like production; without KV the ledger lives in memory and starts empty. If the live API is unreachable, the pages fall back to demo data.

URL flags: `?demo` fakes 3 days of history and then a trade every 30s (a $1,000 whale at 2 minutes, a seller at 3.5 minutes); `?speed=600` fast-forwards the city clock for timelapse videos; `?weather=bull` forces the weather; `?photo` starts in photo mode. Combine them: `/?demo&speed=600&photo`.

## Go live (fresh city, 0 / 10,000)

1. **Storage**: add Upstash Redis from the Vercel Marketplace (sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`). Required in production.
2. **Fresh start**: set `KV_KEY` to a new name (e.g. `basecity-v1`): a new key means a fresh ledger, so the city starts from empty land with only the team reserve (100 / 10,000, or 0 with no reserve) and only buys from now on count. Optionally set `LAUNCH_TIME_MS` (ms timestamp) to the launch moment. Do not set `BACKFILL_HOURS`.
3. **RPC**: set `BASE_RPC_URL` to your own Base RPC (Alchemy, QuickNode, …): the API reads every trade's receipt (the real wallet, and the block hash that seeds rarity) and checks holders' balances.
4. **Deploy and open the site** once so the ledger starts (`/api/colony`).
5. **Contract**: open `/deploy.html` with the dev wallet (`0x8eBA…C34D`), click *Generate a signer key*, copy the key, deploy. Then in Vercel set `NFT_CONTRACT` (the new address), `CLAIM_SIGNER_KEY` (the key) and `SITE_URL` (your domain), and redeploy: claims open.
6. **Verify** on Basescan with the Standard JSON Input the deploy page links (compiler and constructor arguments are printed there too).
7. **OpenSea** lists the collection after the first claim; set its links and creator earnings there.

## Deploy (Vercel)

Import the repo; Vercel detects Vite and serves `api/*.js` as serverless functions.

Environment variables (see `.env.example`):

| Var | What |
| --- | --- |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Upstash Redis (Vercel KV). **Required in production**: stores the ledger (every Blocky, its wallet and seed, departures, the waitlist) so every visitor sees the same city. |
| `KV_KEY` | Name of the stored ledger (default `blocky:colony`). A new name starts a fresh city at 0 / 10,000. |
| `LAUNCH_TIME_MS` | When the city starts from empty land and buys start counting. Default: the first time the API runs. |
| `BASE_RPC_URL` | Base RPC for receipts, balance checks and the NFT contract (default: the public `mainnet.base.org`, rate limited). |
| `NFT_CONTRACT` | The BaseCity Blockies contract (from `/deploy.html`). Claims open when this and `CLAIM_SIGNER_KEY` are set. |
| `CLAIM_SIGNER_KEY` | Private key that signs claims; its address is the contract's `signer`. Server only, never commit it. |
| `SITE_URL` | Your domain, e.g. `https://basecity.xyz`: NFT metadata links, share links and share images. |
| `USD_PER_BLOCKY` / `MAX_SUPPLY` / `WHALE_USD` | Optional overrides of `usdPerBlocky` (10), `supply` (10000) and `whaleUsd` (1000) in `src/config.js`; keep them in sync. |
| `MIN_BUY_USD` | Ignore dust buys (default $1). |
| `HOLD_CHECK_MINUTES` | How often holders' `$BLOCKY` balances are checked (default 15). |
| `RESOLVE_WALLETS` | `0` to skip reading receipts (then smart-wallet buys count for the bundler and rarity seeds from the tx hash). Default on. |
| `POOL_ID` | The BLOCKY/NVDAc Uniswap v4 pool. Trades are read from its public GeckoTerminal feed. |
| `STOCK_TOKENS` | Optional: comma-separated addresses of more tokenized stocks on Base for the Stock Exchange ticker. |
| `BACKFILL_HOURS` | Testing only: also count trades from the last N hours (the feed covers ~24h). |
| `COUNT_MODE` | `buys` (default). `fees`: creator fees bring Blockies instead (`FEE_WALLET`, `EXCLUDE_TOKENS`, `FEES_URL`, `FEES_USD_OVERRIDE`, `FEES_OFFSET_USD`, `FEE_TOKENS`). |

## Customize

- `src/config.js`: city name, ticker, token links, $ per Blocky, supply, rarity odds, Base Builders, billboards, `blocksPerHour`, day length, land size and expansion thresholds, landmark milestones.
- `src/sim.js`: Blocky roles and work rates, the river, the building catalog and the deterministic build plan (landmarks, buildings, land expansions).
- `src/city.js`: voxel designs, land/river/bridges, progressive roads, construction sites, day/night.
- `src/vehicles.js`: cars, buses, boats and service patrols; `src/fleet.js`: the service vehicles.
- `src/metro.js`: the elevated metro loop, its stations and the train.
- `src/pfp.js`: voxel PFP renderer (WebGL); `src/voxel-svg.js`: the same Blocky as an SVG (NFT images, collection pages).
- `src/ledger.js`: the Blocky ledger (buys, the hold rule, the waitlist, rarity seeds), shared by the API and demo mode.
- Pages: `builders.html`, `collection.html`, `claim.html`, `about.html` with `src/site.js` + `src/site.css` (nav, footer, shared styles).
- `src/agents.js`: the AI agent drones.
- `src/citizens.js`: builders walking the roads, hauling and placing blocks.

## How "24/7, same for every visitor" works

No game server. The crew's speed only changes when a builder arrives (`blocksPerHour × √(total skill)`), so total blocks placed is a piecewise-linear function of time. The city plan is a fixed, seeded sequence of buildings; each starts when the previous one is done and finishes once the crew has placed its cost in blocks. Any browser that knows every Blocky's arrival and departure (from `/api/colony` + KV) computes the exact same skyline, including when each building was completed.
