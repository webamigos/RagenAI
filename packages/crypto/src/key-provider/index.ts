import { parseMasterKey } from '../master-key';
import { KmsKeyProvider } from './kms-provider';
import { LocalKeyProvider } from './local-provider';
import { ScalewayKeyProvider } from './scaleway-provider';
import type { KeyProvider } from './types';

export type { KeyProvider } from './types';

let instance: KeyProvider | null = null;

/**
 * The configured key provider, cached per process.
 *
 * Selection:
 *   ENCRYPTION_PROVIDER=scaleway → Scaleway Key Manager (SCW_KEY_MANAGER_KEY_ID + SCW_API_KEY)
 *   ENCRYPTION_PROVIDER=kms      → AWS KMS (AWS_KMS_KEY_ID + credentials)
 *   ENCRYPTION_PROVIDER=local    → local master key (ENCRYPTION_MASTER_KEY)
 *   unset                        → auto-detect, Scaleway > KMS > local
 *
 * **`isEncryptionConfigured()` below must agree with this function for every
 * input.** That pairing is the invariant this package exists to hold: callers
 * check the predicate and then call the factory, and
 * `apply-dual-content-mode.ts` wraps the factory call in a `try` whose
 * `catch` logs one line and continues without encryption. So a predicate that
 * says "no" for a provider the factory supports is not an error, it is a
 * silent downgrade — which is precisely how `apps/worker` spent months
 * discarding encrypted originals on any AWS deployment.
 */
export function getKeyProvider(): KeyProvider {
  if (instance) {
    return instance;
  }

  const explicit = process.env.ENCRYPTION_PROVIDER;

  if (
    explicit === 'scaleway' ||
    (!explicit && process.env.SCW_KEY_MANAGER_KEY_ID && process.env.SCW_API_KEY)
  ) {
    instance = new ScalewayKeyProvider();
  } else if (explicit === 'kms' || (!explicit && process.env.AWS_KMS_KEY_ID)) {
    instance = new KmsKeyProvider();
  } else if (explicit === 'local' || (!explicit && localMasterKeyIsUsable())) {
    instance = new LocalKeyProvider();
  } else if (explicit) {
    throw new Error(
      `Unknown ENCRYPTION_PROVIDER: "${explicit}". Supported values: "scaleway", "kms", "local".`,
    );
  } else {
    throw new Error(
      'No encryption provider configured. Set ENCRYPTION_PROVIDER to "scaleway", "kms" or "local", ' +
        'or set SCW_KEY_MANAGER_KEY_ID + SCW_API_KEY (Scaleway), AWS_KMS_KEY_ID (KMS), or ENCRYPTION_MASTER_KEY (local).',
    );
  }

  return instance;
}

/**
 * Present *and* usable.
 *
 * Presence alone was not enough and the gap was the very thing this file's
 * invariant forbids: `LocalKeyProvider` parses the key in its constructor, so
 * `ENCRYPTION_MASTER_KEY=x` made the predicate answer yes and the factory
 * throw — a truncated or mistyped key read as a silent downgrade rather than
 * a configuration error.
 */
function localMasterKeyIsUsable(): boolean {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) {
    return false;
  }
  try {
    parseMasterKey(key);
    return true;
  } catch {
    return false;
  }
}

/** Whether any provider is configured. Must agree with `getKeyProvider()`. */
export function isEncryptionConfigured(): boolean {
  const explicit = process.env.ENCRYPTION_PROVIDER;

  if (explicit === 'scaleway') {
    return !!process.env.SCW_KEY_MANAGER_KEY_ID && !!process.env.SCW_API_KEY;
  }
  if (explicit === 'kms') {
    return !!process.env.AWS_KMS_KEY_ID;
  }
  if (explicit === 'local') {
    return localMasterKeyIsUsable();
  }
  if (explicit !== undefined) {
    return false;
  }

  return (
    (!!process.env.SCW_KEY_MANAGER_KEY_ID && !!process.env.SCW_API_KEY) ||
    !!process.env.AWS_KMS_KEY_ID ||
    localMasterKeyIsUsable()
  );
}

/**
 * Drop the cached instance. Tests need it because the provider is chosen from
 * the environment once; `apps/worker`'s suite already depended on this and it
 * has to keep working after the move.
 */
export function resetKeyProviderForTests(): void {
  instance = null;
}
