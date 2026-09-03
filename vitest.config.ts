/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';

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
 * Run via `npm run packages:test`, and in CI as the `Test` job.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Only for the one apps/web file included below, whose module resolves
      // the generated Prisma client through this alias at runtime
      // (Prisma.defineExtension). There is no tsconfig at the repo root for
      // vite-tsconfig-paths to read.
      '@/': `${fileURLToPath(new URL('./apps/web/src', import.meta.url))}/`,
    },
  },

  test: {
    environment: 'node',
    include: [
      'packages/*/src/**/*.test.ts',
      'tests/**/*.test.ts',
      // Reached across from apps/web on purpose: stryker.config.mjs mutates
      // this one file against *this* config, so its test has to be runnable
      // from here or every mutant in it survives by default.
      'apps/web/src/libs/db/__tests__/tenant-scope-guard.test.ts',
    ],
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
