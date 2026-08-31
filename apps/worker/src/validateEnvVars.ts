import { z } from 'zod';

const envSchema = z
  .object({
    TARGET_ENV: z.enum(['local', 'test', 'e2e', 'ci', 'staging', 'production']),

    TEMPORAL_SERVER_ADDRESS: z.string(),
    TEMPORAL_NAMESPACE: z.string().optional(),
    TEMPORAL_CERT: z.string().optional(),
    TEMPORAL_KEY: z.string().optional(),

    DATABASE_URL: z.string().url(),

    // Redis for organization settings
    REDIS_URL: z.string().url(),
    SECRET_KEY: z.string(), // for hashing organization settings in Redis

    // Meilisearch (legacy — kept for backwards compatibility)
    MEILISEARCH_URL: z.string().url().optional(),
    MEILISEARCH_API_KEY: z.string().optional(),

    // Qdrant (default vector store)
    QDRANT_URL: z.string().url().optional(),
    QDRANT_API_KEY: z.string().optional(),

    // LiteLLM proxy (unified LLM gateway for all chat and embedding models)
    LITELLM_PROXY_URL: z.string().url(),
    LITELLM_MASTER_KEY: z.string().optional(),

    // Scaleway Generative APIs (used by LiteLLM)
    SCW_API_BASE: z.string().url(),
    SCW_API_KEY: z.string().min(1),

    // Embeddings model name (must match litellm/config.yaml model_name)
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

    // Storage provider: 'local' (default, filesystem) or 's3'. ADR-27 flipped
    // the default — Ragen is self-hosted, so a fresh install must start without
    // cloud credentials.
    // Preprocessed so a blank or whitespace-only value falls back to the
    // default instead of failing the enum — @ragenai/storage's own resolver
    // trims and treats blank as unset, and the two must agree or validation
    // rejects a config the runtime would happily accept.
    STORAGE_PROVIDER: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
      z.enum(['s3', 'local']).default('local'),
    ),
    STORAGE_LOCAL_PATH: z.string().optional(),

    // AWS (required only when STORAGE_PROVIDER is explicitly 's3')
    AWS_ENDPOINT_URL: z.string().url().optional(),
    AWS_S3_BUCKET_NAME: z.string().optional(),
    AWS_DEFAULT_REGION: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_SESSION_TOKEN: z.string().optional(),

    // Ragen App (usage reporting)
    RAGEN_APP_URL: z.string().url().optional(),
    WORKER_SECRET_KEY: z.string().optional(),

    // OpenTelemetry
    OTEL_SERVICE_NAME: z.preprocess(
      (val) => (val === '' ? undefined : val),
      z.string().optional(),
    ),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

    // Langfuse
    LANGFUSE_PUBLIC_KEY: z.string().optional(),
    LANGFUSE_SECRET_KEY: z.string().optional(),
    LANGFUSE_HOST: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    const isSet = (v: string | undefined) =>
      typeof v === 'string' && v.trim() !== '';

    // Storage provider validation
    const storageProvider = env.STORAGE_PROVIDER;

    if (storageProvider === 's3') {
      const requiredS3Vars = [
        'AWS_S3_BUCKET_NAME',
        'AWS_DEFAULT_REGION',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
      ] as const;
      for (const varName of requiredS3Vars) {
        if (!isSet(env[varName])) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${varName} is required when STORAGE_PROVIDER is "s3"`,
            path: [varName],
          });
        }
      }
    }

    if (
      (env.TARGET_ENV === 'staging' || env.TARGET_ENV === 'production') &&
      !env.QDRANT_URL &&
      !env.MEILISEARCH_API_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'QDRANT_URL is required when TARGET_ENV is "staging" or "production"',
        path: ['QDRANT_URL'],
      });
    }

    if (
      (env.TARGET_ENV === 'staging' || env.TARGET_ENV === 'production') &&
      !env.LITELLM_MASTER_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'LITELLM_MASTER_KEY is required when TARGET_ENV is "staging" or "production"',
        path: ['LITELLM_MASTER_KEY'],
      });
    }

    const pusherVars = [env.PUSHER_APP_ID, env.PUSHER_KEY, env.PUSHER_SECRET];
    const pusherSet = pusherVars.filter(Boolean).length;
    if (pusherSet > 0 && pusherSet < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'PUSHER_APP_ID, PUSHER_KEY, and PUSHER_SECRET must all be set or all be omitted',
        path: ['PUSHER_APP_ID'],
      });
    }
  });

export const validateEnvs = () => envSchema.safeParse(process.env);
