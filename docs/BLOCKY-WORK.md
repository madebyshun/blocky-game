# Blocky × Blue Agent Jobs MVP

Claim workspace → select a claimed Blocky → Refresh jobs → enter ERC-8004 identity → Verify ownership → select job → prepare public preview and private report → review price and requirements → sign delivery.

Production Jobs API was read successfully on 2026-11-17. Four open jobs were returned. Reports are submitted only after explicit wallet signing. No jobs, deliveries, registrations, payments or approvals were created during implementation.

## Boundaries
- NFT and ERC-8004 ownership are read again on chain by `/api/work` at submission time. No ledger fallback. Missing NFT contract fails closed.
- One worker selected at a time. Identity verification is session-only; switching wallets clears it. No persistent onchain link between the two NFT collections is claimed.
- Price, preview, result hashes, payee, job and identity are bound by Blue Agent's exact signed message. Upstream also verifies the signature and ownership.
- Payment goes to the connected owner wallet; arbitrary payout addresses and server spending keys are not supported.
- Fixed-origin proxy exposes only job GET and signed delivery POST. It never exposes unlock, payment, registration or arbitrary upstream URLs.
- No paid research runs automatically. Existing research can be copied as evidence; the owner edits it to satisfy the full brief.
- Jobs are not funded escrow. Delivery is speculative work; the customer may not purchase it.
- Submission metadata is stored in this browser, scoped by wallet; full report/drafts are not persisted locally. Do not clear browser data if you need that local history.
- Public marketplace `unlocked` status is not counted as verified earnings. User-supplied payment receipts are checked on Base for successful USDC Transfer from the job poster to the owner for the delivery amount after delivery time. Duplicate receipt hashes across local submissions are refused. This proves a matching transfer, not cryptographic job attribution; upstream public API does not expose the unlock transaction hash.
- No income totals, profit guarantees, autonomous executor, platform fees or cross-device history.

## Validation
Full existing test suite and production build passed. Added protocol tests for message binding, payee restrictions, budget limits and invalid inputs. Browser QA read the real four-job board through local adapter, selected the NVDA cross-chain job, and confirmed the complete form and disabled submission without wallet verification. Real signed delivery and buyer unlock require user-operated wallets and have not been executed.
