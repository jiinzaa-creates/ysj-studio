// Private delivery helpers for the `jinza-delivery` R2 bucket.
//
// Paid masters/stems live ONLY in this private bucket — never public URLs.
// Downloads are issued as short-lived S3-compatible presigned GET URLs,
// generated here with AWS SigV4 (R2 region is "auto"). Requires these secrets:
//   R2_ACCOUNT_ID, R2_S3_ACCESS_KEY_ID, R2_S3_SECRET_ACCESS_KEY
// (create the token under R2 > Manage R2 API Tokens; store via `wrangler secret put`).
//
// Key layout convention: delivery/<beat-slug>/<tier>/<filename>
// e.g. delivery/red-handed/wav/red-handed.wav
//
// Honest limitation: once a buyer downloads the audio they can re-share it.
// This layer controls *authorization and audit*, not copying (no DRM).

const BUCKET = "jinza-delivery";
const REGION = "auto";

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a presigned GET URL for a private delivery object.
 * @param {object} env - Pages Function env (needs R2_ACCOUNT_ID + S3 secrets)
 * @param {string} key - object key inside the bucket, e.g. "delivery/red-handed/wav/red-handed.wav"
 * @param {number} expiresInSeconds - URL lifetime (default 30 min, keep short)
 */
export async function getSignedDownloadUrl(env, key, expiresInSeconds = 1800) {
  const accountId = env.R2_ACCOUNT_ID;
  const accessKey = env.R2_S3_ACCESS_KEY_ID;
  const secretKey = env.R2_S3_SECRET_ACCESS_KEY;
  if (!accountId || !accessKey || !secretKey) {
    throw new Error("R2 S3 credentials (R2_ACCOUNT_ID / R2_S3_ACCESS_KEY_ID / R2_S3_SECRET_ACCESS_KEY) are not configured");
  }
  if (typeof key !== "string" || !key || key.includes("..") || key.startsWith("/")) {
    throw new Error("invalid object key");
  }
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 604800) {
    throw new Error("expiresInSeconds must be between 60 and 604800");
  }

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"; // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${REGION}/s3/aws4_request`;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");

  const params = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresInSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const sortedQuery = Object.keys(params)
    .sort()
    .map((k) => `${k}=${encodeURIComponent(params[k])}`)
    .join("&");

  const canonicalRequest = [
    "GET",
    `/${BUCKET}/${encodedKey}`,
    sortedQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join(
    "\n"
  );

  const kDate = await hmacSha256(new TextEncoder().encode("AWS4" + secretKey), new TextEncoder().encode(dateStamp));
  const kRegion = await hmacSha256(kDate, new TextEncoder().encode(REGION));
  const kService = await hmacSha256(kRegion, new TextEncoder().encode("s3"));
  const kSigning = await hmacSha256(kService, new TextEncoder().encode("aws4_request"));
  const signature = await hmacSha256(kSigning, new TextEncoder().encode(stringToSign));
  const sigHex = [...signature].map((b) => b.toString(16).padStart(2, "0")).join("");

  return `https://${host}/${BUCKET}/${encodedKey}?${sortedQuery}&X-Amz-Signature=${sigHex}`;
}

/** Build the conventional delivery key for a beat + tier package. */
export function deliveryKeyFor(beatSlug, tier, filename) {
  if (!/^[a-z0-9-]{1,80}$/.test(beatSlug)) throw new Error("invalid beat slug");
  if (!/^[a-z]{1,20}$/.test(tier)) throw new Error("invalid tier");
  if (!/^[\w\-. ]{1,120}$/.test(filename) || filename.includes("..")) throw new Error("invalid filename");
  return `delivery/${beatSlug}/${tier}/${filename}`;
}
