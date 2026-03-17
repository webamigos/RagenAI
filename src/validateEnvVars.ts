const { z } = require('zod');

const TARGET_ENV = ['local', 'test', 'e2e', 'ci', 'staging', 'production'];

// TODO: use this schema instead process.env as source of truth?
const envSchema = z
  .object({
    DEFAULT_MODEL_PROVIDER: z.string(),
    DEFAULT_MODEL: z.string(),

    // Supabase for the App
    DATABASE_URL: z.string().url(),

    // Supabase for Vector store (optional — only needed when using Supabase as vector store)
    SUPABASE_API_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_PROJECT_ID: z.string().optional(),

    // Redis (optional — used only for API rate limiting)
    REDIS_URL: z.string().url().optional(),
    SECRET_KEY: z.string(), // for encrypting organization API keys in DB

    // Target env
    TARGET_ENV: z.enum(TARGET_ENV),

    // Temporal
    TEMPORAL_SERVER_ADDRESS: z.string(),
    // For Temporal Cloud
    // TEMPORAL_NAMESPACE: z.string(),
    // TEMPORAL_CERT: z.string(),
    // TEMPORAL_KEY: z.string(),

    // Meilisearch
    MEILISEARCH_URL: z.string().url(),
    // MEILISEARCH_MASTER_KEY: z.string(), // for staging and production

    // Resend
    RESEND_API_KEY: z.string(),
    RESEND_DEFAULT_AUDIENCE_ID: z.string(),

    // OpenAI
    OPENAI_API_KEY: z.string(),
    OPENAI_MODERATION_KEY: z.string(),

    // AWS
    AWS_ENDPOINT_URL: z.string().url(),
    AWS_S3_BUCKET_NAME: z.string(),
    AWS_DEFAULT_REGION: z.string(),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),

    // Google
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),

    // Stripe
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string(),
    STRIPE_SECRET_KEY: z.string(),
    STRIPE_WEBHOOK_SECRET: z.string(),

    // Firecrawl
    FIRECRAWL_API_KEY: z.string(),

    // Pusher (optional — not needed for on-premise SSE mode)
    PUSHER_APP_ID: z.string().optional(),
    PUSHER_KEY: z.string().optional(),
    PUSHER_SECRET: z.string().optional(),
    NEXT_PUBLIC_PUSHER_KEY: z.string().optional(),

    // Worker auth (used by SSE push endpoint when Pusher is not configured)
    WORKER_SECRET_KEY: z.string().optional(),
  })
  .superRefine(
    (
      env: Record<string, string | undefined>,
      ctx: import('zod').RefinementCtx,
    ) => {
      const isSet = (v: string | undefined) =>
        typeof v === 'string' && v.trim() !== '';

      const pusherVars = [
        env.PUSHER_APP_ID,
        env.PUSHER_KEY,
        env.PUSHER_SECRET,
        env.NEXT_PUBLIC_PUSHER_KEY,
      ];
      const hasSomePusher = pusherVars.some(isSet);
      const hasAllPusher = pusherVars.every(isSet);

      if (hasSomePusher && !hasAllPusher) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Pusher requires all four vars: PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, NEXT_PUBLIC_PUSHER_KEY',
          path: ['PUSHER_APP_ID'],
        });
      }

      if (!hasAllPusher && !isSet(env.WORKER_SECRET_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'WORKER_SECRET_KEY is required when Pusher is not configured (SSE mode)',
          path: ['WORKER_SECRET_KEY'],
        });
      }
    },
  );

export const validateEnvs = () => envSchema.safeParse(process.env);
