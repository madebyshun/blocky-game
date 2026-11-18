# BaseCity — what's built, what's next (handoff, 2026-11-12)

Repo `madebyshun/blocky-game`, branch `claude/loving-ride-yirjaj` (the repo's default branch; Vercel deploys it).
Site: basecity.space. X: @blockyonbase (Blocky), @madebyshun (Shun). $BLOCKY `0xE72A0C42b584a3E7A4503a82D1337dEB52adE885`.
Sister projects: Quadra (`madebyshun/quadra`, prod https://quadra-eta.vercel.app, private, "do not commit unless asked"),
Blue Agent (`madebyshun/blue-agent`, blueagent.dev).

## Built recently (live once deployed)

- **Denim fix** (Base's 200 ms blocks since block 53,556,127 / 2026-11-05 18:00 UTC): `api/_baselive.js` `DENIM`,
  `blockAtTime`, `tOf`; flow store `usdcflow:v4`; live polls read blocks in batches of 6; bento per-minute cells over the
  last 60 s of blocks; bento **Denim counter** cell.
- **Blocky Street** (`src/stocks.js`, `api/_stocks.js`, `api/stocks.js`, `src/nysehours.js`): district on the 12 lots north
  of Base Live (`CONFIG.stocks`, opens 2026-11-12 05:00 UTC via `CitySim.openDistrict`, history before unchanged, tested).
  - 8 towers (`CONFIG.stocks.towers`: SNDK, MSTR, SPCX, META, NVDA, AMZN, TSLA, MSFT) as tall as their 24 h transfers
    on Base (log scale); every live transfer drops a block; blocks laid while NYSE is shut glow.
  - Board: Wall Street OPEN/CLOSED vs Base OPEN, % of stock volume while NYSE shut (7 d), bell at open/close.
  - Weekend: Blue Agent's free `weekend-scorecard` (move on Base vs Friday's close + Blue's call).
  - Tap a tower: card + "Add a block" → `quadra-eta.vercel.app/?do=swap&buy=<token>` (a link Quadra already reads).
  - 📈 panel: paste wallet / basename / Connect → `/api/stocks?wallet=` → your own tower in the street + share card.
  - Data: Coinbase's list `api.coinbase.com/v1/tokenized-stocks` (paged, B20, 8 decimals, `multiplier`, Chainlink NAV).
    Fakes ("…c" tokens, even at 0xb200… addresses) never count.
- **Clips** (`clips/*.js`, driven through `/?still&film` + `window.__bc`): `cityfilm.js` (The Blue Square, Base
  Builders), `denimfilm.js` (Denim), `streetfilm.js` (Blocky Street launch: hook, real ticker tape, block counter,
  $153M+ total as of Nov 12). Render scripts live in the session scratchpad (Playwright + swiftshader + ffmpeg).

- **Street Crew** (`api/_crew.js`, `src/stocks.js`): a wallet looked up on Blocky Street holding $10+ of Coinbase
  stocks joins the crew (KV `stocks:crew:v1`): a Blocky per $10 (max 5) in its top stock's hard hat, carrying blocks to
  that tower; held a day = citizen (gold hat); re-read every 6 h, under $10 leaves. `?crewdemo` for clips.
- **Blocky 10** (`CONFIG.stocks.blocky10`): the city's 10-stock basket in the 📈 panel; "Buy the city" copies the
  list and opens Quadra's Treasury Basket (`?do=basket&ref=basecity`; Quadra doesn't read basket picks from the URL
  yet, so its MAG7 preset shows first: a Quadra change would make it one click).
- **Traction counters**: every Quadra link carries `ref=basecity` and is counted (`/api/stocks?go=block|basket|city`,
  KV `stocks:go:v1`); `/api/stocks?crew` returns `totals` (wallets, Blockies, citizens, USD held rounded to $100,
  only from 3 wallets) and `go` counts: the numbers for the Stocks Maxxing submission.
- **Bell post** (📣 in the panel, and a link in the city log at the open/close bell): image + X post text with the
  day's real numbers, posted by hand (no X keys in the app).
- **getLogs fix**: the prod RPC plan caps eth_getLogs at 10 blocks; Blocky Street's hours and Base Live's hour now
  read logs from `LOGS_RPC_URL` (default publicnode: 9,000 blocks x 10 addresses a call).


- **Blocky Agent** (`src/blockyagent.js`, `api/agent.js`, `api/blueagent.js`, `docs/BLOCKY-AGENT.md`): hold time now **1 hour**
  (`citizenDays: 1/24`). A claimed citizen can switch its agent on (wallet-signed message, no gas), then run paid jobs
  against Blue Agent's x402 API — NVDAc quote, drift screen, stock movers. Ownership gate reads `ownerOf`, with the ledger
  as fallback while the contract isn't readable. NFT metadata gains `Agent` / `Jobs done` / `USDC earned`; the builder card
  shows a green agent row. Jobs are paid per call in USDC, signed by the owner's wallet (src/x402.js); no server key exists.
- **IPO Day** (`src/ipoday.js`, `api/ipoday.js`): a stock Coinbase lists after BaseCity's first snapshot gets a crane on
  Blocky Street for a day. The first run seeds silently (`isSeeding`) so 358 existing stocks don't put 358 cranes up.
- **Find me** (`src/findme.js`): paste a wallet / Basename in the city header → its Blockies, camera follows the one you pick.
- **Weekly** (`weekly.html`, `src/weekly.js`): the city's week, same replay as the daily recap, seven days at a time.

## To check first

1. Blocky Street live on prod (`basecity.space/?street`): land ≥ 9, `/api/stocks` answering (Coinbase API reachable
   from Vercel), week filling in KV (`stocks:hours:v1`), live drops arriving through `/api/baselive` `stocks`.
2. Base Live / bento numbers after the Denim fixes (block time 200 ms, TPS hundreds, per-minute counts not round).
3. Coinbase's stock count: the user says 300+; the code reads every page (up to 10 pages of 100).

## Not built yet — ideas, in suggested order

### Stocks Maxxing (deadline 2026-12-05; 50% onchain traction, 25% product, 25% build in public; $6k build-in-public prize)
1. **Daily Opening Bell / After Hours content**: auto clip or image each day at 9:30 and 16:00 ET from Blocky Street
   (real numbers from `/api/stocks`), for @blockyonbase build-in-public posts.
2. **Ticker traits**: Blocky wears what its wallet holds (NVDA chip helmet, TSLA wheel, AAPL badge…) — read from the
   wallet, no new token. ⚠️ Touches Blocky NFT looks: needs the owner's OK.
3. **Launch Pad tower → Quadra launchpad** (`?do=launch`): stock-paired coins launched on Quadra show as little shops at
   the foot of their stock's tower (read Quadra's factory `Launched` logs; v3 `0x006Da367654a487bb277fe25ff54f0fE0f741377`).
4. **Blocky 10**: a basket of 10 stocks as a ring of towers; "Buy the city" → Quadra Treasury Basket (`?do=basket`).
5. **Blue's Weekend Book**: Blue Agent's free `weekend-diary` (paper book) as its own building/board.
6. More stock data on bento (no room in the 1600×900 board now: a second card or a stocks bento page).
7. Pitch page for the Base team: "BaseCity = a living map of the Base ecosystem, with Blocky Street".

### City replan: every building does something onchain (agreed direction)
Keep homes and parks; Downtown = Base projects only, each building one real action, user signs in their own wallet,
no custody, no own contracts; time-gated (`from` in the future) so history doesn't change.
1. Click-a-building card for the 14 existing HQs (live stats + one action) — reuse the tower card pattern.
2. **USDC Bank: Send** (USDC/ETH to address or basename) — simplest, proves the flow.
3. **Swap** — not o1 (owner said no): use Quadra (`?do=swap&buy=`) or Relay (`api.relay.link`, what Quadra uses).
4. **Basenames HQ: register**, **Morpho: deposit**, **Launch Pad: Quadra launch**, then a Market.
5. Replace generic Downtown offices with 10–15 more Base projects (needs the owner's list).

### Clips / content
- Recap "Year One" with real numbers; "Walk onchain" parade of Base Builders; music for the clips (none has sound yet).

### Open items
- `ANTHROPIC_API_KEY` on Vercel for `/dash` (dashboard maker).
- Tokenized-stock addresses for `CONFIG.baseLive.stocks` (Base Live's own stock cars) — can now come from `stockList()`.
- Vercel access for the session (team `madebyshuns-projects`) to check deploys.

## Plan: Blocky works, earns, owns stocks (agreed direction, 2026-11-17)

Roles: **Blue Agent** = where jobs are posted and paid (marketplace, escrow, payment). **Blocky (BaseCity)** =
runs the worker, does the work, manages its costs. Goal: a Blocky works on its own and its earnings become
tokenized stocks. Stocks Maxxing track: Agentic Stock Finance (deadline 2026-12-05).

### Blue Agent side (madebyshun/blue-agent)
1. **Stock research job category** + job templates with a structured brief (ticker, question, deadline,
   budget): weekend gap vs Friday close, after-hours volume, pool depth/slippage, NAV vs DEX premium.
2. **Escrowed budgets**: the poster funds the job up front; payout releases on accept (or auto after N hours
   without dispute). Today budgets are not escrowed and pay only on unlock.
3. **Worker protocol live** (`/feed` `workerProtocol: 1`): scoped delegation (reserve + deliver only,
   max N deliveries, 24 h), revocation — so BaseCity's auto mode can submit without the owner.
4. Job feed fields the worker needs: `skill`/category id, ticker, structured inputs (no free-text matching).
5. Seed real demand: a few genuine stock jobs (Blue's own research needs, partner projects). No fake jobs.

### BaseCity side (madebyshun/blocky-game)
1. **Worker takes stock jobs** (`api/_worker-engine.js` `eligible` is one exact title today): match by the
   job's category/skill, one research template per kind, all from free data —
   `/api/stocks` (hourly volume, % while NYSE shut, NAV), Blue's weekend scorecard, Quadra/Relay depth.
2. **Auto mode end to end**: reserve → research → deliver under the delegation; review mode stays default.
3. **Cost ledger per Blocky**: tool spend (target $0), cron/infra share, earnings; net P&L on the worker card.
4. **"Stack my earnings"**: after a verified payout, one tap buys a stock with it through Quadra
   (`?do=swap&buy=<token>` or Treasury Basket); later an optional standing rule ("put 100% into NVDA"),
   signed by the owner, never custody. The owner's tower on Blocky Street grows a floor.
5. **Blocky Street shows the work**: working Blockies walk to the towers; a "Hardest-working Blocky"
   leaderboard (earned, stacked); share card "Blocky #718 earned $X, now owns 0.00Y NVDA".
6. Content: daily post of what the Blockies earned and stacked (real numbers only).

### Order
BaseCity 1 (stock templates) → Blue 1+4 (category, structured jobs) → BaseCity 4 (stack earnings) →
Blue 2+3 (escrow, worker protocol) → BaseCity 2+3 (auto mode, P&L) → BaseCity 5 + Blue 5 (show + demand).
Note: Coinbase's tokenized stocks aren't offered to U.S. persons (Quadra blocks the U.S.).

### Progress (2026-11-18)
- BaseCity 1 done: `api/_worker-stock.js` — worker matches by `job.contract.skill` (+ `contract.inputs` {ticker, token, chainId}; token address must match Coinbase's Base token,
  fallback "Ticker: X" in brief). Skills: `stock-weekend-gap`, `stock-after-hours-volume`, `stock-nav-premium`
  (DEX price from Blue scorecard, else GeckoTerminal free). Tool cost $0. `stock-pool-depth` not built: no trustworthy free depth (Slipstream has no quoter). Blue 2+3 (escrow, delegation) are ShunTr's call.
- BaseCity 3 (display): P&L block on the worker card (earned verified, tool spend, running cost, net).
- BaseCity 4: "Stack my earnings" button shown disabled ("coming soon") until Quadra's API is open (CORS).
- Skill ids sent to the Blue Agent session for Blue 1+4; waiting on its confirmation.

### Build plan (approved 2026-11-18) — 12 items
Phase 1: 1 Blue direct hire (`invitedAgentId`) · 2 BaseCity "Hire Blocky #N" (after 1) · 3 Blue `/agents` + profile ·
4 BaseCity Blocky x402 service ✅ · 5 BaseCity Agent Card ✅ · 6 Blue agents post jobs by API/MCP · 7 Blue `/api/catalog`.
Phase 2: 8 Blue ERC-8004 reputation feedback · 9 Blue new-job webhook.
Phase 3 (needs ShunTr): 10 ERC-8183 escrow · 11 worker delegation for stock jobs · 12 auto mode + Stack my earnings.
Blue items 1,3,6,7,8,9 sent to the "Blueagent build progress" session.

- **4 `api/x402.js`**: `GET /api/x402` catalog; `POST /api/x402?tool=nav-premium|after-hours-volume&blocky=N {ticker}`
  → 402 (x402 v2 exact, USDC Base, payTo = ownerOf(Blocky)) → verify via CDP facilitator → research → settle
  (charged only on success). Only Blockies whose agent is on. Sales counted in the agent KV entry (soldCalls,
  soldUsdc) and shown in the worker card P&L. **Needs `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET` on Vercel.**
- **5 `api/agent-card.js`**: `GET /api/agent-card?blocky=N[&agent=ID]` — ERC-8004 registration-v1 + A2A-style
  skills with prices and the x402 call. Owner can point the ERC-8004 agent URI at it (owner's own tx).

### Verify many Blockies at once (2026-11-18)
- `src/agent-link.js` EIP-712 `AgentLink{owner, links: Pair{blocky, agentId}[], issuedAt}`, domain
  `{name:'BaseCity Agent Link', version:'1', chainId:8453}`; one signature for up to 200 Blockies, no gas.
- `api/agent-link.js`: POST verifies (EOA or smart wallet), checks ownerOf for every Blocky + agent, stores;
  GET `?blocky=` / `?owner=` re-check ownership live (a sale ends a link).
- Agent card lists an agent only from a signed link (`linkedBy: owner-signature`, with `ownerProof`) or an
  agent whose on-chain tokenURI already points at the card (`linkedBy: onchain-tokenURI`); `&agent=` alone is ignored.
- Claim page: "Verify my Blockies as agents" panel — sign once; optional "Also write on chain" batches
  `setAgentURI` via EIP-5792 `wallet_sendCalls` (one tx per agent where unsupported; only 1-agent-1-Blocky pairs).

### Blockies at work in BaseCity (2026-11-18)
- One-time setup on /claim: "Create an agent for each Blocky" batches ERC-8004 `register(cardURI)` (EIP-5792,
  one confirmation; per-tx fallback) → `/api/agent-link {minted:[tx]}` links each mint to its Blocky from the
  receipt + tokenURI (no signature). "Switch all agents on": one personal_sign for every Blocky (`/api/agent` tokenIds).
- Fleet worker: review-mode session 7 days; jobs go to the invited Blocky or the least-loaded one (perBlockyDaily);
  items carry tokenId/agentId; auto mode stays on the delegated agent (Blue item 11 pending).
- x402 `blocky=any` picks the on-duty Blocky with fewest calls.
- `/api/work-feed` (real events only: x402-sale with tx, job-delivered, job-paid with tx) → x402 HQ popup in the
  city menu (today, Hardest-working Blockies, latest receipts, services) + a drone from Blocky Street to the
  x402 HQ with the amount, and a city-log line per event. `?hq` opens it.
