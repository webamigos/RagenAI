import { type z } from 'zod';

import { requiredForProvider } from './rules';

type Ctx = z.RefinementCtx;
type Env = Record<string, unknown>;

/**
 * The rules that make a provider fragment mean something.
 *
 * `fragments.storage` and `fragments.encryption` declare every credential
 * optional, because which ones are mandatory depends on which provider was
 * picked. That is the only shape a shared fragment can have — and it means
 * merging one validates nothing beyond the types. The `encryption` fragment's
 * own comment has said so since ADR-37: *"Pair this with `requiredForProvider`
 * in the consuming app's `superRefine` … merging the fragment alone validates
 * nothing."*
 *
 * Two of the three apps that merge these fragments then did exactly that.
 * apps/worker paired them; apps/web merged both and called
 * `requiredForProvider` not once; apps/api merged `encryption` and validated
 * none of it. So `STORAGE_PROVIDER=s3` with no bucket was a boot failure in
 * the worker and a clean parse in apps/web — the same configuration, two
 * answers, which is the failure mode a shared contract exists to remove.
 *
 * Keeping the rule beside the fragment turns "remember five variable names in
 * every app" into one call. `tests/architecture/provider-fragments-carry-their-rules.test.ts`
 * fails when a schema merges one of these fragments without the matching rule,
 * so the pairing cannot quietly come apart again.
 */

/**
 * S3 needs four things beyond the provider name, and has no usable default for
 * any of them. Selecting `s3` and supplying none of them is a configuration
 * error that otherwise surfaces at the first upload — as a storage error,
 * three layers from the cause.
 *
 * `STORAGE_LOCAL_PATH` has a real default (`./data/storage`, see
 * `@ragenai/storage`), so `local` requires nothing.
 */
export function storageRules(env: Env, ctx: Ctx): void {
  requiredForProvider(env, ctx, 'STORAGE_PROVIDER', 's3', [
    'S3_BUCKET_NAME',
    'S3_REGION',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ]);
}

/**
 * Each encryption provider needs a different key, and an unconstructable one
 * does not fail loudly.
 *
 * This is lifted from apps/worker, where it was written after the damage: a
 * provider the worker could not construct read as "encryption not configured"
 * and silently turned dual-content PII into masked-only on every ingest, one
 * warning per document. The originals were simply never written. Refusing to
 * boot is the point — a misconfigured key is not something to discover from
 * the absence of encrypted content weeks later.
 *
 * Note this checks that a key is *present*, not that it is *usable*.
 * `ENCRYPTION_MASTER_KEY=x` passes here and throws when `LocalKeyProvider` is
 * first constructed. Parsing it needs `@ragenai/crypto`, which depends on this
 * package — so that check stays in the consumer, beside its import. apps/worker
 * has it.
 */
export function encryptionRules(env: Env, ctx: Ctx): void {
  requiredForProvider(env, ctx, 'ENCRYPTION_PROVIDER', 'scaleway', [
    'SCW_KEY_MANAGER_KEY_ID',
    'SCW_API_KEY',
  ]);
  requiredForProvider(env, ctx, 'ENCRYPTION_PROVIDER', 'kms', [
    'AWS_KMS_KEY_ID',
  ]);
  requiredForProvider(env, ctx, 'ENCRYPTION_PROVIDER', 'local', [
    'ENCRYPTION_MASTER_KEY',
  ]);
}
