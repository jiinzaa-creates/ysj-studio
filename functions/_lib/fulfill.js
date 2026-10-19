// Order state machine + idempotent fulfillment.
// Both payment providers (Stripe in M4, PayPal in M5) feed these same functions.
//
// Lifecycle: CREATED → PENDING_PAYMENT → PAID → FULFILLED
// Side states: PAYMENT_FAILED, CANCELED, REFUNDED, DISPUTED
//
// Only a verified PAID order may grant licenses. Webhook handlers call
// transitionOrder()/fulfillOrder(); repeated webhook deliveries are safe
// (idempotent grants via license_grants.order_item_id UNIQUE + status checks).

import { queryAll, queryFirst, execute, batch } from "./db.js";

export const ORDER_STATUSES = [
  "created",
  "pending_payment",
  "paid",
  "fulfilled",
  "payment_failed",
  "canceled",
  "refunded",
  "disputed",
];

const TRANSITIONS = {
  created: ["pending_payment", "canceled"],
  pending_payment: ["paid", "payment_failed", "canceled"],
  paid: ["fulfilled", "refunded", "disputed"],
  fulfilled: ["refunded", "disputed"],
  payment_failed: ["pending_payment", "canceled"],
  canceled: [],
  refunded: ["disputed"],
  disputed: ["refunded"],
};

/** Is `to` a legal move from `from`? */
export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/** Load an order row by id (or null). */
export async function getOrder(env, orderId) {
  if (typeof orderId !== "string" || !orderId) return null;
  return await queryFirst(env, "SELECT * FROM orders WHERE id = ?", [orderId]);
}

/**
 * Move an order to a new status. The UPDATE is conditional on the row still
 * being in the state we read, so concurrent webhook deliveries cannot both win.
 * Returns { ok, from, to } or { ok:false, reason }.
 */
export async function transitionOrder(env, orderId, to, expectedFrom = null) {
  const order = await getOrder(env, orderId);
  if (!order) return { ok: false, reason: "not_found" };
  if (!ORDER_STATUSES.includes(to)) return { ok: false, reason: "unknown_status" };
  if (!canTransition(order.status, to)) {
    return { ok: false, reason: "illegal_transition", from: order.status, to };
  }
  if (expectedFrom && !expectedFrom.includes(order.status)) {
    return { ok: false, reason: "unexpected_state", from: order.status };
  }
  const res = await execute(
    env,
    "UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ? AND status = ?",
    [to, orderId, order.status]
  );
  if (res.meta.changes === 0) return { ok: false, reason: "concurrent_update" };
  return { ok: true, from: order.status, to };
}

/**
 * Fulfill a PAID order: create one license_grants row per order item and mark
 * the order FULFILLED. Idempotent — safe to call on every webhook redelivery:
 * already-fulfilled orders return { ok:true, already:true }, and grant inserts
 * use INSERT OR IGNORE on the UNIQUE order_item_id.
 *
 * Exclusive licenses also flip the beat to 'sold_exclusive', but ONLY if it is
 * still 'published' — the conditional UPDATE is the transactional guard against
 * two simultaneous exclusive purchases.
 */
export async function fulfillOrder(env, orderId) {
  const order = await getOrder(env, orderId);
  if (!order) return { ok: false, reason: "not_found" };
  if (order.status === "fulfilled") return { ok: true, already: true };
  if (order.status !== "paid") return { ok: false, reason: "not_paid", status: order.status };

  const items = await queryAll(env, "SELECT * FROM order_items WHERE order_id = ?", [orderId]);

  if (items.length > 0) {
    const grantStmts = items.map((it) => [
      `INSERT OR IGNORE INTO license_grants
         (id, order_id, order_item_id, beat_id, license_id, terms_version, customer_email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`lg_${it.id}`, orderId, it.id, it.beat_id, it.license_id, it.license_terms_version, order.email],
    ]);
    await batch(env, grantStmts);

    for (const it of items) {
      const lic = await queryFirst(env, "SELECT exclusive FROM licenses WHERE id = ?", [it.license_id]);
      if (lic && lic.exclusive === 1) {
        // Only the first verified exclusive payment wins; losers keep their
        // row untouched and must be refunded by the dispute/refund flow.
        await execute(
          env,
          "UPDATE beats SET status = 'sold_exclusive', updated_at = datetime('now') WHERE id = ? AND status = 'published'",
          [it.beat_id]
        );
      }
    }
  }

  return await transitionOrder(env, orderId, "fulfilled", ["paid"]);
}
