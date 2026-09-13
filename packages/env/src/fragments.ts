import { z } from 'zod';

import { TARGET_ENV_VALUES } from './target-env';

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
 * A Redis connection string ioredis will use the way it was meant.
 *
 * `z.string().url()` is not that check, for the reason `httpUrl()` gives:
 * it accepts `localhost:56379`, reading `localhost:` as a scheme. But the
 * conclusion is the opposite one here, because ioredis is more tolerant than
 * an HTTP client — it accepts `localhost:56379` and parses it correctly, so
 * refusing it would reject a configuration the runtime is perfectly happy
 * with (the mistake `blankAsUndefined` exists to avoid).
 *
 * What ioredis does *not* do is care about the scheme. `falkor://host:6379`,
 * `http://host:56379` and `redis://host:6379` all produce the same
 * connection: it takes the host and port and ignores the rest. The one
 * exception is `rediss://`, which is the only thing that turns TLS on.
 *
 * So the scheme is worth checking, and the reason is not tidiness: someone
 * who writes `https://…` for a managed Redis gets a working, **unencrypted**
 * connection and no complaint from anything. A wrong scheme is silent, and
 * silently not-TLS.
 */
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const REDIS_SCHEME = /^rediss?:\/\//i;
/** No whitespace, no path — `host`, `host:port`. */
const HOST_PORT = /^[^\s/@]+(:\d+)?$/;

export const redisUrl = () =>
  z.string().refine(
    (value) => {
      const trimmed = value.trim();

      if (SCHEME.test(trimmed)) {
        if (!REDIS_SCHEME.test(trimmed)) {
          return false;
        }
        // The scheme being right does not make the rest of it a URL.
        try {
          new URL(trimmed);
          return true;
        } catch {
          return false;
        }
      }

      return HOST_PORT.test(trimmed);
    },
    {
      message:
        'must be a redis:// or rediss:// URL, or host:port — any other scheme is ignored by ioredis, which then connects without TLS',
    },
  );

/**
 * Which deployment this process is part of.
 *
 * Read by every app under `apps/` and by several `is…TargetEnv` helpers. Note
 * this is `TARGET_ENV`, not `NODE_ENV`: the two are independent here, and a
 * production build running against a staging database is a normal thing to
 * do.
 *
 * The value list lives in `./target-env`, beside `isDeployedEnv()`, so the
 * enum and the predicate over it cannot fall out of step.
 */
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
 *
 * Every S3 credential is optional here for the same reason the encryption
 * fragment's are: which ones are mandatory depends on `STORAGE_PROVIDER`.
 * Call `storageRules` alongside this fragment.
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

/**
 * Model selection and tuning defaults.
 *
 * `DEFAULT_MODEL` and `DEFAULT_MODEL_PROVIDER` were declared separately in
 * apps/web and apps/api with identical definitions, which is the duplication
 * fragments exist to remove (ADR-37). The rest were in no schema at all:
 * `REPHRASE_MODEL`, `REPHRASE_TEMPERATURE` and `SUMMARY_MODEL` are read by two
 * workspaces each and validated by none — a gap the review of #1114 found from
 * the other direction, as variables the configuration page could not document
 * because nothing declared them.
 *
 * All optional, and deliberately not enums. The catalogue lives in
 * `infra/litellm/config.yaml` and `@ragenai/platform-contracts`; pinning model
 * names here would mean a schema change every time a model is provisioned.
 *
 * `EMBEDDINGS_MODEL` and `VECTOR_SIZE` are optional here and required in
 * apps/worker, which extends over them — its ingest cannot guess either.
 */
export const models = z.object({
  DEFAULT_MODEL: blankAsUndefined(z.string().optional()),
  DEFAULT_MODEL_PROVIDER: blankAsUndefined(z.string().optional()),
  REPHRASE_MODEL: blankAsUndefined(z.string().optional()),
  REPHRASE_TEMPERATURE: blankAsUndefined(z.string().optional()),
  SUMMARY_MODEL: blankAsUndefined(z.string().optional()),
  EMBEDDINGS_MODEL: blankAsUndefined(z.string().optional()),
  VECTOR_SIZE: blankAsUndefined(z.string().optional()),
});

/**
 * Post-retrieval reranking (ADR-12).
 *
 * `SCW_API_KEY` is declared here *and* in `encryption`, deliberately: it is
 * one Scaleway account key, and both features authenticate with it. Declaring
 * it twice is how a fragment stays readable on its own — `.merge()` takes the
 * later of two identical definitions, so nothing changes by merging both.
 * `configToEnv` refuses two groups writing *different* values for it.
 *
 * None of this runs at all unless `FEATURE_FLAG_RERANKING=1`. The flag is not
 * here: flags resolve per organization through
 * `@ragenai/platform-contracts`, and a schema is the wrong place for one.
 */
export const reranker = z.object({
  RERANK_PROVIDER: blankAsUndefined(
    z.enum(['scaleway', 'cohere']).default('scaleway'),
  ),
  RERANK_MODEL: blankAsUndefined(z.string().optional()),
  SCW_API_BASE: blankAsUndefined(httpUrl().optional()),
  SCW_API_KEY: z.string().optional(),
});

