const { z } = require('zod');

const TARGET_ENV = ['local', 'test', 'e2e', 'ci', 'staging', 'production'];

// TODO: use this schema instead process.env as source of truth?
const envSchema = z.object({
  // Supabase for the App
  DATABASE_URL: z.string().url(),
  DATABASE_DIRECT_URL: z.string().url(),

  // Supabase for Vector store
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string(),

  // Clerk
  CLERK_SECRET_KEY: z.string(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string(),
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string(),

  // Langsmith?
  LANGCHAIN_TRACING_V2: z.coerce.boolean(),
  LANGCHAIN_ENDPOINT: z.string().url(),
  LANGCHAIN_API_KEY: z.string(),
  LANGCHAIN_PROJECT: z.enum(TARGET_ENV),
  LANGCHAIN_CALLBACKS_BACKGROUND: z.coerce.boolean(),

  // Redis for organization settings
  REDIS_URL: z.string().url(),
  SECRET_KEY: z.string(), // for hashing organization settings in Redis

  // Target env
  TARGET_ENV: z.enum(TARGET_ENV),
});

const validateEnvs = () => envSchema.safeParse(process.env);

module.exports = validateEnvs;
