// Money helpers. All prices are stored and computed as integer cents.
// Display only — the authoritative price always comes from D1 (licenses table),
// never from the request body.

/** Format integer cents as "$20" / "$20.50". Null/undefined renders as "—". */
export function formatCents(cents, currency = "usd") {
  if (cents === null || cents === undefined) return "—";
  if (!Number.isInteger(cents) || cents < 0) throw new Error("cents must be a non-negative integer");
  const symbol = currency === "usd" ? "$" : currency.toUpperCase() + " ";
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return remainder === 0 ? `${symbol}${dollars}` : `${symbol}${dollars}.${String(remainder).padStart(2, "0")}`;
}

/** Validate an ISO 4217-ish currency code (3 lowercase letters). */
export function isValidCurrency(code) {
  return typeof code === "string" && /^[a-z]{3}$/.test(code);
}

/** Convert a decimal dollar amount to integer cents with banker's-safe rounding. */
export function toCents(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new Error("amount must be a non-negative finite number");
  }
  return Math.round(amount * 100);
}

/** Validate a price coming from an admin write. Null is allowed (offer-only). */
export function isValidPriceCents(value) {
  return value === null || (Number.isInteger(value) && value >= 0);
}
