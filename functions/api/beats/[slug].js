// GET /api/beats/:slug — one published beat with its active licenses.
// Returns 404 for unknown slugs or unpublished beats (no catalog leaking).

import { queryAll, queryFirst, provisioningPending } from "../../_lib/db.js";

const BEAT_COLUMNS = [
  "id",
  "slug",
  "title",
  "description",
  "genre",
  "mood",
  "bpm",
  "musical_key",
  "artwork_r2_key",
  "preview_r2_key",
  "status",
  "featured",
  "created_at",
].join(", ");

export async function onRequestGet({ params, env }) {
  const slug = params.slug || "";
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  try {
    const beat = await queryFirst(
      env,
      `SELECT ${BEAT_COLUMNS} FROM beats WHERE slug = ? AND status = 'published'`,
      [slug]
    );
    if (!beat) return Response.json({ error: "not found" }, { status: 404 });

    const licenses = await queryAll(
      env,
      `SELECT id, beat_id, tier, name, price_cents, currency, exclusive, terms_version, deliverable
       FROM licenses WHERE beat_id = ? AND active = 1
       ORDER BY CASE WHEN price_cents IS NULL THEN 1 ELSE 0 END, price_cents ASC`,
      [beat.id]
    );
    return Response.json({ beat, licenses });
  } catch (e) {
    if (e && e.code === "DB_BINDING_MISSING") return provisioningPending();
    throw e;
  }
}
