// GET /api/beats — published beats with active licenses.
// Query params: search, genre, mood, featured=1. All filters are optional and
// every value is bound as a parameter (never interpolated into SQL).
// Returns 501 "M3 provisioning pending" when the D1 binding is missing.

import { queryAll, provisioningPending } from "../_lib/db.js";

const BEAT_COLUMNS = [
  "b.id",
  "b.slug",
  "b.title",
  "b.description",
  "b.genre",
  "b.mood",
  "b.bpm",
  "b.musical_key",
  "b.artwork_r2_key",
  "b.preview_r2_key",
  "b.status",
  "b.featured",
  "b.created_at",
].join(", ");

/** Escape LIKE wildcards so user input cannot widen the match. */
function likePattern(value) {
  return `%${value.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get("search") || "").trim().slice(0, 80);
    const genre = (url.searchParams.get("genre") || "").trim().slice(0, 40);
    const mood = (url.searchParams.get("mood") || "").trim().slice(0, 40);
    const featuredOnly = url.searchParams.get("featured") === "1";

    const clauses = ["b.status = 'published'"];
    const params = [];
    if (search) {
      clauses.push("(b.title LIKE ? ESCAPE '\\' OR b.genre LIKE ? ESCAPE '\\' OR b.mood LIKE ? ESCAPE '\\')");
      const s = likePattern(search);
      params.push(s, s, s);
    }
    if (genre) {
      clauses.push("b.genre = ?");
      params.push(genre);
    }
    if (mood) {
      clauses.push("b.mood LIKE ? ESCAPE '\\'");
      params.push(likePattern(mood));
    }
    if (featuredOnly) clauses.push("b.featured = 1");

    const beats = await queryAll(
      env,
      `SELECT ${BEAT_COLUMNS} FROM beats b WHERE ${clauses.join(" AND ")}
       ORDER BY b.featured DESC, b.created_at DESC LIMIT 200`,
      params
    );

    if (beats.length === 0) return Response.json({ beats: [] });

    const ids = beats.map((b) => b.id);
    const placeholders = ids.map(() => "?").join(",");
    const licenses = await queryAll(
      env,
      `SELECT id, beat_id, tier, name, price_cents, currency, exclusive, terms_version, deliverable
       FROM licenses WHERE beat_id IN (${placeholders}) AND active = 1
       ORDER BY CASE WHEN price_cents IS NULL THEN 1 ELSE 0 END, price_cents ASC`,
      ids
    );

    const byBeat = new Map();
    for (const lic of licenses) {
      if (!byBeat.has(lic.beat_id)) byBeat.set(lic.beat_id, []);
      byBeat.get(lic.beat_id).push(lic);
    }
    return Response.json({
      beats: beats.map((b) => ({ ...b, licenses: byBeat.get(b.id) || [] })),
    });
  } catch (e) {
    if (e && e.code === "DB_BINDING_MISSING") return provisioningPending();
    throw e;
  }
}
