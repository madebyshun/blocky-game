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
