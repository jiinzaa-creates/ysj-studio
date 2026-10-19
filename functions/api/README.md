# API routes (built across M3–M6)

Planned Pages Functions:

```
functions/api/
├── beats.ts              # GET /api/beats, GET /api/beats/:slug (M2/M3)
├── checkout.ts           # POST /api/checkout → Stripe/PayPal (M4/M5)
├── webhooks/
│   ├── stripe.ts         # POST /api/webhooks/stripe (M4)
│   └── paypal.ts         # POST /api/webhooks/paypal (M5)
├── order-status.ts       # GET /api/order/:id/status (polled by success page)
├── downloads.ts          # GET /api/downloads?token=… (M6)
└── admin/
    ├── beats.ts          # protected CRUD (M3)
    ├── licenses.ts
    └── orders.ts
```

Shared helpers will live in `functions/_lib/` (db, auth, money, r2, fulfillment).
