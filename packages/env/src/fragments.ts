import { z } from 'zod';

/**
 * Schema fragments for the variables more than one app reads.
 *
 * 76 of the repository's environment variables are read by two or more apps
 * and 24 by three or more, and until now each app validated them — or did
 * not — on its own terms. That is the same shape of problem ADR-33 found in
 * the feature flags and the model catalogue: not a missing abstraction, but
 * the same rule written down several times, where the copies can disagree
 * without anything noticing.
 *
 * Compose them into an app's own schema with `.merge()`, and add whatever is
 * genuinely local beside it.
 */

/**
 * A variable set to an empty or whitespace-only string is a real deploy shape
 * — a Railway variable someone cleared, a `FOO=` line in a compose file — and
 * it must mean "unset", not "the empty string".
 *
 * This is not cosmetic. `@ragenai/observability`'s `resolveServiceName()` and
 * `@ragenai/storage`'s `resolveStorageProviderName()` both trim and fall back,
 * so a schema that accepted `''` would reject a configuration the runtime is
 * perfectly happy with — or worse, accept one it is not.
 */
export const blankAsUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    schema,
  );

/**
 * A URL that must actually be reachable over HTTP.
 *
 * `z.string().url()` is not that check. It accepts `localhost:4318`, because
 * `new URL('localhost:4318')` does not throw — it reads `localhost:` as the
 * scheme and `4318` as the path. So the single most likely way to mistype an
 * endpoint (dropping `http://`) sails through validation and fails later, at
 * the first request, from somewhere else entirely.
 *
 * This has already bitten once in this repository: the same parse quirk made
 * `URL.origin` return the string `"null"` for a scheme-less OTLP endpoint,
 * silently disabling the exporter self-trace guard in apps/mcp. Catching the
 * shape here means it cannot reach any of the code that has to trust it.
 */
export const httpUrl = () =>
  z
    .string()
    .url()
    .refine(
      (value) => {
        try {
          const { protocol } = new URL(value);
          return protocol === 'http:' || protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'must be an http:// or https:// URL' },
    );

/**
 * Which deployment this process is part of.
 *
 * Read by all five apps and by several `is…TargetEnv` helpers. Note this is
 * `TARGET_ENV`, not `NODE_ENV`: the two are independent here, and a
 * production build running against a staging database is a normal thing to
 * do.
 */
const TARGET_ENV_VALUES = [
  'local',
  'test',
  'e2e',
  'ci',
  'staging',
  'production',
] as const;

export const targetEnv = z.object({
  TARGET_ENV: z.enum(TARGET_ENV_VALUES).default('local'),
});

/**
 * `targetEnv` for a process that must not guess.
 *
 * Defaulting to `local` is right for a developer's fresh clone and dangerous
 * for a deployed service: an unset `TARGET_ENV` on Railway would silently
 * read as `local`, and every `requiredInDeployedEnvs` rule keyed off it would
 * then wave through the production deploy it exists to guard. A service that
 * ships to an environment should be made to say which one.
 */
export const targetEnvRequired = z.object({
  TARGET_ENV: z.enum(TARGET_ENV_VALUES),
});

export const database = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_DIRECT_URL: z.string().url().optional(),
});

/**
 * The LLM gateway every model call goes through (ADR-04). No app talks to a
 * model provider directly, so an unset proxy URL is not a degraded mode — it
 * is no LLM at all.
 */
export const litellm = z.object({
  LITELLM_PROXY_URL: httpUrl(),
  LITELLM_MASTER_KEY: z.string().optional(),
});

export const qdrant = z.object({
  QDRANT_URL: httpUrl().optional(),
  QDRANT_API_KEY: z.string().optional(),
});

/**
 * All of it is a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set (ADR-22),
 * so both are optional — but a malformed endpoint should be caught here
 * rather than by an exporter failing quietly on every flush.
 */
export const observability = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: blankAsUndefined(httpUrl().optional()),
  OTEL_SERVICE_NAME: blankAsUndefined(z.string().optional()),
});

/**
 * ADR-27: local is the default, because self-hosted software has to run from
 * a fresh clone without a cloud account. The blank-as-unset preprocessing has
 * to match `@ragenai/storage`'s own resolver — see `blankAsUndefined`.
 */
export const storage = z.object({
  STORAGE_PROVIDER: blankAsUndefined(z.enum(['s3', 'local']).default('local')),
  STORAGE_LOCAL_PATH: z.string().optional(),
  S3_ENDPOINT_URL: httpUrl().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_SESSION_TOKEN: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),
});

/** The HMAC-signed token vault shared by web, api and worker (ADR-32). */
export const tokenVault = z.object({
  RAGEN_TOKEN_VAULT_URL: httpUrl().optional(),
  RAGEN_TOKEN_VAULT_SERVICE_SECRET: z.string().optional(),
  RAGEN_VAULT_URL: httpUrl().optional(),
  RAGEN_VAULT_SERVICE_SECRET: z.string().optional(),
});

/** Envelope encryption for thread messages (ADR-02, ADR-06). */
export const encryption = z.object({
  ENCRYPTION_PROVIDER: blankAsUndefined(z.string().optional()),
  ENCRYPTION_MASTER_KEY: z.string().optional(),
  SCW_KEY_MANAGER_KEY_ID: z.string().optional(),
  SCW_KEY_MANAGER_REGION: z.string().optional(),
  SCW_API_KEY: z.string().optional(),
});
