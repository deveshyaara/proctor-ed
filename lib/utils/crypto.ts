import { randomBytes, createHash } from "crypto";

/**
 * Generates a cryptographically secure random token.
 * @param bytes - Number of random bytes (default: 32).
 * @returns Hex-encoded random string.
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Hashes a token for secure storage.
 * Uses SHA-256. The raw token is given to the client; only the hash is stored.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verifies a raw token against a stored hash.
 */
export function verifyToken(raw: string, hash: string): boolean {
  const candidateHash = hashToken(raw);
  // Constant-time comparison to prevent timing attacks
  return timingSafeEqual(candidateHash, hash);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
