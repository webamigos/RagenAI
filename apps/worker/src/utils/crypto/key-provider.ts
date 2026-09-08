import { createDecipheriv } from 'node:crypto';
import { ScalewayKMSService } from './scaleway-kms';

export interface KeyProvider {
  decryptDataKey(encryptedDek: string): Promise<Buffer>;
}

class ScalewayKeyProvider implements KeyProvider {
  private readonly keyId: string;
  private readonly client: ScalewayKMSService;

  constructor() {
    const keyId = process.env.SCW_KEY_MANAGER_KEY_ID;
    if (!keyId) {
      throw new Error('SCW_KEY_MANAGER_KEY_ID is not configured');
    }
    this.keyId = keyId;
    this.client = new ScalewayKMSService();
  }

  async decryptDataKey(encryptedDek: string): Promise<Buffer> {
    return this.client.decryptDataKey(this.keyId, encryptedDek);
  }
}

/**
 * Accept the master key in either encoding, because the repository has been
 * telling operators to use the one this file could not read.
 *
 * `.env.example` documents a 64-character hex string, `apps/web` and
 * `apps/api` require exactly that (`/^[0-9a-fA-F]{64}$/`, decoded as hex),
 * and `inspect-environment.ts` says hex too. This file decoded base64 and
 * demanded 32 bytes. A 64-character hex string is also valid base64 input —
 * it decodes to 48 bytes — so it did not fail as unparseable, it failed as
 * "wrong length", and the two forms were mutually exclusive: no single value
 * satisfied both apps.
 *
 * The consequence was silent. `isEncryptionConfigured()` returns true for
 * `local` on the presence of the variable alone, so the worker passed the
 * gate and then threw in this constructor — inside the `try` in
 * `apply-dual-content-mode.ts`, whose `catch` logs one warning and returns
 * the masked documents. An organization on the documented configuration
 * asked for dual-content PII and got masked text with no encrypted original
 * beside it, on every ingest, while its setting still read `dual_content`.
 *
 * Hex is checked first and strictly, so a 64-character hex key can never be
 * read as 48 bytes of base64 again. Base64 keeps working because the
 * worker's own tests and any deployment that followed this file rather than
 * the documentation use it.
 *
 * Reading either form is safe: this provider only ever unwraps. Its
 * `KeyProvider` interface has `decryptDataKey` alone, so no wrapped DEK was
 * ever produced here, and nothing can have been written under the encoding
 * that is now also accepted.
 */
function parseMasterKey(key: string): Buffer {
  const trimmed = key.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length === 32) {
    return decoded;
  }

  throw new Error(
    'ENCRYPTION_MASTER_KEY must be 32 bytes: a 64-character hex string ' +
      '(what .env.example documents) or base64. Generate one with: ' +
      "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

class LocalKeyProvider implements KeyProvider {
  private readonly masterKey: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_MASTER_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_MASTER_KEY is not configured');
    }
    this.masterKey = parseMasterKey(key);
  }

  async decryptDataKey(encryptedDek: string): Promise<Buffer> {
    const packed = Buffer.from(encryptedDek, 'base64');
    const IV_LENGTH = 12;
    const AUTH_TAG_LENGTH = 16;
    const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
    if (packed.length < minLength) {
      throw new Error(
        `LocalKeyProvider: invalid encrypted DEK payload (${packed.length} bytes)`,
      );
    }
    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(
      IV_LENGTH,
      packed.length - AUTH_TAG_LENGTH,
    );
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted;
  }
}

let instance: KeyProvider | null = null;

export function getKeyProvider(): KeyProvider {
  if (instance) return instance;

  const explicit = process.env.ENCRYPTION_PROVIDER;

  if (
    explicit === 'scaleway' ||
    (!explicit && process.env.SCW_KEY_MANAGER_KEY_ID && process.env.SCW_API_KEY)
  ) {
    instance = new ScalewayKeyProvider();
  } else if (
    explicit === 'local' ||
    (!explicit && process.env.ENCRYPTION_MASTER_KEY)
  ) {
    instance = new LocalKeyProvider();
  } else {
    throw new Error(
      'No encryption provider configured. Set SCW_KEY_MANAGER_KEY_ID + SCW_API_KEY (Scaleway) or ENCRYPTION_MASTER_KEY (local).',
    );
  }

  return instance;
}

export function isEncryptionConfigured(): boolean {
  const explicit = process.env.ENCRYPTION_PROVIDER;
  if (explicit === 'scaleway') {
    return !!process.env.SCW_KEY_MANAGER_KEY_ID && !!process.env.SCW_API_KEY;
  }
  if (explicit === 'local') {
    return !!process.env.ENCRYPTION_MASTER_KEY;
  }
  if (explicit !== undefined) {
    return false;
  }
  return (
    (!!process.env.SCW_KEY_MANAGER_KEY_ID && !!process.env.SCW_API_KEY) ||
    !!process.env.ENCRYPTION_MASTER_KEY
  );
}

export function resetKeyProviderForTests(): void {
  instance = null;
}
