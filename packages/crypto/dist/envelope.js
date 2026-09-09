'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.encryptContent = encryptContent;
exports.decryptContent = decryptContent;
const node_crypto_1 = require('node:crypto');
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
function encryptContent(plaintext, dek) {
  const iv = (0, node_crypto_1.randomBytes)(IV_LENGTH);
  const cipher = (0, node_crypto_1.createCipheriv)(ALGORITHM, dek, iv, {
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
function decryptContent(encryptedBase64, dek) {
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
  const decipher = (0, node_crypto_1.createDecipheriv)(ALGORITHM, dek, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
//# sourceMappingURL=envelope.js.map
