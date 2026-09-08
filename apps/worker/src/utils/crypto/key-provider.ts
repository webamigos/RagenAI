import { createDecipheriv } from 'node:crypto';
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
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

/**
 * AWS KMS, which this worker could not use until now.
 *
 * `apps/web` and `apps/api` have had a `kms` provider since before the
 * monorepo merge; this file had `scaleway` and `local` only. Because
 * `getKeyProvider()` fell through to its throw and `isEncryptionConfigured()`
 * answered `false` for any value it did not recognise, an AWS deployment did
 * not fail loudly here — `apply-dual-content-mode.ts` logged one line and
 * returned masked documents, so dual-content PII was silently reduced to
 * destructive mode on every ingest.
 *
 * Decrypt-only, like `ScalewayKeyProvider` above: the worker's `KeyProvider`
 * interface is `decryptDataKey` alone. Wrapping a new DEK happens in
 * `apps/web` when an organization first enables the feature, never here, so
 * porting `generateDataKey` would add an untested path with no caller.
 *
 * The client is built on construction and the credentials block is omitted
 * unless both parts are present, so an instance running with an IAM role
 * picks it up from the environment — the same shape as the other two apps.
 */
class KmsKeyProvider implements KeyProvider {
  private readonly client: KMSClient;

  constructor() {
    if (!process.env.AWS_KMS_KEY_ID) {
      throw new Error('AWS_KMS_KEY_ID is not configured');
    }

    this.client = new KMSClient({
      endpoint: process.env.AWS_ENDPOINT_URL,
      region: process.env.AWS_DEFAULT_REGION,
      ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  async decryptDataKey(encryptedDek: string): Promise<Buffer> {
    const response = await this.client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedDek, 'base64'),
      }),
    );

    if (!response.Plaintext) {
      throw new Error('KMS Decrypt returned empty plaintext');
    }

    return Buffer.from(response.Plaintext);
  }
}

let instance: KeyProvider | null = null;

export function getKeyProvider(): KeyProvider {
  if (instance) return instance;

  const explicit = process.env.ENCRYPTION_PROVIDER;

  // Order and auto-detect precedence mirror apps/web's
  // `libs/crypto/key-provider/index.ts` deliberately: three apps reading the
  // same variables must choose the same provider, or one of them encrypts
  // what another cannot read.
  if (
    explicit === 'scaleway' ||
    (!explicit && process.env.SCW_KEY_MANAGER_KEY_ID && process.env.SCW_API_KEY)
  ) {
    instance = new ScalewayKeyProvider();
  } else if (explicit === 'kms' || (!explicit && process.env.AWS_KMS_KEY_ID)) {
    instance = new KmsKeyProvider();
  } else if (
    explicit === 'local' ||
    (!explicit && process.env.ENCRYPTION_MASTER_KEY)
  ) {
    instance = new LocalKeyProvider();
  } else {
    throw new Error(
      'No encryption provider configured. Set ENCRYPTION_PROVIDER to "scaleway", "kms" or "local", ' +
        'or set SCW_KEY_MANAGER_KEY_ID + SCW_API_KEY (Scaleway), AWS_KMS_KEY_ID (KMS), or ENCRYPTION_MASTER_KEY (local).',
    );
  }

  return instance;
}

export function isEncryptionConfigured(): boolean {
  const explicit = process.env.ENCRYPTION_PROVIDER;
  if (explicit === 'scaleway') {
    return !!process.env.SCW_KEY_MANAGER_KEY_ID && !!process.env.SCW_API_KEY;
  }
  if (explicit === 'kms') {
    return !!process.env.AWS_KMS_KEY_ID;
  }
  if (explicit === 'local') {
    return !!process.env.ENCRYPTION_MASTER_KEY;
  }
  if (explicit !== undefined) {
    // An unrecognised value still answers false rather than throwing, because
    // every caller treats this as a predicate. That is what made the missing
    // `kms` branch silent instead of loud, so the branches above have to stay
    // in step with `getKeyProvider()` — the tests below assert they do.
    return false;
  }
  return (
    (!!process.env.SCW_KEY_MANAGER_KEY_ID && !!process.env.SCW_API_KEY) ||
    !!process.env.AWS_KMS_KEY_ID ||
    !!process.env.ENCRYPTION_MASTER_KEY
  );
}

export function resetKeyProviderForTests(): void {
  instance = null;
}
