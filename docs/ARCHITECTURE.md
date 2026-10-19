# JINZA Beat Store — Architecture (Milestone 1)

## Decision: Cloudflare Pages + Pages Functions + D1 + R2

Single Cloudflare Pages project:
- `public/` → static storefront (HTML/CSS/JS, no framework to start; keeps it fast and free)
- `functions/api/*` → server-side API (checkout sessions, webhooks, fulfillment, downloads, admin)
- D1 binding `DB` → `jinza-db`
- R2 binding `PREVIEWS` → `jinza-previews` (public bucket: tagged preview MP3s, artwork)
- R2 binding `DELIVERY` → `jinza-delivery` (private bucket: full masters, stems)

One `git push` → GitHub Actions → Pages deploy. Preview URLs per branch for testing.

## Request flow (purchase)

```
Browser                          Pages Function                    Stripe/PayPal
  │  POST /api/checkout {beat,license}  │                                │
  │────────────────────────────────────▶│  lookup price in D1 (server)   │
  │                                     │  create order (CREATED→PENDING) │
  │                                     │────── create session/order ────▶│
  │  ◀──── redirect URL ────────────────│                                │
  │  ─── buyer pays on provider ────────▶│                                │
  │                                     │◀──── webhook (signed) ──────────│
  │                                     │  verify signature               │
  │                                     │  dedupe by event id             │
  │                                     │  reconcile amount vs order      │
  │                                     │  order → PAID → grant license → FULFILLED
  │  ◀── success page (polls /api/order/:id/status)                      │
```

Key rules:
- **Never trust the browser** for payment success. The success page polls order status;
  fulfillment happens only in the webhook handler.
- **Prices come from D1**, never from the request body.
- **Idempotency**: `webhook_events(provider, id)` unique; fulfillment checks order status
  before granting; `license_grants.order_item_id` unique.
- **Exclusive licenses**: D1 transaction — `UPDATE beats SET status='sold_exclusive'`
  only if still `published`; the losing concurrent request fails cleanly. (D1 supports
  transactions via batch API; serialize exclusive purchase in the webhook handler.)

## Order state machine

```
CREATED → PENDING_PAYMENT → PAID → FULFILLED
              │                │
              ├─ PAYMENT_FAILED (webhook: payment failed / capture declined)
              ├─ CANCELED (buyer cancels at provider, or expiry)
              ├─ REFUNDED (refund webhook)
              └─ DISPUTED (chargeback/dispute webhook, where supported)
```

Only `PAID` → grants license + delivery rights. Both providers write to the same
`orders`/`payments` tables.

## Secure delivery

- Paid files live ONLY in the private `jinza-delivery` bucket. No public URLs.
- After fulfillment, buyer gets a passwordless order link:
  `/order/:id?token=<random 256-bit>` — token stored as SHA-256 hash, 7-day expiry.
- Download endpoint validates token → checks grant → issues a short-lived,
  single-purpose R2 presigned URL (TTL 30 min, max 5 uses), logs to `download_audit`.
- Honest limitation: once audio is downloaded it can be re-shared. Protection is
  about authorization and audit, not DRM.

## Admin

Phase 1 (M3): protected `/admin` Pages Function routes (session cookie + password hash
in `admin_users`) for CRUD on beats/licenses/prices/orders. If auth becomes a risk,
fallback is a documented wrangler/D1 CLI workflow — never an open endpoint.

## Security notes

- Secrets only via `wrangler secret put` / Pages environment variables. Never in git.
- Stripe: verify `stripe-signature` header with webhook secret (raw body).
- PayPal: verify via `verify-webhook-signature` API call (transmit the exact headers).
- Rate limit: checkout + download endpoints (Cloudflare Rate Limiting rules or in-function counters).
- Security headers via `public/_headers`. No card data ever touches our servers.
