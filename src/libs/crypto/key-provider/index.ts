import type { KeyProvider } from './types';
import { KmsKeyProvider } from './kms-provider';
import { LocalKeyProvider } from './local-provider';

export type { KeyProvider } from './types';

let instance: KeyProvider | null = null;

/**
 * Returns the configured key provider for envelope encryption.
 *
 * Selection logic:
 * - ENCRYPTION_PROVIDER=kms → AWS KMS (requires AWS_KMS_KEY_ID + AWS credentials)
 * - ENCRYPTION_PROVIDER=local → local master key (requires ENCRYPTION_MASTER_KEY)
 * - Unset: auto-detect — KMS if AWS_KMS_KEY_ID is set, local if ENCRYPTION_MASTER_KEY is set
 */
export function getKeyProvider(): KeyProvider {
  if (instance) {
    return instance;
  }

  const explicit = process.env.ENCRYPTION_PROVIDER;

  if (explicit === 'kms') {
    instance = new KmsKeyProvider();
  } else if (explicit === 'local') {
    instance = new LocalKeyProvider();
  } else if (!explicit) {
    // Auto-detect
    if (process.env.AWS_KMS_KEY_ID) {
      instance = new KmsKeyProvider();
    } else if (process.env.ENCRYPTION_MASTER_KEY) {
      instance = new LocalKeyProvider();
    } else {
      throw new Error(
        'No encryption provider configured. Set ENCRYPTION_PROVIDER to "kms" or "local", ' +
          'or set AWS_KMS_KEY_ID (for KMS) or ENCRYPTION_MASTER_KEY (for local).',
      );
    }
  } else {
    throw new Error(
      `Unknown ENCRYPTION_PROVIDER: "${explicit}". Supported values: "kms", "local".`,
    );
  }

  return instance;
}

/**
 * Check if any encryption provider is configured.
 * Encryption is enabled when AWS_KMS_KEY_ID or ENCRYPTION_MASTER_KEY is set.
 */
export function isEncryptionConfigured(): boolean {
  return !!process.env.AWS_KMS_KEY_ID || !!process.env.ENCRYPTION_MASTER_KEY;
}
