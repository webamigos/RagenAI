/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * Workspace packages only. The apps each own their own vitest config; this one
 * exists because `packages/*` have no test runner of their own and used to ride
 * along in the main app's config — which stopped making sense once that app
 * moved into `apps/web` and would have had to reach two directories up.
 *
 * Run via `npm run packages:test`, and in CI as the `Packages / Test` job.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage/packages',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/__tests__/**', 'packages/db/**'],
    },
  },
});
