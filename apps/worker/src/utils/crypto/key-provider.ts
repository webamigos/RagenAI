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

class LocalKeyProvider implements KeyProvider {
  private readonly masterKey: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_MASTER_KEY;
    if (!key) {
      throw new Error('ENCRYPTION_MASTER_KEY is not configured');
    }
    this.masterKey = Buffer.from(key, 'base64');
    if (this.masterKey.length !== 32) {
      throw new Error(
        'ENCRYPTION_MASTER_KEY must be a 32-byte key encoded as base64',
      );
    }
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
