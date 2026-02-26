const { z } = require('zod');

const TARGET_ENV = ['local', 'test', 'e2e', 'ci', 'staging', 'production'];

// TODO: use this schema instead process.env as source of truth?
const envSchema = z.object({
  DEFAULT_MODEL_PROVIDER: z.string(),
  DEFAULT_MODEL: z.string(),

  // Supabase for the App
  DATABASE_URL: z.string().url(),

  // Supabase for Vector store
  SUPABASE_API_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),
  SUPABASE_PROJECT_ID: z.string(), // needed for vector store migrations migrations

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

  // Stripe
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string(),
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string(),

  // Firecrawl
  FIRECRAWL_API_KEY: z.string(),

  // Pusher
  PUSHER_APP_ID: z.string(),
  PUSHER_KEY: z.string(),
  PUSHER_SECRET: z.string(),
  NEXT_PUBLIC_PUSHER_KEY: z.string(),
});

export const validateEnvs = () => envSchema.safeParse(process.env);
