import { randomBytes } from 'node:crypto';

/**
 * Matches every "Generate with: node -e ... randomBytes(32)" instruction
 * scattered across .env.example — one helper instead of five copy-pasted
 * one-liners.
 */
export function generateSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * An S3 access key id for a store this install runs itself (RustFS).
 *
 * Twenty characters, upper-case hex: the length AWS uses, and the upper bound
 * MinIO enforces (3–20). RustFS is built as a drop-in for MinIO, so staying
 * inside MinIO's bounds costs nothing and removes the question —
 * `generateSecret()`'s 64 characters could be refused, and a store that
 * refuses its root key does not start at all. Hex because an access key id travels in a signed header and in URLs; nothing
 * outside `[0-9A-F]` needs thinking about there.
 */
export function generateS3AccessKeyId(): string {
  return randomBytes(10).toString('hex').toUpperCase();
}

/**
 * The matching secret: forty hex characters, 160 bits. Forty is again the
 * length AWS uses and the ceiling MinIO enforces (8–40), which is why this is
 * not `generateSecret()`.
 */
export function generateS3SecretAccessKey(): string {
  return randomBytes(20).toString('hex');
}