/**
 * Outgoing mail.
 *
 * `MAIL_PROVIDER` is optional and usually unset: `getMailProvider()` detects
 * from credentials first — a `RESEND_API_KEY` selects Resend, an `SMTP_HOST`
 * selects SMTP — and the variable exists to override that, or to decide when
 * both are configured. Resend used to be the unconditional default, which
 * handed someone who had set only `SMTP_HOST` an error about Resend they never
 * asked for.
 *
 * `SMTP_USER` is optional because unauthenticated relays are real:
 * `SmtpMailProvider` sets `auth` only when it is present.
 */
export const mail = z.object({
  MAIL_PROVIDER: blankAsUndefined(
    z.enum(['resend', 'smtp', 'console']).optional(),
  ),
  RESEND_API_KEY: z.string().optional(),
  RESEND_DEFAULT_SEGMENT_ID: blankAsUndefined(z.string().optional()),
  SMTP_HOST: blankAsUndefined(z.string().optional()),
  SMTP_PORT: blankAsUndefined(z.string().optional()),
  SMTP_USER: blankAsUndefined(z.string().optional()),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: blankAsUndefined(z.string().optional()),
});

/**
 * Temporal, which runs document ingest (ADR-26).
 *
 * All optional, because `TEMPORAL_SERVER_ADDRESS` genuinely is for apps/web
 * and apps/api — both fall back to `localhost:7233` and neither starts a
 * workflow on a laptop. apps/worker cannot: it *is* the worker, so it takes
 * `temporalRequired` instead. Same shape as `targetEnv`/`targetEnvRequired`,
 * and for the same reason — one definition, two strengths, rather than three
 * apps each deciding again.
 *
 * `TEMPORAL_CERT` and `TEMPORAL_KEY` are carried because `.env.example` ships
 * them and apps/worker declared them, but nothing reads either: the only
 * references are commented out in `apps/web/src/libs/temporal/client.ts`,
 * against the day Temporal Cloud's mTLS is wired up. Declared, unread, and
 * said so here rather than implying they do something.
 */
export const temporal = z.object({
  TEMPORAL_SERVER_ADDRESS: blankAsUndefined(z.string().optional()),
  TEMPORAL_NAMESPACE: blankAsUndefined(z.string().optional()),
  TEMPORAL_CERT: z.string().optional(),
  TEMPORAL_KEY: z.string().optional(),
});

/** `temporal` for the process that cannot fall back — see above. */
export const temporalRequired = temporal.extend({
  TEMPORAL_SERVER_ADDRESS: z.string(),
});

/**
 * Redis.
 *
 * Optional here and required in apps/worker, which caches organization
 * settings through it. In apps/web it is genuinely optional and the absence
 * is a real mode rather than a degraded one: the settings cache computes
 * values directly, and the public chatbot rate limiter **fails open** — worth
 * knowing before deciding not to set it, which is why `.env.example`'s old
 * comment calling it "only needed for API rate limiting" was wrong in both
 * directions (apps/api's limiter is in-memory and never reads it).
 */
export const redis = z.object({
  REDIS_URL: blankAsUndefined(redisUrl().optional()),
});

/** `redis` for the worker, which has no fallback for it. */
export const redisRequired = z.object({
  REDIS_URL: redisUrl(),
});

/** The HMAC-signed token vault shared by web, api and worker (ADR-32). */
export const tokenVault = z.object({
  RAGEN_TOKEN_VAULT_URL: httpUrl().optional(),
  RAGEN_TOKEN_VAULT_SERVICE_SECRET: z.string().optional(),
  RAGEN_VAULT_URL: httpUrl().optional(),
  RAGEN_VAULT_SERVICE_SECRET: z.string().optional(),
});

/**
 * Envelope encryption for thread messages and PII (ADR-02, ADR-06).
 *
 * All optional here, because which ones are mandatory depends on
 * `ENCRYPTION_PROVIDER` — so merging this fragment alone validates nothing
 * beyond the types. Call `encryptionRules` in the consuming app's
 * `superRefine`; it is the rule this fragment is meaningless without, and
 * `tests/architecture/provider-fragments-carry-their-rules.test.ts` fails when
 * the two come apart.
 *
 * The AWS entries were missing while `apps/web` and `apps/api` already
 * supported `ENCRYPTION_PROVIDER=kms`, so the one provider with no boot-time
 * check was the one whose absence from `apps/worker` silently downgraded PII
 * ingest. See docs/specs/2026-09-08-one-encryption-package.md.
 */
export const encryption = z.object({
  ENCRYPTION_PROVIDER: blankAsUndefined(z.string().optional()),
  ENCRYPTION_MASTER_KEY: z.string().optional(),
  SCW_KEY_MANAGER_KEY_ID: z.string().optional(),
  SCW_KEY_MANAGER_REGION: z.string().optional(),
  SCW_API_KEY: z.string().optional(),
  AWS_KMS_KEY_ID: z.string().optional(),
  AWS_ENDPOINT_URL: z.string().optional(),
  AWS_DEFAULT_REGION: z.string().optional(),
});
