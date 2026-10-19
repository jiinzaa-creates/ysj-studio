// Admin authentication for Pages Functions.
// - Passwords: PBKDF2-SHA256 via WebCrypto (210k iterations). Only the hash is
//   stored in `admin_users.password_hash`. Never store or log plaintext.
// - Sessions: stateless HMAC-signed cookie `ysj_admin` (adminId + expiry),
//   signed with the ADMIN_SESSION_SECRET env secret. No session table needed.
//
// The initial admin row is created offline with scripts/create-admin.mjs
// (see docs/PROVISIONING.md). Rate limiting for /api/admin/login is enforced
// via Cloudflare rate-limit rules (M7), not here.

import { queryFirst } from "./db.js";

const PBKDF2_ITERATIONS = 210_000;
const SALT_LEN = 16;
const KEY_LEN = 32;
const SESSION_COOKIE = "ysj_admin";
const SESSION_TTL_SECONDS = 12 * 3600;

function b64encode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

function b64urlEncode(bytes) {
  return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str) {
  let s = str.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return b64decode(s);
}

async function pbkdf2(password, salt, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    KEY_LEN * 8
  );
  return new Uint8Array(bits);
}

/** Hash a new password. Throws if it is too short. Format: pbkdf2$iter$salt$hash */
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("password must be a string of at least 12 characters");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64encode(salt)}$${b64encode(hash)}`;
}

/** Constant-time password verification against a stored hash. */
export async function verifyPassword(password, stored) {
  try {
    if (typeof password !== "string" || typeof stored !== "string") return false;
    const [algo, iterStr, saltB64, hashB64] = stored.split("$");
    if (algo !== "pbkdf2" || !iterStr || !saltB64 || !hashB64) return false;
    const iterations = parseInt(iterStr, 10);
    if (!Number.isFinite(iterations) || iterations < 100_000) return false;
    const salt = b64decode(saltB64);
    const expected = b64decode(hashB64);
    const actual = await pbkdf2(password, salt, iterations);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

async function hmacSign(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}

/** Create a signed session token for an admin id. */
export async function createSessionToken(env, adminId, ttlSeconds = SESSION_TTL_SECONDS) {
  const secret = env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured");
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload =
    `${b64urlEncode(new TextEncoder().encode(adminId))}.` +
    `${b64urlEncode(new TextEncoder().encode(String(exp)))}`;
  const sig = b64urlEncode(await hmacSign(secret, payload));
  return `${payload}.${sig}`;
}

/** Verify a session token. Returns { adminId } or null. */
export async function verifySessionToken(env, token) {
  try {
    const secret = env.ADMIN_SESSION_SECRET;
    if (!secret || typeof token !== "string") return null;
    const [p1, p2, sig] = token.split(".");
    if (!p1 || !p2 || !sig) return null;
    const expected = b64urlEncode(await hmacSign(secret, `${p1}.${p2}`));
    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    const exp = parseInt(new TextDecoder().decode(b64urlDecode(p2)), 10);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
    return { adminId: new TextDecoder().decode(b64urlDecode(p1)) };
  } catch {
    return null;
  }
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

/** Resolve the logged-in admin from the request cookie, or null. */
export async function getAdminFromRequest(request, env) {
  const session = await verifySessionToken(env, getCookie(request, SESSION_COOKIE));
  if (!session) return null;
  return await queryFirst(env, "SELECT id, email, created_at FROM admin_users WHERE id = ?", [
    session.adminId,
  ]);
}

/**
 * Guard for admin routes. Returns { admin, unauthorized } — when `unauthorized`
 * is non-null, return it directly (401).
 */
export async function requireAdmin(request, env) {
  try {
    const admin = await getAdminFromRequest(request, env);
    if (!admin) throw new Error("no session");
    return { admin, unauthorized: null };
  } catch {
    return { admin: null, unauthorized: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
}

/** Set-Cookie value for a fresh login session. */
export function sessionCookieHeader(token, maxAgeSeconds = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

/** Set-Cookie value that clears the session. */
export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
