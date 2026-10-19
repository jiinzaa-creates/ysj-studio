# API routes

Shared helpers live in `functions/_lib/`:
- `db.js` — parameterized D1 wrapper (`queryAll`, `queryFirst`, `execute`, `batch`)
- `auth.js` — admin session cookies, PBKDF2 password hashing/verification (WebCrypto)
- `money.js` — integer-cents formatting and validation
- `r2.js` — SigV4 presigned download URLs for the private `jinza-delivery` bucket
- `fulfill.js` — order state machine + idempotent grant logic (provider-agnostic)

## Public (M3)

```
GET /api/beats[?search=&genre=&mood=&featured=1]  — published beats + active licenses
GET /api/beats/:slug                             — one beat + its licenses (404 if unpublished)
```

Both return **501 "M3 provisioning pending"** when the D1 binding is missing.

## Admin (M3) — all require the `ysj_admin` session cookie (401 otherwise)

```
POST /api/admin/login                 — { email, password } → sets session cookie
POST /api/admin/logout                — clears the session cookie
GET  /api/admin/beats[?status=]       — list beats (any status)
POST /api/admin/beats                 — create beat (starts as draft)
PUT  /api/admin/beats?id=bt_*         — update / publish / unpublish
GET  /api/admin/licenses?beat_id=bt_*  — tiers + prices for a beat
POST /api/admin/licenses              — create license product (the ONLY place prices are set)
PUT  /api/admin/licenses?id=lic_*     — update price / terms / active flag
GET  /api/admin/orders[?status=][?limit=] — order list (read-only)
GET  /api/admin/orders?id=ord_*       — order + items + payments + grants
```

## Coming in M4–M6 (stubs, not yet built)

```
POST /api/checkout                    — create Stripe/PayPal session (M4/M5)
POST /api/webhooks/stripe             — verified Stripe events (M4)
POST /api/webhooks/paypal             — verified PayPal events (M5)
GET  /api/order/:id/status            — polled by the success page (M4/M5)
GET  /api/downloads?token=…           — authorized download links (M6)
```
