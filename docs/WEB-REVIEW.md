# Website review — 2026-11-17

## Implemented
- Agent research: quote summary, price, 24h change, reference price, reported drift, volume and liquidity; oracle age, unavailable buy impact reason, timestamp and sources.
- Issuance and corporate actions in an expandable section; token, prospectus and payment receipt links. Full response retained without truncation. Screen and movers responses get structured fields and lists, with text fallback.
- Spending is labelled spending in the claim workspace, city card and NFT metadata. Historical storage key `earnedUsdc` is retained for compatibility; it represents fees spent, not wallet earnings.
- Main site navigation prioritizes Home, City, Base Live, Blockies and My Blockies & Agent. Other pages remain available through Explore and the footer.
- Shared reading spacing, keyboard skip link and focus treatment; research metrics use two columns on narrow screens.

## Checks completed
- Static audit of all 14 HTML entry points: title, viewport, local links and referenced local assets. No missing local asset paths found.
- Browser loaded Home, Base Live, Collection, Viewer, Claim, Vote, Builders, Recap, Weekly, About, Dashboards, Gallery and Deploy from production build. Shared navigation observed on the 12 standard pages; Gallery is a separate canvas view.
- Research card visually inspected with a fixture based on the supplied successful NVDA response. Fixture was a local preview only, never live market data.
- Full repository test suite and production build pass. Added renderer tests for missing values, JSON/text responses and escaping unsafe content/links.

## Limits and follow-up
- Static preview has no Vercel API, so wallet ownership, live city data, paid jobs, claims and onchain transactions were not retested in the browser.
- City and Gallery canvas layouts retain their existing rendering; this pass changes shared navigation and research presentation, not the 3D world.
- Large JavaScript bundle warnings remain; splitting the 3D/NFT dependencies is a separate performance task.
- Result history is still session-only and disappears on refresh; no persistent research-history backend was introduced.
- Mobile breakpoints are implemented, but a complete device/browser matrix remains to be tested.
