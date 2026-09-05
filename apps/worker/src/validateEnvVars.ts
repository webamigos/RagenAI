import {
  fragments,
  requiredForProvider,
  allOrNone,
  requiredInDeployedEnvs,
} from '@ragenai/env';
import { z } from 'zod';

/**
 * The worker's environment contract.
 *
 * The shared halves — TARGET_ENV, the database, the LiteLLM gateway, Qdrant,
 * OTel, storage — come from `@ragenai/env` (ADR-37), so the worker and the
 * app cannot disagree about what a valid `OTEL_SERVICE_NAME` or
 * `STORAGE_PROVIDER` looks like. Only what is genuinely worker-local is
 * spelled out here.
 *
 * `targetEnvRequired`, not `targetEnv`: a deployed service must say which
 * environment it is in rather than defaulting to `local` and quietly
 * disabling the staging/production rules below.
 */
const envSchema = fragments.targetEnvRequired
  .merge(fragments.database)
  .merge(fragments.litellm)
  .merge(fragments.qdrant)
  .merge(fragments.observability)
  .merge(fragments.storage)
  .extend({
    TEMPORAL_SERVER_ADDRESS: z.string(),
    TEMPORAL_NAMESPACE: z.string().optional(),
    TEMPORAL_CERT: z.string().optional(),
    TEMPORAL_KEY: z.string().optional(),

    // Redis for organization settings
    REDIS_URL: z.string().url(),
    SECRET_KEY: z.string(), // for hashing organization settings in Redis

    // Meilisearch (legacy — kept for backwards compatibility)
    MEILISEARCH_URL: z.string().url().optional(),
    MEILISEARCH_API_KEY: z.string().optional(),

    // Scaleway Generative APIs (used by LiteLLM)
    SCW_API_BASE: z.string().url(),
    SCW_API_KEY: z.string().min(1),

    // Embeddings model name (must match infra/litellm/config.yaml model_name)
    EMBEDDINGS_MODEL: z.string(),

    // Pusher (optional — not needed for on-premise SSE mode)
    PUSHER_APP_ID: z.string().optional(),
    PUSHER_KEY: z.string().optional(),
    PUSHER_SECRET: z.string().optional(),

    // PDF processing
    PDF_PROCESSOR: z.enum(['claude', 'vision']).default('claude'),
    PDF_MODEL: z.string().default('claude-haiku-4-5'),

    // Firecrawl (optional — web scraping disabled when absent)
    FIRECRAWL_API_KEY: z.string().optional(),

    // Ragen App (usage reporting)
    RAGEN_APP_URL: z.string().url().optional(),
    WORKER_SECRET_KEY: z.string().optional(),

    // Langfuse
    LANGFUSE_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_SECRET_KEY: z.string().optional(),
    LANGFUSE_HOST: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    requiredForProvider(env, ctx, 'STORAGE_PROVIDER', 's3', [
      'S3_BUCKET_NAME',
      'S3_REGION',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ]);

    // Meilisearch is the legacy fallback, so an installation carrying only
    // its key is still a configured vector store — Qdrant is only mandatory
    // when neither is present.
    if (!env.QDRANT_URL && !env.MEILISEARCH_API_KEY) {
      requiredInDeployedEnvs(
        env,
        ctx,
        ['QDRANT_URL'],
        'no vector store is configured',
      );
    }

    requiredInDeployedEnvs(env, ctx, ['LITELLM_MASTER_KEY']);

    allOrNone(
      env,
      ctx,
      ['PUSHER_APP_ID', 'PUSHER_KEY', 'PUSHER_SECRET'],
      'Pusher',
    );
  });

export const validateEnvs = () => envSchema.safeParse(process.env);
