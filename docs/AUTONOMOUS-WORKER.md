# Autonomous research worker — 2026-11-17

## Implemented
Blocky: wallet-signed private control session; persistent per-wallet settings and review queue; one selected claimed Blocky + ERC-8004 identity; free Base exit research executor; daily report and pending limits; scheduler; manual cycle; owner-signed pause; encrypted delegate key; expiring scoped auto-submit; signed webhook receiver; verified USDC receipt accounting; review-to-delivery handoff; discard and fresh-research flow.

Blue Agent: shared worker contract; explicit capability version; atomic 15-minute job reservations; owner-signed 24-hour delivery-only delegation (1 skill, owner payee, at most 10 deliveries); atomic quota consumption; revocation; onchain identity check at delivery; receipt fields in public job responses; signed fixed-destination webhook after unlock; Hire research form preset (pay-on-unlock, not funded escrow).

## Operate
1. Claim → selected Blocky → Your research worker → Unlock controls (message signature, not transaction).
2. Enter owned ERC-8004 ID, choose review mode, limits and price, then sign Enable. Ownership is read on chain. Enable expires after 24 hours.
3. Run one cycle or wait for cron. Only the supported Base trending-exit title is eligible; no self-jobs, repeated delivered jobs, Robinhood requests or specific-address jobs. Other requests remain manual.
4. Worker checks available GoPlus sell-risk flags, verified Uniswap V3 factory/pool, decimals and same-block quotes. Three candidates must pass; incomplete research becomes Failed. Quotes and approximate <5% bounds are estimates, not wallet-specific sell execution guarantees.
5. Review mode puts a report in Needs review. Review & prepare delivery opens the existing form; verify identity there, inspect contents and sign the delivery yourself.
6. Auto mode additionally requires production capability version 1, encryption key and an owner-signed delegate grant. It reserves, researches and submits automatically within scope. No payment key is used. Revocation is owner-signed; pause stops new work, but a request already sent may finish.
7. Purchased receipt is retrieved from Blue Agent and independently checked against successful USDC Transfer logs on Base, exact payer/payee/amount and at least 10 blocks confirmation. Duplicate receipt hashes are not counted twice within worker history.

## Runtime configuration
- Blocky Vercel: KV already configured; new CRON_SECRET, WORKER_ENCRYPTION_KEY and WORKER_WEBHOOK_SECRET created as sensitive environment variables. Secrets are never exposed in responses.
- Blue Agent worker protocol has been deployed and both projects have the same WORKER_WEBHOOK_SECRET configured; polling is the fallback.
- Cron calls /api/worker?cron=1 every 15 minutes, with CRON_SECRET authorization. One wallet per invocation round-robin, so cadence per wallet increases with enrolled wallet count. This is a bounded pilot scheduler, not a high-volume queue service.
- Paid-tool budget is hard-coded zero. Public API/RPC reads and infrastructure still have operational cost. No paid tool authorization, trading, escrow or guaranteed income is implemented.
- Automatic earnings are customer payments, not treasury rewards. Gross received equals net after paid tools because paid tool spend is zero; infrastructure costs are excluded.

## Validation and release status
- Blocky existing suite plus scope, budget, signed controls, replay, sessions, encryption integrity, lease and pause CAS tests pass. Read-only real executor completed a 3-token research report on Base.
- Blue Agent TypeScript, Jobs tests, worker protocol tests and verify:build pass. Local Jobs/feed returns protocol version 1; Hire preset verified in browser.
- Full Blue Agent test suite: 11 failures both on clean HEAD (11/159) and modified tree (same 11/160). Failing suites: action-card-inventory-check, aeon-null-path-check, catalog-compute-check, chat-skills-check, chat-tool-honesty-check, credit-price-override-test, curated-trigger-check, dead-tool-check, docs-truth-check, skills-truth-check, x402-free-and-validation-test. No worker/Jobs suite failed.
- Synced the nine newer main commits containing the official baseline repairs; the complete updated gate passed 164 suites, TypeScript and verify:build before release 524b6878. Production now advertises workerProtocol=1 and Blocky capability checks return ready. A separate unlock privacy regression was found and patched; its final gate and release are tracked in the chat.
- No real user grant, enable, delivery, purchase, token approval or transaction was signed during implementation. Final wallet-based end-to-end acceptance is outstanding.

## Scope limits
Only one deterministic skill; no arbitrary task execution or LLM autonomy. No funded jobs, escrow contract, new paid service endpoint or guaranteed-order flow. Hire uses the existing speculative job board with explicit pay-on-unlock terms. No deep execution queues or independent auditing of GoPlus; manual review is available. External source outages fail closed.
