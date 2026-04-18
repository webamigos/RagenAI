import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { KeyProvider } from './types';

const WRAP_ALGORITHM = 'aes-256-gcm';
const WRAP_IV_LENGTH = 12;
const WRAP_AUTH_TAG_LENGTH = 16;

/**
 * Local key provider for on-premise deployments without AWS KMS.
 *
 * Uses a master key from ENCRYPTION_MASTER_KEY env var to wrap/unwrap
 * data encryption keys via AES-256-GCM. The master key must be a
 * 64-character hex string (32 bytes).
 *
 * Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export class LocalKeyProvider implements KeyProvider {
  private masterKey: Buffer;

  constructor() {
    const masterKeyHex = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKeyHex) {
      throw new Error('ENCRYPTION_MASTER_KEY is not configured');
    }
    if (masterKeyHex.length !== 64) {
      throw new Error(
        'ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes)',
      );
    }
    this.masterKey = Buffer.from(masterKeyHex, 'hex');
  }

  async generateDataKey(): Promise<{
    encryptedDek: string;
    plaintextDek: Buffer;
  }> {
    const plaintextDek = randomBytes(32);
    const encryptedDek = this.wrapKey(plaintextDek);

    return { encryptedDek, plaintextDek };
  }

  async decryptDataKey(encryptedDek: string): Promise<Buffer> {
    return this.unwrapKey(encryptedDek);
  }

  private wrapKey(plaintext: Buffer): string {
    const iv = randomBytes(WRAP_IV_LENGTH);
    const cipher = createCipheriv(WRAP_ALGORITHM, this.masterKey, iv, {
      authTagLength: WRAP_AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Pack: IV (12) + ciphertext (32) + authTag (16) = 60 bytes
    const packed = Buffer.concat([iv, encrypted, authTag]);
    return packed.toString('base64');
  }

  private unwrapKey(wrappedBase64: string): Buffer {
    const packed = Buffer.from(wrappedBase64, 'base64');

    const iv = packed.subarray(0, WRAP_IV_LENGTH);
    const authTag = packed.subarray(packed.length - WRAP_AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(
      WRAP_IV_LENGTH,
      packed.length - WRAP_AUTH_TAG_LENGTH,
    );

    const decipher = createDecipheriv(WRAP_ALGORITHM, this.masterKey, iv, {
      authTagLength: WRAP_AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
