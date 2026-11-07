// POST /api/contact — contact-form endpoint (production-company site).
// Sends the message to the studio via MailChannels (free, no API key) and,
// best-effort, stores it in D1 as a backup.
//
// IMPORTANT — verified 2026-11-06, read before debugging delivery:
// - The D1 database 'jinza-db' is NOT provisioned in the production
//   Cloudflare account (GET /api/beats returns 501 "M3 provisioning
//   pending"). D1 storage below is therefore BEST-EFFORT: if the DB binding
//   is missing, or the contact_messages table does not exist yet, the insert
//   is skipped and the submission still proceeds. Apply
//   migrations/0002_contact_messages.sql once D1 is provisioned.
// - MailChannels needs DNS authorization for the sending domain to deliver
//   reliably: an SPF record including relay.mailchannels.net and a
//   _mailchannels TXT lockdown record on ysjstudio.run.place. Neither exists
//   today (checked 2026-11-06) and DNS changes need the owner. If
//   MailChannels rejects the message, this endpoint returns 502 and the
//   visitor is directed to DM @yessirjinza — it never reports success for
//   a message that was not delivered.
// - INTERIM destination: jiinzaa@gmail.com. No business email exists yet;
//   switch CONTACT_TO to it when one is created.

const CONTACT_TO = "jiinzaa@gmail.com"; // INTERIM — see note above
const CONTACT_FROM = "noreply@ysjstudio.run.place";
const CONTACT_FROM_NAME = "YSJ Studio — Contact Form";

const TOPICS = {
  general: "General inquiry",
  custom: "Custom production",
  sync: "Sync / commercial licensing",
  publishing: "Publishing administration",
  collaboration: "Collaboration",
  support: "Support",
};

const MAX_PER_HOUR_PER_IP = 5;

function json(body, status = 200) {
  return Response.json(body, { status });
}

/** Strip control characters (keep printable text + newlines/tabs). */
function clean(value, max) {
  return String(value || "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .trim()
    .slice(0, max);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

async function sha256Hex(text) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "unavailable";
  }
}

/**
 * Best-effort D1 insert. Never throws: returns true when the row was stored,
 * false when D1 is missing/unbound or the table does not exist yet.
 */
async function storeInD1(env, row) {
  try {
    if (!env || !env.DB) return false;
    const res = await env.DB.prepare(
      `INSERT INTO contact_messages
         (id, created_at, topic, name, email, message, ip_hash, email_sent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        row.id,
        row.createdAt,
        row.topic,
        row.name,
        row.email,
        row.message,
        row.ipHash,
        row.emailSent ? 1 : 0
      )
      .run();
    return res && res.success !== false;
  } catch (err) {
    console.error("[contact] D1 store skipped:", err && err.message ? err.message : err);
    return false;
  }
}

/** Best-effort rate limit via D1. Returns true when the IP is over the limit. */
async function overRateLimit(env, ipHash) {
  try {
    if (!env || !env.DB) return false; // no D1 yet: cannot enforce, do not block
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM contact_messages
        WHERE ip_hash = ? AND created_at >= datetime('now', '-1 hour')`
    )
      .bind(ipHash)
      .first();
    return row && Number(row.n || 0) >= MAX_PER_HOUR_PER_IP;
  } catch {
    return false; // table missing etc. — do not block the submission
  }
}

async function sendViaMailChannels({ topicLabel, name, email, message }) {
  const body = [
    `New contact-form message — YSJ Studio`,
    ``,
    `Topic: ${topicLabel}`,
    `Name: ${name}`,
    `Email: ${email}`,
    ``,
    `Message:`,
    message,
    ``,
    `-- Sent from the YSJ Studio contact form (www.ysjstudio.run.place/contact.html)`,
  ].join("\n");

  const payload = {
    personalizations: [{ to: [{ email: CONTACT_TO, name: "YSJ Studio" }] }],
    from: { email: CONTACT_FROM, name: CONTACT_FROM_NAME },
    reply_to: { email, name },
    subject: `[YSJ Studio] ${topicLabel} — ${name}`,
    content: [{ type: "text/plain", value: body }],
  };

  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  return res;
}

async function handlePost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "bad_request", detail: "Request body must be JSON." }, 400);
  }

  // Honeypot: bots fill the hidden "website" field. Silently pretend success.
  if (data.website) return json({ ok: true });

  const topic = clean(data.topic, 40);
  const name = clean(data.name, 100);
  const email = clean(data.email, 254);
  const message = clean(data.message, 5000);

  if (!TOPICS[topic]) {
    return json({ ok: false, error: "validation", detail: "Choose a valid topic." }, 400);
  }
  if (name.length < 2) {
    return json({ ok: false, error: "validation", detail: "Please enter your name." }, 400);
  }
  if (!isValidEmail(email)) {
    return json({ ok: false, error: "validation", detail: "Please enter a valid email address." }, 400);
  }
  if (message.length < 10) {
    return json({ ok: false, error: "validation", detail: "Please write a message (at least 10 characters)." }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ipHash = await sha256Hex(ip || "unknown");

  if (await overRateLimit(env, ipHash)) {
    return json(
      {
        ok: false,
        error: "rate_limited",
        detail: "Too many messages from this address. Please try again later or DM @yessirjinza on Instagram.",
      },
      429
    );
  }

  const row = {
    id: `cm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    topic,
    name,
    email,
    message,
    ipHash,
    emailSent: false,
  };

  // MailChannels is the delivery path; D1 is only a backup.
  let emailSent = false;
  let mailError = "";
  let mailStatus = 0; // upstream HTTP status from MailChannels (0 = network error)
  try {
    const res = await sendViaMailChannels({
      topicLabel: TOPICS[topic],
      name,
      email,
      message,
    });
    mailStatus = res.status;
    if (res.status === 202) {
      emailSent = true;
    } else {
      mailError = await res.text().catch(() => "");
      console.error(`[contact] MailChannels rejected (${res.status}):`, mailError.slice(0, 500));
    }
  } catch (err) {
    mailError = err && err.message ? err.message : String(err);
    console.error("[contact] MailChannels request failed:", mailError);
  }

  row.emailSent = emailSent;
  const stored = await storeInD1(env, row);

  if (!emailSent) {
    // Never claim success for an undelivered message. The visitor is told
    // to use Instagram DM; if D1 stored it, the message is not lost.
    return json(
      {
        ok: false,
        error: "email_failed",
        mail_status: mailStatus,
        detail:
          "Your message could not be sent right now. Please DM @yessirjinza on Instagram instead — and mention you tried the contact form." +
          (stored ? " (Your message was saved on our side and will be reviewed.)" : ""),
      },
      502
    );
  }

  return json({ ok: true, stored });
}

export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed", detail: "Use POST." }, 405);
  }
  return handlePost(context);
}
