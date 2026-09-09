import type { KeyProvider } from './types';
export type { KeyProvider } from './types';
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
export declare function getKeyProvider(): KeyProvider;
/** Whether any provider is configured. Must agree with `getKeyProvider()`. */
export declare function isEncryptionConfigured(): boolean;
/**
 * Drop the cached instance. Tests need it because the provider is chosen from
 * the environment once; `apps/worker`'s suite already depended on this and it
 * has to keep working after the move.
 */
export declare function resetKeyProviderForTests(): void;
//# sourceMappingURL=index.d.ts.map
