import next from '@ragenai/eslint-config/next';

export default [
  ...next,
  {
    ignores: ['temporal/**', 'e2e/**/*.js', 'public/**'],
  },
  {
    // These are the app's own logging and tooling entry points: the logger
    // cannot log through itself, instrumentation runs before it exists, and
    // config/seed/e2e scripts are operator-facing.
    files: [
      'src/instrumentation.ts',
      'src/instrumentation-client.ts',
      'src/app/lib/utils/logger.ts',
      'next.config.ts',
      'prisma/**',
      'e2e/**',
      'evals/**',
      'perf/**',
      'scripts/**',
    ],
    rules: { 'no-console': 'off' },
  },
  {
    // `require` here is deliberate, not legacy: the logger picks its server or
    // client implementation at runtime from `typeof window`, which an ESM
    // import cannot express. next.config.ts is CommonJS by Next's own
    // contract.
    files: ['src/app/lib/utils/logger/**', 'next.config.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
