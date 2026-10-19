// Create the initial admin user (offline, run once).
//
// The hash format matches functions/_lib/auth.js exactly (PBKDF2-SHA256,
// 210k iterations). The password itself never touches the database or git.
//
// Run:
//   node scripts/create-admin.mjs you@example.com 'a-long-password' > scripts/admin.sql
//   npx wrangler d1 execute jinza-db --file scripts/admin.sql --remote
//
// Then DELETE scripts/admin.sql (it contains only the hash, but keep hygiene).

import { randomUUID } from "node:crypto";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: node scripts/create-admin.mjs <email> <password>");
  process.exit(1);
}
if (password.length < 12) {
  console.error("password must be at least 12 characters");
  process.exit(1);
}

function b64encode(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function hashPassword(pw) {
  const salt = randomUUID().replace(/-/g, "").slice(0, 32); // 16 random bytes as hex
  const saltBytes = Buffer.from(salt, "hex");
  const derived = await new Promise((resolve, reject) => {
    // Node's built-in pbkdf2; parameters mirror functions/_lib/auth.js
    import("node:crypto").then(({ pbkdf2 }) =>
      pbkdf2(pw, saltBytes, 210000, 32, "sha256", (err, dk) => (err ? reject(err) : resolve(dk)))
    );
  });
  return `pbkdf2$210000$${b64encode(saltBytes)}$${b64encode(derived)}`;
}

const hash = await hashPassword(password);
const id = `adm_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const sqlEmail = email.replace(/'/g, "''");
console.log(
  `-- Initial admin user (hash only — password never stored). Run once, then delete this file.\n` +
    `INSERT OR IGNORE INTO admin_users (id, email, password_hash) VALUES ('${id}', '${sqlEmail}', '${hash}');`
);
