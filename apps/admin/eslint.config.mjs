import next from '@ragenai/eslint-config/next';

export default [
  ...next,
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
