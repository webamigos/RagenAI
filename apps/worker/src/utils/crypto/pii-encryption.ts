import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt content using a plaintext DEK (AES-256-GCM).
 * Returns a base64 string containing: IV (12 bytes) + ciphertext + auth tag (16 bytes).
 */
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
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return packed.toString('base64');
}

/**
 * Decrypt content using a plaintext DEK (AES-256-GCM).
 * Expects a base64 string containing: IV (12 bytes) + ciphertext + auth tag (16 bytes).
 */
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
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
