import type { KeyProvider } from './types';
import { KmsKeyProvider } from './kms-provider';
import { LocalKeyProvider } from './local-provider';
import { ScalewayKeyProvider } from './scaleway-provider';

export type { KeyProvider } from './types';

let instance: KeyProvider | null = null;

/**
 * Returns the configured key provider for envelope encryption.
 *
 * Selection logic:
 * - ENCRYPTION_PROVIDER=scaleway → Scaleway Key Manager (requires SCW_KEY_MANAGER_KEY_ID + SCW_API_KEY)
 * - ENCRYPTION_PROVIDER=kms → AWS KMS (requires AWS_KMS_KEY_ID + AWS credentials)
 * - ENCRYPTION_PROVIDER=local → local master key (requires ENCRYPTION_MASTER_KEY)
 * - Unset: auto-detect — Scaleway > KMS > local based on env presence
 */
export function getKeyProvider(): KeyProvider {
  if (instance) {
    return instance;
  }

  const explicit = process.env.ENCRYPTION_PROVIDER;

  if (explicit === 'scaleway') {
    instance = new ScalewayKeyProvider();
  } else if (explicit === 'kms') {
    instance = new KmsKeyProvider();
  } else if (explicit === 'local') {
    instance = new LocalKeyProvider();
  } else if (!explicit) {
    // Auto-detect (Scaleway preferred — current target stack)
    if (process.env.SCW_KEY_MANAGER_KEY_ID) {
      instance = new ScalewayKeyProvider();
    } else if (process.env.AWS_KMS_KEY_ID) {
      instance = new KmsKeyProvider();
    } else if (process.env.ENCRYPTION_MASTER_KEY) {
      instance = new LocalKeyProvider();
    } else {
      throw new Error(
        'No encryption provider configured. Set ENCRYPTION_PROVIDER to "scaleway", "kms" or "local", ' +
          'or set SCW_KEY_MANAGER_KEY_ID (for Scaleway), AWS_KMS_KEY_ID (for KMS), or ENCRYPTION_MASTER_KEY (for local).',
      );
    }
  } else {
    throw new Error(
      `Unknown ENCRYPTION_PROVIDER: "${explicit}". Supported values: "scaleway", "kms", "local".`,
    );
  }

  return instance;
}

/**
 * Check if any encryption provider is configured.
 * Honors ENCRYPTION_PROVIDER when set, otherwise auto-detects.
 */
export function isEncryptionConfigured(): boolean {
  const explicit = process.env.ENCRYPTION_PROVIDER;

  if (explicit === 'scaleway') {
    return !!process.env.SCW_KEY_MANAGER_KEY_ID;
  }
  if (explicit === 'kms') {
    return !!process.env.AWS_KMS_KEY_ID;
  }
  if (explicit === 'local') {
    return !!process.env.ENCRYPTION_MASTER_KEY;
  }

  // Auto-detect: any key present
  return (
    !!process.env.SCW_KEY_MANAGER_KEY_ID ||
    !!process.env.AWS_KMS_KEY_ID ||
    !!process.env.ENCRYPTION_MASTER_KEY
  );
}
