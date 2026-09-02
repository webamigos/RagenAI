/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * Workspace packages, plus the repo-wide architecture guards in `tests/`.
 *
 * The packages part exists because `packages/*` have no test runner of their
 * own and used to ride along in the main app's config — which stopped making
 * sense once that app moved into `apps/web` and would have had to reach two
 * directories up. The apps each own their own config.
 *
 * `tests/architecture/*` holds invariants that span workspaces, so they belong
 * to no single app. They read source as text rather than importing it, which
 * is what lets one test speak for the whole monorepo.
 *
 * Run via `npm run packages:test`, and in CI as the `Packages / Test` job.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'tests/**/*.test.ts'],
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
