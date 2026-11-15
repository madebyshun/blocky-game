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

**Payment — the owner signs, no server key anywhere (built 2026-11-16).**

Every job in the catalogue is a *paid* tool: an unpaid call always answers `402`. (An earlier version of
this doc claimed a "free tier" for these jobs; that was wrong — free tier covers other Blue Agent tools
only.) So `src/x402.js` signs the payment in the wallet:

```
POST /api/agent  (x-agent-action: run, no payment)
  -> 402 { accepts: [ { scheme:"exact", network:"eip155:8453",
                        asset: USDC, amount:"20000", payTo, extra:{name,version} } ] }
wallet signs EIP-3009 transferWithAuthorization(USDC on Base)
POST /api/agent  (same body + base64 PAYMENT-SIGNATURE payload)
  -> 200 with the result, and `_settle.tx` or a PAYMENT-RESPONSE header confirming settlement
```

Two wallet prompts at most, USDC moves straight from the owner to Blue Agent's `payTo`, and no key
exists on the server. `test/x402.mjs` signs with a real key and checks that a tampered `amount` or a
redirected `payTo` fails to verify.

The v2 header is `PAYMENT-SIGNATURE` (base64 JSON); `X-PAYMENT` is the older name and both are sent.

## Checklist for going live

1. Nothing to configure for payments: the owner's wallet pays. Just have USDC on Base in their wallet.
2. Set `NFT_CONTRACT` once the collection is live → `ownerOf` reads the chain instead of the ledger.
3. After metadata changes, call `setBaseURI` (or rely on the existing 60 s cache) so OpenSea picks up
   the new attributes.


### Known limit: EIP-7702 wallets cannot pay (found on prod, 2026-11-16)

USDC's `transferWithAuthorization` checks the signature with a plain `ecrecover`, so it only accepts one
signed by a key that *is* the account. An **EIP-7702 delegated account** — bytecode beginning `0xef0100`,
which Coinbase Smart Wallet and many newer wallets now use — signs with a session key, so `ecrecover`
never recovers the account and USDC reverts with `FiatTokenV2: invalid signature`. EIP-3009 has no
contract-signature path (unlike Permit2), so such a wallet cannot pay for a job at all.

Verified against Base mainnet: a fresh EOA's signature simulates fine; the same signature from a
delegated address reverts, and so does one built by Coinbase's own `@x402/evm` library, which is how
this was confirmed to be a protocol limit rather than a bug in `src/x402.js`.

`payRequirement` now reads `eth_getCode` first and throws `Eip3009Unsupported` before asking the owner
to sign, and the claim page shows that message. The earlier "payment went through but Blue Agent still
asked for one" text was wrong on both counts: nothing was charged, and the cause was this.

**MetaMask users hit this by default** once Smart Account is on. To pay: ⋯ next to the account →
Account details → Smart account → switch off, then reload. (Confirmed on the treasury-adjacent holder
wallet `0x92c0…42e9`, whose bytecode is `0xef0100` + a 11 KB delegate.) Any plain EOA pays normally.

**Not built:** a Permit2 path for delegated wallets. Blue Agent's `accepts` list only offers `exact`
with `eip3009`, so it would need Blue Agent to accept `assetTransferMethod: "permit2"` first.

## Deliberately not done

- **Swap to NVDAc from the earnings**: the brief asks for it, but it needs a swap route the owner signs
  on top of the x402 payment. Blue Agent exposes `rh-stock-swap-prepare` for Robinhood Chain, not Base;
  Base-side swapping belongs in Quadra's flow, which already reads `?do=swap&buy=`.
- **Agent walking to the GPU District**: a render-only change waiting on agent state being loaded into
  the city sim; the builder card badge was enough for Phase 1.
