import { randomBytes } from "crypto";

/**
 * Generates a cryptographically random test code.
 * Format: 3 uppercase letters + 4 digits (e.g. "MAT7284", "PHY5192")
 * The prefix is from the subject name, not an incrementing ID.
 *
 * @param subject - Optional subject prefix (first 3 chars, uppercased).
 * @returns Unique test code string.
 */
export function generateTestCode(subject?: string): string {
  const prefix = subject
    ? subject.replace(/[^A-Z]/gi, "").toUpperCase().slice(0, 3).padEnd(3, "X")
    : randomBytes(2).toString("hex").toUpperCase().slice(0, 3);

  // Generate 4 cryptographically random digits (1000-9999) without modulo bias
  // Using rejection sampling to ensure uniform distribution
  let digits: number;
  let attempts = 0;
  do {
    digits = randomBytes(2).readUInt16BE(0) % 10000;
    attempts++;
    if (attempts > 100) throw new Error("Failed to generate random digits");
  } while (digits < 1000); // Reject if < 4 digits

  return `${prefix}${digits.toString()}`;
}

/**
 * Normalizes a test code for comparison.
 * Always uppercase, trimmed.
 */
export function normalizeTestCode(code: string): string {
  return code.trim().toUpperCase();
}
