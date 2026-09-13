import { type z } from 'zod';

import {
  ENCRYPTION_SEAM,
  STORAGE_SEAM,
  type ProviderSeam,
} from './provider-seams';
import { requiredForProvider } from './rules';

type Ctx = z.RefinementCtx;
type Env = Record<string, unknown>;

/**
 * The rules that make a provider fragment mean something.
 *
 * `fragments.storage` and `fragments.encryption` declare every credential
 * optional, because which ones are mandatory depends on which provider was
 * picked. That is the only shape a shared fragment can have — and it means
 * merging one validates nothing beyond the types.
 *
 * Two of the three apps that merge these fragments did exactly that until
 * #1116: apps/web merged both and called `requiredForProvider` not once,
 * apps/api merged `encryption` and validated none of it. So one configuration
 * got two answers depending on which app read it.
 *
 * The requirements themselves are no longer written here. They live in
 * `provider-seams.ts` as data, because the boot-time check is not their only
 * reader — a generated configuration reference and the installer's typed
 * config need the same facts, and restating them is what let the documentation
 * drift from the code (see the review of #1114).
 *
 * `tests/architecture/provider-fragments-carry-their-rules.test.ts` fails when
 * a schema merges one of these fragments without calling the matching rule.
 */

/**
 * Turn a seam into the refinement that enforces it.
 *
 * Every variant is offered to `requiredForProvider`, which is a no-op unless
 * the discriminant matches it — so this is the same set of calls the rules
 * used to make by hand, generated from the table instead.
 */
export function seamRule(seam: ProviderSeam): (env: Env, ctx: Ctx) => void {
  return (env, ctx) => {
    for (const [variant, spec] of Object.entries(seam.variants)) {
      requiredForProvider(env, ctx, seam.discriminant, variant, spec.required);
    }
  };
}

/**
 * S3 needs four things beyond the provider name and has no usable default for
 * any of them; selecting it and supplying none surfaces at the first upload,
 * as a storage error three layers from the cause. `local` requires nothing,
 * because `STORAGE_LOCAL_PATH` has a real default.
 */
export const storageRules = seamRule(STORAGE_SEAM);

/**
 * Each encryption provider needs a different key, and an unconstructable one
 * does not fail loudly. Lifted from apps/worker, where it was written after
 * the damage: a provider the worker could not construct read as "encryption
 * not configured" and silently turned dual-content PII into masked-only on
 * every ingest, one warning per document. The originals were never written.
 *
 * Checks that a key is *present*, not that it is *usable*.
 * `ENCRYPTION_MASTER_KEY=x` passes here and throws when `LocalKeyProvider` is
 * first constructed — parsing it needs `@ragenai/crypto`, which depends on
 * this package, so that check stays in the consumer. apps/worker has it.
 */
export const encryptionRules = seamRule(ENCRYPTION_SEAM);
