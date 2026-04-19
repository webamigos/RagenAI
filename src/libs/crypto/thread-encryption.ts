import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { getKeyProvider, isEncryptionConfigured } from './key-provider';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function isEncryptionEnabled(): boolean {
  return isEncryptionConfigured();
}

/**
 * Generate a new data encryption key (DEK) for a thread via envelope encryption.
 * Returns the encrypted DEK (base64) to store in DB and the plaintext DEK for immediate use.
 */
export async function generateThreadKey(): Promise<{
  encryptedDek: string;
  plaintextDek: Buffer;
}> {
  return await getKeyProvider().generateDataKey();
}

/**
 * Decrypt an encrypted DEK back to plaintext.
 * Cache the result per-request to avoid repeated key provider calls for the same thread.
 */
const dekCache = new Map<string, Buffer>();

export async function decryptThreadKey(
  encryptedDekBase64: string,
): Promise<Buffer> {
  const cached = dekCache.get(encryptedDekBase64);
  if (cached) {
    return cached;
  }

  const plaintext = await getKeyProvider().decryptDataKey(encryptedDekBase64);
  dekCache.set(encryptedDekBase64, plaintext);
  return plaintext;
}

/**
 * Clear the DEK cache. Call this at the end of request processing.
 */
export function clearDekCache(): void {
  dekCache.clear();
}

/**
 * Encrypt message content using a plaintext DEK.
 * Returns a base64 string containing: IV + ciphertext + auth tag.
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

  // Pack: IV (12) + ciphertext (variable) + authTag (16)
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return packed.toString('base64');
}

/**
 * Decrypt message content using a plaintext DEK.
 * Expects base64 string containing: IV + ciphertext + auth tag.
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

/**
 * Encrypt multiple message contents for a thread.
 * Generates a new DEK if not provided — returns the encrypted DEK to store.
 */
export async function encryptMessages(
  messages: { content: string }[],
  existingEncryptedDek?: string,
): Promise<{
  encryptedContents: string[];
  encryptedDek: string;
}> {
  let dek: Buffer;
  let encryptedDek: string;

  if (existingEncryptedDek) {
    dek = await decryptThreadKey(existingEncryptedDek);
    encryptedDek = existingEncryptedDek;
  } else {
    const key = await generateThreadKey();
    dek = key.plaintextDek;
    encryptedDek = key.encryptedDek;
  }

  const encryptedContents = messages.map((msg) =>
    encryptContent(msg.content, dek),
  );

  return { encryptedContents, encryptedDek };
}

/**
 * Decrypt multiple message contents for a thread.
 */
export async function decryptMessages(
  encryptedContents: string[],
  encryptedDek: string,
): Promise<string[]> {
  const dek = await decryptThreadKey(encryptedDek);
  return encryptedContents.map((content) => decryptContent(content, dek));
}
