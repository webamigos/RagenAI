import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * The envelope format, and the reason this package exists.
 *
 * These fifty lines existed in three copies — `apps/web`'s
 * `thread-encryption.ts`, `apps/api`'s copy of it, and `apps/worker`'s
 * `pii-encryption.ts` — and were byte-for-byte equivalent, down to the error
 * string. That is not reassuring, it is luck: the format is the compatibility
 * contract with every row already encrypted in production, and a divergence
 * here is not a wrong number on a dashboard, it is ciphertext one app cannot
 * read.
 *
 * The layout is `base64(IV[12] ‖ ciphertext ‖ authTag[16])` under
 * AES-256-GCM. **It must not change.** `__tests__/envelope.test.ts` pins it
 * against a hardcoded vector rather than a round trip, because a round trip
 * passes even when the format changes on both sides at once — which is
 * exactly the mistake that would strand stored data.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Encrypt content with a plaintext DEK. */
export function encryptContent(plaintext: string, dek: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dek, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]).toString('base64');
}

/** Decrypt content with a plaintext DEK. */
export function decryptContent(encryptedBase64: string, dek: Buffer): string {
  const packed = Buffer.from(encryptedBase64, 'base64');

  const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
  if (packed.length < minLength) {
    throw new Error(
      `Invalid encrypted payload: expected at least ${minLength} bytes, got ${packed.length}`,
    );
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(
    IV_LENGTH,
    packed.length - AUTH_TAG_LENGTH,
  );

  const decipher = createDecipheriv(ALGORITHM, dek, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
