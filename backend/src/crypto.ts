import crypto from "node:crypto";

/**
 * Password and token handling.
 *
 * Two different credentials, deliberately treated differently:
 *
 *   password     — scrypt with a per-user salt, verified in constant time
 *   device token — stored only as SHA-256, so a leaked database cannot be used
 *                  to sync as anyone. Tokens are high-entropy random, so a
 *                  plain hash is right here; stretching is for human passwords.
 */

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;

  const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newDeviceToken(): string {
  return `tokn_${crypto.randomBytes(24).toString("hex")}`;
}

/** No 0/O/1/I/L — these get read aloud and typed by hand. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomLinkCode(): string {
  const pick = () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  const chars = Array.from({ length: 8 }, pick).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}
