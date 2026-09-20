import crypto from "node:crypto";

/**
 * Hashing primitives, kept free of any Next.js import so that scripts run
 * outside the server (the seeder, say) can reuse them.
 */

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !key) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  // timingSafeEqual throws on a length mismatch, so check that first.
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/** Device tokens are stored hashed — a leaked database cannot sync as anyone. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
