-- JINZA Beat Store — D1 schema (migration 0001)
-- Run with: wrangler d1 execute jinza-db --file migrations/0001_schema.sql
-- All timestamps are UTC ISO-8601. Money stored as integer cents.

-- Beats (products)
CREATE TABLE beats (
  id            TEXT PRIMARY KEY,            -- e.g. 'bt_red_handed'
  slug          TEXT NOT NULL UNIQUE,        -- e.g. 'red-handed'
  title         TEXT NOT NULL,
  description   TEXT,
  genre         TEXT,
  mood          TEXT,                        -- comma-separated moods
  bpm           INTEGER,
  musical_key   TEXT,
  artwork_r2_key TEXT,                       -- public previews bucket
  preview_r2_key TEXT,                       -- tagged preview mp3, public bucket
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','published','unpublished','sold_exclusive')),
  featured      INTEGER NOT NULL DEFAULT 0,  -- 0/1
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_beats_status ON beats(status);
CREATE INDEX idx_beats_genre  ON beats(genre);

-- License products (one row per beat × license tier)
CREATE TABLE licenses (
  id              TEXT PRIMARY KEY,          -- e.g. 'lic_red_handed_basic'
  beat_id         TEXT NOT NULL REFERENCES beats(id),
  tier            TEXT NOT NULL
                  CHECK (tier IN ('mp3','wav','stems','exclusive')), -- owner-approved 2026-10-19
  name            TEXT NOT NULL,             -- display name, owner-approved
  price_cents     INTEGER CHECK (price_cents IS NULL OR price_cents >= 0), -- NULL = offer-only (exclusive)
  currency        TEXT NOT NULL DEFAULT 'usd',
  exclusive       INTEGER NOT NULL DEFAULT 0, -- 0/1
  terms_version   TEXT NOT NULL,             -- FK to license_terms.version active at sale
  deliverable     TEXT NOT NULL,             -- e.g. 'mp3','wav','stems' package id
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (beat_id, tier)
);

-- Versioned license terms (immutable once referenced by a sale)
CREATE TABLE license_terms (
  version     TEXT PRIMARY KEY,              -- e.g. 'basic-v1'
  tier        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body_md     TEXT NOT NULL,                 -- full terms, markdown; DRAFT until approved
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','approved','retired')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Customers (minimal: email only, collected at checkout)
CREATE TABLE customers (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Orders (internal state machine)
CREATE TABLE orders (
  id              TEXT PRIMARY KEY,          -- 'ord_...'
  customer_id     TEXT REFERENCES customers(id),
  email           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'created'
                  CHECK (status IN ('created','pending_payment','paid','fulfilled',
                                    'payment_failed','canceled','refunded','disputed')),
  total_cents     INTEGER NOT NULL CHECK (total_cents >= 0),
  currency        TEXT NOT NULL DEFAULT 'usd',
  access_token_hash TEXT,                    -- sha256 of passwordless download token
  access_token_expires TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_email  ON orders(email);

CREATE TABLE order_items (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  beat_id         TEXT NOT NULL REFERENCES beats(id),
  license_id      TEXT NOT NULL REFERENCES licenses(id),
  license_terms_version TEXT NOT NULL,       -- exact terms version accepted
  unit_price_cents INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'usd'
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Payment transactions (one row per provider attempt; both providers feed one order)
CREATE TABLE payments (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id),
  provider          TEXT NOT NULL CHECK (provider IN ('stripe','paypal')),
  provider_payment_id TEXT NOT NULL,         -- stripe payment_intent/session id or paypal order id
  amount_cents      INTEGER NOT NULL,
  currency          TEXT NOT NULL,
  status            TEXT NOT NULL
                    CHECK (status IN ('initiated','succeeded','failed','canceled','refunded','disputed')),
  raw_payload       TEXT,                    -- provider payload snapshot (JSON)
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, provider_payment_id)
);
CREATE INDEX idx_payments_order ON payments(order_id);

-- Webhook event log (idempotency: processed event ids)
CREATE TABLE webhook_events (
  id              TEXT PRIMARY KEY,          -- provider event id
  provider        TEXT NOT NULL,
  type            TEXT NOT NULL,
  order_id        TEXT REFERENCES orders(id),
  verified        INTEGER NOT NULL DEFAULT 0,
  processed       INTEGER NOT NULL DEFAULT 0,
  payload         TEXT NOT NULL,
  received_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, id)
);

-- License grants (created once per order item on verified payment; idempotent)
CREATE TABLE license_grants (
  id              TEXT PRIMARY KEY,
  order_id        TEXT NOT NULL REFERENCES orders(id),
  order_item_id   TEXT NOT NULL UNIQUE REFERENCES order_items(id),
  beat_id         TEXT NOT NULL REFERENCES beats(id),
  license_id      TEXT NOT NULL REFERENCES licenses(id),
  terms_version   TEXT NOT NULL,
  customer_email  TEXT NOT NULL,
  granted_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Download authorization / audit
CREATE TABLE download_tokens (
  id              TEXT PRIMARY KEY,
  grant_id        TEXT NOT NULL REFERENCES license_grants(id),
  token_hash      TEXT NOT NULL UNIQUE,
  r2_key          TEXT NOT NULL,             -- private delivery file
  expires_at      TEXT NOT NULL,
  max_uses        INTEGER NOT NULL DEFAULT 5,
  uses            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE download_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id    TEXT REFERENCES download_tokens(id),
  grant_id    TEXT NOT NULL REFERENCES license_grants(id),
  ip_hash     TEXT,                          -- hashed IP, not raw
  user_agent  TEXT,
  success     INTEGER NOT NULL,
  reason      TEXT,
  at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_dl_audit_grant ON download_audit(grant_id);

-- Admin users (single admin to start; password hash only, never plaintext)
CREATE TABLE admin_users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,               -- argon2/bcrypt via Workers
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
