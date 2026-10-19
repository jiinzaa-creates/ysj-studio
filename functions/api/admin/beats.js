// Admin beat catalog management (all routes require an admin session).
//   GET    /api/admin/beats[?status=]  — list all beats, any status
//   POST   /api/admin/beats           — create a beat (starts as draft)
//   PUT    /api/admin/beats?id=<id>   — update fields / publish / unpublish
//
// 'sold_exclusive' is system-managed (set only by fulfillment) and cannot be
// assigned here. Prices are managed via /api/admin/licenses, never here.

import { queryAll, queryFirst, execute } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";

const WRITABLE_STATUSES = new Set(["draft", "published", "unpublished"]);
const SLUG_RE = /^[a-z0-9-]{1,60}$/;
const R2_KEY_RE = /^[\w\-./]{1,255}$/;

function strOrNull(v, max) {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined; // invalid
  const t = v.trim();
  if (t === "") return null;
  return t.length <= max ? t : undefined;
}

function intOrNull(v, min, max) {
  if (v === null || v === undefined) return null;
  if (!Number.isInteger(v) || v < min || v > max) return undefined;
  return v;
}

/** Validate a beat payload. `forCreate=true` requires slug + title. */
function validateBeat(body, forCreate) {
  const errors = [];
  const data = {};

  if (forCreate || body.slug !== undefined) {
    if (typeof body.slug !== "string" || !SLUG_RE.test(body.slug)) errors.push("slug must match ^[a-z0-9-]{1,60}$");
    else data.slug = body.slug;
  }
  if (forCreate || body.title !== undefined) {
    const t = strOrNull(body.title, 120);
    if (t === undefined || (forCreate && !t)) errors.push("title is required (1-120 chars)");
    else if (t !== undefined) data.title = t;
  }
  for (const f of ["description"]) {
    if (body[f] !== undefined) {
      const v = strOrNull(body[f], 2000);
      if (v === undefined) errors.push(`${f} must be a string ≤ 2000 chars`);
      else data[f] = v;
    }
  }
  for (const f of ["genre", "mood", "musical_key"]) {
    if (body[f] !== undefined) {
      const v = strOrNull(body[f], 80);
      if (v === undefined) errors.push(`${f} must be a string ≤ 80 chars`);
      else data[f] = v;
    }
  }
  if (body.bpm !== undefined) {
    const v = intOrNull(body.bpm, 40, 300);
    if (v === undefined) errors.push("bpm must be an integer 40-300 or null");
    else data.bpm = v;
  }
  for (const f of ["artwork_r2_key", "preview_r2_key"]) {
    if (body[f] !== undefined) {
      const v = strOrNull(body[f], 255);
      if (v === undefined || (v && (!R2_KEY_RE.test(v) || v.includes("..") || v.startsWith("/")))) {
        errors.push(`${f} must be a safe relative object key`);
      } else data[f] = v;
    }
  }
  if (body.status !== undefined) {
    if (!WRITABLE_STATUSES.has(body.status)) errors.push("status must be draft, published, or unpublished");
    else data.status = body.status;
  }
  if (body.featured !== undefined) {
    if (body.featured !== 0 && body.featured !== 1) errors.push("featured must be 0 or 1");
    else data.featured = body.featured;
  }
  return { errors, data };
}

const COLUMNS = "id, slug, title, description, genre, mood, bpm, musical_key, artwork_r2_key, preview_r2_key, status, featured, created_at, updated_at";

export async function onRequest(context) {
  const { request, env } = context;
  const { unauthorized } = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  if (request.method === "GET") {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const clauses = [];
    const params = [];
    if (status) {
      if (!["draft", "published", "unpublished", "sold_exclusive"].includes(status)) {
        return Response.json({ error: "invalid status filter" }, { status: 400 });
      }
      clauses.push("status = ?");
      params.push(status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const beats = await queryAll(env, `SELECT ${COLUMNS} FROM beats ${where} ORDER BY updated_at DESC LIMIT 200`, params);
    return Response.json({ beats });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const { errors, data } = validateBeat(body, true);
    if (errors.length) return Response.json({ error: "validation failed", details: errors }, { status: 400 });
    const id = `bt_${data.slug.replace(/-/g, "_")}`;
    try {
      await execute(
        env,
        `INSERT INTO beats (id, slug, title, description, genre, mood, bpm, musical_key, artwork_r2_key, preview_r2_key, status, featured)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [id, data.slug, data.title, data.description ?? null, data.genre ?? null, data.mood ?? null,
         data.bpm ?? null, data.musical_key ?? null, data.artwork_r2_key ?? null, data.preview_r2_key ?? null,
         data.featured ?? 0]
      );
    } catch (e) {
      if (String(e.message || "").includes("UNIQUE")) {
        return Response.json({ error: "a beat with this slug already exists" }, { status: 409 });
      }
      throw e;
    }
    const beat = await queryFirst(env, `SELECT ${COLUMNS} FROM beats WHERE id = ?`, [id]);
    return Response.json({ beat }, { status: 201 });
  }

  if (request.method === "PUT") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id || !/^bt_[a-z0-9_]{1,80}$/.test(id)) {
      return Response.json({ error: "valid ?id=bt_* is required" }, { status: 400 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }
    const { errors, data } = validateBeat(body, false);
    if (errors.length) return Response.json({ error: "validation failed", details: errors }, { status: 400 });
    const existing = await queryFirst(env, "SELECT id FROM beats WHERE id = ?", [id]);
    if (!existing) return Response.json({ error: "not found" }, { status: 404 });

    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(data)) {
      if (k === "slug") continue; // slugs are immutable once created
      sets.push(`${k} = ?`);
      params.push(v);
    }
    if (sets.length === 0) return Response.json({ error: "nothing to update" }, { status: 400 });
    sets.push("updated_at = datetime('now')");
    params.push(id);
    await execute(env, `UPDATE beats SET ${sets.join(", ")} WHERE id = ?`, params);
    const beat = await queryFirst(env, `SELECT ${COLUMNS} FROM beats WHERE id = ?`, [id]);
    return Response.json({ beat });
  }

  return Response.json({ error: "method not allowed" }, { status: 405 });
}
