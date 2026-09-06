import {
  allOrNone,
  fragments,
  parseEnv,
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
 * Not exhaustive over every variable apps/api reads, and not meant to be —
 * a Zod object ignores keys it does not mention, so this validates what is
 * listed and stays out of the way of the rest. Add a variable here when
 * getting it wrong should stop the service rather than surface three layers
 * down.
 */
export const apiEnvSchema = fragments.targetEnvRequired
  .merge(fragments.database)
  .merge(fragments.litellm)
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

    TEMPORAL_SERVER_ADDRESS: z.string().optional(),

    DEFAULT_MODEL: z.string().optional(),
    DEFAULT_MODEL_PROVIDER: z.string().optional(),

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

    // The vault client signs its requests, so a URL without the secret
    // produces 401s from the vault rather than an obvious misconfiguration
    // (ADR-32).
    allOrNone(
      env,
      ctx,
      ['RAGEN_TOKEN_VAULT_URL', 'RAGEN_TOKEN_VAULT_SERVICE_SECRET'],
      'The token vault',
    );
    allOrNone(
      env,
      ctx,
      ['RAGEN_VAULT_URL', 'RAGEN_VAULT_SERVICE_SECRET'],
      'The vault',
    );
  });

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export const parseApiEnv = (source?: Record<string, string | undefined>) =>
  parseEnv(apiEnvSchema, source);
