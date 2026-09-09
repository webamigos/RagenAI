'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getKeyProvider = getKeyProvider;
exports.isEncryptionConfigured = isEncryptionConfigured;
exports.resetKeyProviderForTests = resetKeyProviderForTests;
const master_key_1 = require('../master-key');
const kms_provider_1 = require('./kms-provider');
const local_provider_1 = require('./local-provider');
const scaleway_provider_1 = require('./scaleway-provider');
let instance = null;
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
function getKeyProvider() {
  if (instance) {
    return instance;
  }
  const explicit = process.env.ENCRYPTION_PROVIDER;
  if (
    explicit === 'scaleway' ||
    (!explicit && process.env.SCW_KEY_MANAGER_KEY_ID && process.env.SCW_API_KEY)
  ) {
    instance = new scaleway_provider_1.ScalewayKeyProvider();
  } else if (explicit === 'kms' || (!explicit && process.env.AWS_KMS_KEY_ID)) {
    instance = new kms_provider_1.KmsKeyProvider();
  } else if (explicit === 'local' || (!explicit && localMasterKeyIsUsable())) {
    instance = new local_provider_1.LocalKeyProvider();
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
function localMasterKeyIsUsable() {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) {
    return false;
  }
  try {
    (0, master_key_1.parseMasterKey)(key);
    return true;
  } catch {
    return false;
  }
}
/** Whether any provider is configured. Must agree with `getKeyProvider()`. */
function isEncryptionConfigured() {
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
function resetKeyProviderForTests() {
  instance = null;
}
//# sourceMappingURL=index.js.map
