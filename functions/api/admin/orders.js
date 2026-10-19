// Admin order views (read-only; all routes require an admin session).
//   GET /api/admin/orders[?status=][?limit=]  — order list, newest first
//   GET /api/admin/orders?id=<id>             — order + items + payments + grants
//
// Status changes happen only through the fulfillment flow (webhooks in M4/M5);
// there is no manual status override here, by design.

import { queryAll, queryFirst } from "../../_lib/db.js";
import { requireAdmin } from "../../_lib/auth.js";
import { ORDER_STATUSES } from "../../_lib/fulfill.js";

const ORDER_COLUMNS = "id, customer_id, email, status, total_cents, currency, created_at, updated_at";

export async function onRequestGet({ request, env }) {
  const { unauthorized } = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    if (!/^ord_[A-Za-z0-9_-]{1,80}$/.test(id)) {
      return Response.json({ error: "valid ?id=ord_* is required" }, { status: 400 });
    }
    const order = await queryFirst(env, `SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`, [id]);
    if (!order) return Response.json({ error: "not found" }, { status: 404 });
    const items = await queryAll(
      env,
      `SELECT oi.*, b.title AS beat_title, l.name AS license_name
       FROM order_items oi
       JOIN beats b ON b.id = oi.beat_id
       JOIN licenses l ON l.id = oi.license_id
       WHERE oi.order_id = ?`,
      [id]
    );
    const payments = await queryAll(
      env,
      "SELECT id, provider, provider_payment_id, amount_cents, currency, status, created_at, updated_at FROM payments WHERE order_id = ? ORDER BY created_at DESC",
      [id]
    );
    const grants = await queryAll(
      env,
      "SELECT id, order_item_id, beat_id, license_id, terms_version, customer_email, granted_at FROM license_grants WHERE order_id = ?",
      [id]
    );
    return Response.json({ order, items, payments, grants });
  }

  const status = url.searchParams.get("status");
  const clauses = [];
  const params = [];
  if (status) {
    if (!ORDER_STATUSES.includes(status)) {
      return Response.json({ error: `status must be one of: ${ORDER_STATUSES.join(", ")}` }, { status: 400 });
    }
    clauses.push("status = ?");
    params.push(status);
  }
  let limit = parseInt(url.searchParams.get("limit") || "50", 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  limit = Math.min(limit, 200);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const orders = await queryAll(
    env,
    `SELECT ${ORDER_COLUMNS} FROM orders ${where} ORDER BY created_at DESC LIMIT ${limit}`,
    params
  );
  return Response.json({ orders });
}
