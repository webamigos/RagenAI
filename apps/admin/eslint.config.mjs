import next from '@ragenai/eslint-config/next';

export default [
  ...next,
  {
    // Instrumentation runs before any logger exists, and the environment
    // report it prints is precisely the case where a logger reading
    // configuration would be untrustworthy. Same override, same reason, as
    // apps/web's.
    files: ['src/instrumentation.ts', 'src/instrumentation.node.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Test tooling, not application code. `global.setup.ts` prints what it is
    // doing because a seed that fails silently is the worst way to spend
    // twenty minutes, and Playwright captures stdout as part of the run.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
