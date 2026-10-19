# JINZA — Direct Beat Sales Platform

Production e-commerce site for JINZA: browse beats, preview audio, choose a
license, pay with Stripe or PayPal, receive files + license after verified payment.

**Status: Milestone 1** — architecture, requirements, repo structure.
No checkout code yet. No live payments. Test/sandbox only until owner approves.

## Stack

| Layer | Choice |
|---|---|
| Hosting + API | Cloudflare Pages + Pages Functions |
| Database | Cloudflare D1 (SQLite) |
| File storage | Cloudflare R2 — `jinza-previews` (public), `jinza-delivery` (private) |
| Payments | Stripe Checkout + PayPal Orders API |
| CI/CD | GitHub Actions → Cloudflare Pages |

Why Pages + Functions instead of standalone Workers: one project serves the
static storefront AND the API routes, one deploy pipeline, free and unlimited
static requests. See `docs/ARCHITECTURE.md`.

## Repo layout

```
├── public/                 # storefront (built in M2)
├── functions/api/          # Pages Functions: checkout, webhooks, downloads, admin
├── migrations/             # D1 schema migrations
├── tests/                  # automated tests (built in M7)
├── docs/                   # architecture, requirements, ops runbooks
├── wrangler.toml
└── package.json
```

## Quick start (local dev)

```bash
npm install
cp .env.example .env          # fill in TEST/SANDBOX keys only
npx wrangler d1 create jinza-db
npx wrangler d1 execute jinza-db --file migrations/0001_schema.sql
npm run dev
```

## Docs

- `docs/ARCHITECTURE.md` — system design, data flow, state machine
- `docs/REQUIREMENTS.md` — milestone checklist from the project brief
- `docs/FREE_TIER_LIMITS.md` — verified free-tier quotas + future cost notes

## Rules

- Never commit secrets. Never enable live payments without the owner's explicit approval.
- Server-side price lookup only. Never trust client-supplied prices.
- Webhooks verified by provider signature; fulfillment is idempotent.
