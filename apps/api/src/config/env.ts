import {
  fieldGroupRules,
  encryptionRules,
  fragments,
  parseEnv,
  TOKEN_VAULT_GROUP,
  requiredInDeployedEnvs,
} from '@ragenai/env';
import { z } from 'zod';

/**
 * apps/api's environment contract (ADR-37).
 *
 * The shared halves come from `@ragenai/env` so this service and the worker
 * cannot disagree about what a valid `DATABASE_URL`, `OTEL_SERVICE_NAME` or
 * LiteLLM endpoint looks like. What follows `.extend()` is genuinely local to
 * the public API.
 *
 * Not exhaustive over every variable apps/api reads, and not meant to be.
 * `z.object()` does not reject an unmentioned key — it strips it, so
 * validation passes and the key is absent from the parsed result while
 * staying in `process.env`, which is where everything not yet migrated reads
 * it. Add a variable here when getting it wrong should stop the service
 * rather than surface three layers down; read it off `process.env` until
 * then, not off this object.
 */
export const apiEnvSchema = fragments.targetEnvRequired
  .merge(fragments.database)
  .merge(fragments.litellm)
  .merge(fragments.models)
  .merge(fragments.temporal)
  .merge(fragments.redis)
  .merge(fragments.qdrant)
  .merge(fragments.observability)
  .merge(fragments.tokenVault)
  .merge(fragments.encryption)
  .extend({
    // Shared secret with apps/web's internal endpoints. Optional here and
    // required in staging/production by the refinement below, so a local
    // clone runs without it.
    INTERNAL_API_SECRET: z.string().optional(),
    SESSION_AUTH_SECRET: z.string().optional(),
    SECRET_KEY: z.string().optional(),

    CORS_ORIGIN: z.string().optional(),
    PORT: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    requiredInDeployedEnvs(
      env,
      ctx,
      ['LITELLM_MASTER_KEY'],
      'every model call is authenticated against the proxy',
    );

    // The comment on the field says this is not optional in a deployment;
    // until now nothing enforced it. Without the shared secret every call to
    // apps/web's internal endpoints fails the timing-safe comparison, so the
    // public API answers every chat request with an auth error.
    requiredInDeployedEnvs(
      env,
      ctx,
      ['INTERNAL_API_SECRET'],
      "apps/web's internal endpoints reject every request without it",
    );

    // `fragments.encryption` was merged and nothing checked it, so a chosen
    // provider with no key reached the crypto package as "not configured".
    encryptionRules(env, ctx);

    // The vault client signs its requests, so a URL without the secret
    // produces 401s from the vault rather than an obvious misconfiguration
    // (ADR-32).
    // Both pairs, from the table that also describes them to the written
    // config — so the two cannot disagree about half-configured (ADR-32).
    fieldGroupRules(TOKEN_VAULT_GROUP)(env, ctx);
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const parseApiEnv = (source?: Record<string, string | undefined>) =>
  parseEnv(apiEnvSchema, source);
