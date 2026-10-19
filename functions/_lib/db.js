// D1 query wrapper — parameterized statements ONLY. Never interpolate values
// into SQL strings; always pass them via `params`.
//
// Usage:
//   import { queryAll, queryFirst, execute, batch } from "../_lib/db.js";
//   const beats = await queryAll(env, "SELECT * FROM beats WHERE status = ?", ["published"]);

export function getDb(env) {
  if (!env || !env.DB) {
    const err = new Error("D1 binding 'DB' is not configured");
    err.code = "DB_BINDING_MISSING";
    throw err;
  }
  return env.DB;
}

/** Run a SELECT returning all rows as plain objects. */
export async function queryAll(env, sql, params = []) {
  const res = await getDb(env).prepare(sql).bind(...params).all();
  return res.results || [];
}

/** Run a SELECT returning the first row, or null. */
export async function queryFirst(env, sql, params = []) {
  const row = await getDb(env).prepare(sql).bind(...params).first();
  return row === undefined ? null : row;
}

/** Run an INSERT/UPDATE/DELETE. Returns the D1 result (meta.changes, etc.). */
export async function execute(env, sql, params = []) {
  return await getDb(env).prepare(sql).bind(...params).run();
}

/**
 * Run multiple parameterized statements in one D1 batch (transactional).
 * statements: Array of [sql, params].
 */
export async function batch(env, statements) {
  const db = getDb(env);
  const prepared = statements.map(([sql, params]) => db.prepare(sql).bind(...(params || [])));
  return await db.batch(prepared);
}

/** Standard 501 response when the D1 database has not been provisioned yet. */
export function provisioningPending() {
  return Response.json(
    {
      error: "M3 provisioning pending",
      detail: "The D1 database 'jinza-db' is not bound yet. See docs/PROVISIONING.md.",
    },
    { status: 501 }
  );
}
