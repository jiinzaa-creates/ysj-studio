// POST /api/admin/login — { email, password } → sets HttpOnly session cookie.
// Rate limiting is enforced by Cloudflare rate-limit rules (see M7), not here.

import { queryFirst } from "../../_lib/db.js";
import { verifyPassword, createSessionToken, sessionCookieHeader } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 160) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return Response.json({ error: "email and password are required" }, { status: 400 });
  }

  let user = null;
  try {
    user = await queryFirst(env, "SELECT id, email, password_hash FROM admin_users WHERE email = ?", [email]);
  } catch (e) {
    if (e && e.code === "DB_BINDING_MISSING") {
      const { provisioningPending } = await import("../../_lib/db.js");
      return provisioningPending();
    }
    throw e;
  }

  const ok = user && (await verifyPassword(password, user.password_hash));
  if (!ok) {
    // Generic message: do not reveal whether the email exists.
    return Response.json({ error: "invalid credentials" }, { status: 401 });
  }

  const token = await createSessionToken(env, user.id);
  return new Response(JSON.stringify({ ok: true, email: user.email }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookieHeader(token),
    },
  });
}
