// Admin license management (all routes require an admin session).
//   GET    /api/admin/licenses?beat_id=<id>  — tiers + prices for one beat
//   POST   /api/admin/licenses               — create a license product
//   PUT    /api/admin/licenses?id=<id>       — update price / terms / active flag
//
// This is the ONLY place prices can be set. Public routes never accept prices.

import { queryAll, queryFirst, execute } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { isValidCurrency, isValidPriceCents } from "../../_lib/money.js";

const TIERS = new Set(["mp3", "wav", "stems", "exclusive"]);

function validateLicense(body, forCreate) {
  const errors = [];
  const data = {};

  if (forCreate || body.beat_id !== undefined) {
    if (typeof body.beat_id !== "string" || !/^bt_[a-z0-9_]{1,80}$/.test(body.beat_id)) errors.push("beat_id must be a valid beat id");
    else data.beat_id = body.beat_id;
  }
  if (forCreate || body.tier !== undefined) {
    if (!TIERS.has(body.tier)) errors.push("tier must be one of: mp3, wav, stems, exclusive");
    else data.tier = body.tier;
  }
  if (forCreate || body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80) errors.push("name is required (1-80 chars)");
    else data.name = body.name.trim();
  }
  if (body.price_cents !== undefined) {
    if (!isValidPriceCents(body.price_cents)) errors.push("price_cents must be a non-negative integer or null (null = offer-only)");
    else data.price_cents = body.price_cents;
  } else if (forCreate) {
    data.price_cents = null;
  }
  if (body.currency !== undefined) {
    if (!isValidCurrency(body.currency)) errors.push("currency must be a 3-letter code");
    else data.currency = body.currency;
  }
  if (body.deliverable !== undefined) {
    if (typeof body.deliverable !== "string" || !body.deliverable.trim() || body.deliverable.trim().length > 160) {
      errors.push("deliverable is required (1-160 chars)");
    } else data.deliverable = body.deliverable.trim();
  } else if (forCreate) {
    errors.push("deliverable is required (1-160 chars)");
  }
  if (body.terms_version !== undefined) {
    if (typeof body.terms_version !== "string" || !body.terms_version.trim() || body.terms_version.length > 60) {
      errors.push("terms_version must reference a row in license_terms");
    } else data.terms_version = body.terms_version.trim();
  }
  if (body.active !== undefined) {
    if (body.active !== 0 && body.active !== 1) errors.push("active must be 0 or 1");
    else data.active = body.active;
  }

  // Consistency: exclusive tier ⟺ exclusive flag ⟺ null price.
  const tier = data.tier !== undefined ? data.tier : body._existingTier;
  if (tier === "exclusive") {
    data.exclusive = 1;
    if (data.price_cents !== undefined && data.price_cents !== null) errors.push("exclusive licenses are offer-only: price_cents must be null");
    data.price_cents = null;
  } else if (tier) {
    data.exclusive = 0;
  }
  return { errors, data };
}

const COLUMNS = "id, beat_id, tier, name, price_cents, currency, exclusive, terms_version, deliverable, active, created_at";

export async function onRequest(context) {
  const { request, env } = context;
  const { unauthorized } = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  if (request.method === "GET") {
    const url = new URL(request.url);
    const beatId = url.searchParams.get("beat_id");
    if (!beatId || !/^bt_[a-z0-9_]{1,80}$/.test(beatId)) {
      return Response.json({ error: "valid ?beat_id=bt_* is required" }, { status: 400 });
    }
    const licenses = await queryAll(
      env,
      `SELECT ${COLUMNS} FROM licenses WHERE beat_id = ? ORDER BY CASE WHEN price_cents IS NULL THEN 1 ELSE 0 END, price_cents ASC`,
      [beatId]
    );
    return Response.json({ licenses });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const { errors, data } = validateLicense(body, true);
    if (errors.length) return Response.json({ error: "validation failed", details: errors }, { status: 400 });

    const beat = await queryFirst(env, "SELECT id, slug FROM beats WHERE id = ?", [data.beat_id]);
    if (!beat) return Response.json({ error: "beat not found" }, { status: 404 });
    const termsVersion = data.terms_version || `${data.tier}-v1`;
    const terms = await queryFirst(env, "SELECT version FROM license_terms WHERE version = ?", [termsVersion]);
    if (!terms) return Response.json({ error: `license_terms row '${termsVersion}' does not exist` }, { status: 400 });

    const id = `lic_${beat.slug.replace(/-/g, "_")}_${data.tier}`;
    try {
      await execute(
        env,
        `INSERT INTO licenses (id, beat_id, tier, name, price_cents, currency, exclusive, terms_version, deliverable, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.beat_id, data.tier, data.name, data.price_cents, data.currency || "usd",
         data.exclusive ?? 0, termsVersion, data.deliverable, data.active ?? 1]
      );
    } catch (e) {
      if (String(e.message || "").includes("UNIQUE")) {
        return Response.json({ error: "this beat already has a license for that tier" }, { status: 409 });
      }
      throw e;
    }
    const lic = await queryFirst(env, `SELECT ${COLUMNS} FROM licenses WHERE id = ?`, [id]);
    return Response.json({ license: lic }, { status: 201 });
  }

  if (request.method === "PUT") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id || !/^lic_[a-z0-9_]{1,100}$/.test(id)) {
      return Response.json({ error: "valid ?id=lic_* is required" }, { status: 400 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const existing = await queryFirst(env, `SELECT ${COLUMNS} FROM licenses WHERE id = ?`, [id]);
    if (!existing) return Response.json({ error: "not found" }, { status: 404 });

    body._existingTier = existing.tier;
    const { errors, data } = validateLicense(body, false);
    if (errors.length) return Response.json({ error: "validation failed", details: errors }, { status: 400 });

    if (data.terms_version) {
      const terms = await queryFirst(env, "SELECT version FROM license_terms WHERE version = ?", [data.terms_version]);
      if (!terms) return Response.json({ error: `license_terms row '${data.terms_version}' does not exist` }, { status: 400 });
    }

    const sets = [];
    const params = [];
    for (const k of ["name", "price_cents", "currency", "exclusive", "terms_version", "deliverable", "active"]) {
      if (data[k] !== undefined) {
        sets.push(`${k} = ?`);
        params.push(data[k]);
      }
    }
    if (sets.length === 0) return Response.json({ error: "nothing to update" }, { status: 400 });
    params.push(id);
    await execute(env, `UPDATE licenses SET ${sets.join(", ")} WHERE id = ?`, params);
    const lic = await queryFirst(env, `SELECT ${COLUMNS} FROM licenses WHERE id = ?`, [id]);
    return Response.json({ license: lic });
  }

  return Response.json({ error: "method not allowed" }, { status: 405 });
}
