# Blocky Agent — implementation notes

> Built 2026-11-15. Brief: citizen NFT → agent that takes paid jobs on Base and earns USDC.
> Track: **Agentic Stock Finance** (Stocks Maxxing, deadline 2026-12-05).

## What shipped

| Step | Where | State |
|---|---|---|
| Hold time 6 h → **1 h** | `src/config.js` `citizenDays: 1/24` | ✅ |
| Agent state (on/off, jobs, earnings) | `api/agent.js`, KV `blocky:colony:agent:v1` | ✅ |
| Activate / switch off, holder-signed | `src/blockyagent.js` + claim page | ✅ |
| Ownership gate | `ownerOf` on chain, **ledger fallback** while the contract isn't readable | ✅ |
| Blue Agent x402 proxy | `api/blueagent.js` | ✅ |
| 3 jobs | NVDAc quote, drift screen, movers | ✅ |
| NFT metadata (`Agent`, `Jobs done`, `USDC earned`) | `api/nft/[id].js` + ERC-4906 | ✅ |
| City card badge | `src/main.js` (`AGENT` row on the builder card) | ✅ |

## Corrections to the original brief

The brief named two Blue Agent tools that **do not exist**. Verified against
`blueagent.dev/.well-known/openapi.json` — the live catalogue is:

| Brief said | Actually | Price |
|---|---|---|
| `stock_signal` | `stock-screen` (`/api/x402/stock-screen`) | $0.02 |
| `stock_quote` | `base-stock-quote` (`/api/x402/base-stock-quote`) | $0.02 |
| — | `base-stock-movers` (`/api/x402/base-stock-movers`) | $0.03 |

x402 constants (confirmed from a live 402): network `eip155:8453`, asset USDC
`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, `payTo 0x0295…9205`, `amount` in atomic units
(6 dp), `maxTimeoutSeconds: 120`.

## Auth model

Switching an agent on requires **no transaction and no gas**: the wallet signs a short plain-text
message (`personal_sign`, same as the vote page) and the server verifies it with `viem`'s
`client.verifyMessage`. Two independent gates:

1. `ownerIs(tokenId, address)` — `ownerOf` on chain; if the whole collection reverts (contract not
   live, or a local run) it falls back to the ledger, which is the same table `api/claim.js` signs
   from. Selling the NFT moves the chain owner, so the agent switches off with the token.
2. The signature must be from that address, over a message naming that exact `tokenId` and wallet.

Both return 403/401 before any Blue Agent call is made.

## Running a job

`POST /api/agent` with `x-agent-action: run`. The server re-checks ownership and the on/off flag
every call, then calls Blue Agent with the job's path and body.

**Payment:** `BLUE_PAYER_KEY` + `BLUE_PAYER_ADDRESS` in the env is what makes jobs paid. Without it
the call still goes out and Blue Agent's free tier answers — the result is delivered but `paid: 0`,
and the panel says so instead of promising USDC.

**Not built:** wallet-side x402 signing in the browser. The server hands back a 402 with the accepts
list; the page shows a plain message. Wiring it means building an EIP-3009 `transferWithAuthorization`
payload in the wallet — real work, deliberately deferred.

## Checklist for going live

1. Set `BLUE_PAYER_KEY` / `BLUE_PAYER_ADDRESS` (a funded Base wallet holding USDC) → jobs start paying.
2. Set `NFT_CONTRACT` once the collection is live → `ownerOf` reads the chain instead of the ledger.
3. After metadata changes, call `setBaseURI` (or rely on the existing 60 s cache) so OpenSea picks up
   the new attributes.

## Deliberately not done

- **Swap to NVDAc from the earnings**: the brief asks for it, but it needs a swap route the owner signs
  on top of the x402 payment. Blue Agent exposes `rh-stock-swap-prepare` for Robinhood Chain, not Base;
  Base-side swapping belongs in Quadra's flow, which already reads `?do=swap&buy=`.
- **Agent walking to the GPU District**: a render-only change waiting on agent state being loaded into
  the city sim; the builder card badge was enough for Phase 1.
