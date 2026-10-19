// POST /api/admin/logout — clears the admin session cookie.

import { requireAdmin, clearSessionCookieHeader } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const { unauthorized } = await requireAdmin(request, env);
  if (unauthorized) return unauthorized;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": clearSessionCookieHeader() },
  });
}
