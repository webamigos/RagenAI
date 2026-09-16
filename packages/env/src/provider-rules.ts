import { type z } from 'zod';

import { type FieldGroup } from './config-groups';
import {
  ENCRYPTION_SEAM,
  SPEECH_SEAM,
  STORAGE_SEAM,
  WORKER_RUNTIME_SEAM,
  type ProviderSeam,
} from './provider-seams';
import { allOrNone, requiredForProvider } from './rules';

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
 *
 * **An unset discriminant selects `defaultVariant`**, and that is not a
 * nicety. `requiredForProvider` compares the variable to the variant name, so
 * an unset variable matches nothing and every requirement is skipped — which
 * means a seam whose default has requirements would validate nothing in its
 * most common configuration, while looking validated. That had never bitten
 * because no default variant required anything: storage's `local` requires
 * nothing and the reranker's `scaleway` has no rule. `WORKER_RUNTIME` is the
 * first where it matters, and leaving this out would have quietly dropped the
 * worker's existing `TEMPORAL_SERVER_ADDRESS` requirement the moment it moved
 * into the seam.
 */
export function seamRule(seam: ProviderSeam): (env: Env, ctx: Ctx) => void {
  return (env, ctx) => {
    const chosen = env[seam.discriminant];
    const selected =
      typeof chosen === 'string' && chosen.trim() !== ''
        ? chosen
        : seam.defaultVariant;

    // No default and nothing chosen, or a value the schema's own enum will
    // reject anyway — both were already no-ops before this learned about
    // defaults, and stay so.
    const spec = selected === undefined ? undefined : seam.variants[selected];
    if (spec === undefined || selected === undefined) {
      return;
    }

    // The discriminant is substituted rather than passed through, because
    // `requiredForProvider` matches on the variable's own value and the whole
    // point here is the case where it has none.
    requiredForProvider(
      { ...env, [seam.discriminant]: selected },
      ctx,
      seam.discriminant,
      selected,
      spec.required,
    );
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

/**
 * Speech needs one thing only when ElevenLabs is chosen — the key it cannot
 * work without. The `openai` variant requires nothing, because
 * `SPEECH_API_KEY` falls back to `OPENAI_API_KEY` and the base URL has a real
 * default; the provider itself throws when neither key is present, which is
 * the check that has to happen there rather than here.
 */
export const speechRules = seamRule(SPEECH_SEAM);

/**
 * The refinement a flat group's `pairs` describe.
 *
 * apps/web, apps/api and apps/admin each wrote these two `allOrNone` calls out
 * by hand — six copies of a rule the group already documented in prose and
 * nothing checked. This reads the same table `configToEnv` reads, so the
 * written configuration and the boot-time check cannot disagree about what
 * half-configured means.
 */
export function fieldGroupRules(
  group: FieldGroup,
): (env: Record<string, unknown>, ctx: z.RefinementCtx) => void {
  return (env, ctx) => {
    for (const { vars, label } of group.pairs ?? []) {
      allOrNone(env, ctx, vars, label);
    }
  };
}

/**
 * Which engine runs background jobs — `REDIS_URL` under BullMQ, the Temporal
 * address under Temporal, neither required in general (the worker-runtime
 * spec's §9).
 *
 * **Called by apps/worker only**, and that is a deliberate limit rather than
 * an oversight. The worker *is* the runtime: it has no business defaulting to
 * a Temporal on its own container, so the address is a hard requirement there.
 * apps/web and apps/api merely enqueue, and both fall back to
 * `localhost:7233` — correct on a laptop and in compose. Requiring it of them
 * would refuse to boot deployments that work today, which is the mistake
 * apps/api's own env tests were written to prevent: "demanding the credential
 * anyway would refuse to boot a correctly configured deployment, and the
 * obvious workaround — invent a dummy value — is how a boot check stops being
 * believed."
 *
 * The producer side of this arrives with the BullMQ adapter, where it has a
 * consequence worth a boot failure: a producer with no `REDIS_URL` cannot
 * enqueue at all, and there is no fallback to soften it. Adding it before the
 * adapter exists would only enforce the Temporal half, which is the half that
 * has a working default.
 */
export const workerRuntimeRules = seamRule(WORKER_RUNTIME_SEAM);
