# Free-tier limits & future costs (verified Oct 2026 — re-verify at deploy)

## Cloudflare (free plan, $0)

| Service | Free quota | Notes for this store |
|---|---|---|
| Pages | Unlimited static requests, unlimited bandwidth | Storefront + assets: free |
| Pages Functions | 100,000 invocations/day | API + webhooks: plenty to start |
| D1 | 5M rows read/day, 100K rows written/day, 5 GB total | Orders/catalog: plenty |
| R2 | 10 GB-month storage, 1M Class A + 10M Class B ops/mo, **zero egress fees** | Previews + masters: free at start |

**What outgrows free first:** R2 storage past 10 GB (~$0.015/GB-mo after), or
Functions past 100K/day (then Workers Paid $5/mo). No surprise bandwidth bills —
R2 egress is $0.

**Never promised:** free at every scale. If the catalog grows past ~10 GB of
masters/stems or traffic passes 100K API calls/day, costs begin. Owner approves
any paid upgrade before it happens.

## Payments (no upfront cost; per-transaction fees only)

- **Stripe**: free test mode, no monthly fee. US online card fee ≈ 2.9% + 30¢ per
  successful charge (verify current pricing in the Dashboard at launch). Payouts to
  bank; first payout can take ~7 days on a new account.
- **PayPal**: free sandbox + no monthly fee for standard checkout. US fee ≈ 2.99% +
  49¢ per transaction (verify at launch). Needs a PayPal Business account for live.

Both require identity/business verification before **live** money moves. Test and
sandbox modes need no verification.

## Other $0 items

- GitHub: free public repo + Actions minutes (free tier covers this workload).
- Domain: owner has freedomain.one — $0 domain options available.
- TLS: automatic via Cloudflare.

## Accounts needed (owner actions)

1. Cloudflare account (exists — used for automa.run.place) + R2/D1 enabled
2. GitHub repo (suggest `jinza-beats` under jiinzaa-creates)
3. Stripe account — test mode keys (owner already has a Stripe merchant account
   connected to Muse; confirm test-mode access)
4. PayPal Developer account — sandbox business + personal test accounts
5. Domain choice for the store
