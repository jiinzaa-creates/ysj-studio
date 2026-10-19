# Requirements checklist (from project brief)

## Pages (M2)
- [ ] Home — branding, featured beats, new releases, genres, CTAs
- [ ] Catalog — search + filter, verified metadata
- [ ] Beat detail — art, preview, title/genre/mood/BPM/key, licenses + prices
- [ ] Checkout — summary, license select, Stripe + PayPal
- [ ] Success — confirmation after backend-verified payment
- [ ] Downloads — authorized-only access
- [ ] Licensing info — terms + per-purchase terms link
- [ ] About, Contact, Privacy + Terms (drafts marked for review)

## Catalog/admin (M3)
- [ ] Secure beat CRUD: publish/unpublish, metadata, artwork, preview, license prices
- [ ] No public mutation of catalog or prices

## Licenses (M3/M6)
- [ ] Configurable tiers per beat (names/terms/prices = owner-approved only)
- [ ] Versioned terms; exact version stored per purchase
- [ ] Exclusive-sale transactional protection (no double-sell)

## Stripe (M4) / PayPal (M5)
- [ ] Server-side session/order creation, server-side price lookup
- [ ] Order created before redirect; verified webhooks; idempotent fulfillment
- [ ] Success/fail/cancel/refund handling; sandbox/test only until approved

## State machine (M4/M5)
- [ ] CREATED → PENDING_PAYMENT → PAID → FULFILLED; plus FAILED/CANCELED/REFUNDED/DISPUTED
- [ ] Both providers feed one order system; browser close can't break fulfillment

## Delivery (M6)
- [ ] Private R2 masters; short-lived authorized downloads; limits + audit log

## Data (M3)
- [ ] D1 tables per schema; constraints; parameterized SQL; transactions
- [ ] Minimal customer data; passwordless token access (hashed, expiring)

## Security/ops (M7)
- [ ] Validation, secret mgmt, admin auth, webhook verification, CSRF, rate limits,
      safe errors, security headers, refund/dispute runbook

## Tests (M7)
- [ ] Automated: pricing, state transitions, auth, fulfillment, licensing
- [ ] Manual matrix: previews, Stripe/PayPal success+fail+cancel, forged/dup webhooks,
      browser-close, unauthorized downloads, price tampering, concurrent exclusives,
      refunds/disputes, mobile/desktop

## Deployment (M7/M8)
- [ ] Documented: accounts, env/secrets, migrations, R2 setup, Stripe/PayPal
      test+live config, webhooks, DNS, deploy commands, rollback/backup
- [ ] Live payments only after explicit owner approval

## Definition of done
Real customer: find beat → preview → select license → pay (Stripe/PayPal) →
verified confirmation → download correct files → accurate license terms →
return access per security rules. Admin manages beats/prices/licenses/orders securely.
