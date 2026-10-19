# M3 Provisioning Checklist — Cloudflare resources

The code is done; these Cloudflare resources do not exist yet because no API
credentials are available to the build environment. Complete the steps below
in the Cloudflare dashboard (or a later authenticated browser task), then the
store's backend goes live.

Prerequisite: `npx wrangler login` (authenticates wrangler to the YSJ Studio
Cloudflare account — the same account that hosts automa.run.place).

## 1. D1 database

```bash
npx wrangler d1 create jinza-db
```

Copy the printed `database_id` into `wrangler.toml`, replacing
`"<FILL AFTER PROVISIONING>"`.

Apply the schema + seed:

```bash
npx wrangler d1 execute jinza-db --file migrations/0001_schema.sql --remote
node scripts/seed.mjs > scripts/seed.sql
npx wrangler d1 execute jinza-db --file scripts/seed.sql --remote
```

Verify:

```bash
npx wrangler d1 execute jinza-db --command "SELECT COUNT(*) AS beats FROM beats; SELECT COUNT(*) AS licenses FROM licenses;" --remote
```

Expected: 11 beats, 44 licenses.

## 2. R2 buckets

```bash
npx wrangler r2 bucket create jinza-previews
npx wrangler r2 bucket create jinza-delivery
```

- `jinza-previews` must be **public** (covers + tagged preview MP3s). In the
  dashboard: R2 → jinza-previews → Settings → Public access → enable (r2.dev
  or a custom domain). Upload the files from `public/assets/covers/` and
  `public/assets/previews/` preserving paths, e.g.:
  `covers/red-handed.jpg`, `previews/red-handed.mp3` (these are the
  `artwork_r2_key` / `preview_r2_key` values the seed wrote).
- `jinza-delivery` stays **private**. Upload full masters/stems later under
  `delivery/<beat-slug>/<tier>/<filename>` (see `functions/_lib/r2.js`).

## 3. Secrets (never commit these)

```bash
npx wrangler secret put ADMIN_SESSION_SECRET
# paste a long random string (e.g. output of: openssl rand -hex 32)

# R2 S3 API token for presigned download URLs:
# Dashboard → R2 → Manage R2 API Tokens → Create (Object Read & Write on jinza-delivery)
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_S3_ACCESS_KEY_ID
npx wrangler secret put R2_S3_SECRET_ACCESS_KEY
```

Stripe/PayPal secrets come in M4/M5.

## 4. Admin user

```bash
node scripts/create-admin.mjs you@example.com 'a-long-password-here' > scripts/admin.sql
npx wrangler d1 execute jinza-db --file scripts/admin.sql --remote
rm scripts/admin.sql   # contains only the hash, but keep hygiene
```

Log in at `POST /api/admin/login` (an admin UI page ships with the M3 frontend
follow-up; until then use curl or the browser devtools).

## 5. Deploy

Option A (recommended): connect the GitHub repo `jiinzaa-creates/ysj-studio` to
Cloudflare Pages — dashboard → Workers & Pages → Create → Pages → Connect to
Git → select the repo, build output directory `public`. Every push deploys.

Option B: `npx wrangler pages deploy public`

## 6. Verify

- `GET https://<site>/api/beats` → 11 beats with licenses (200, JSON)
- `GET https://<site>/api/beats/underneath` → the beat + 4 license tiers
- `POST https://<site>/api/admin/login` without credentials → 401
- Before provisioning, the same API routes return **501 "M3 provisioning
  pending"** instead of crashing.

## What remains after this checklist

- Upload delivery masters/stems to `jinza-delivery` (per beat/tier).
- Point preview URLs at the public bucket (or keep serving from `public/assets`).
- M4: Stripe sandbox checkout + webhooks. M5: PayPal sandbox checkout + webhooks.
- M6: download authorization endpoints using `functions/_lib/r2.js`.
