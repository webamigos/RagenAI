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
    clearMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'packages',
          include: [
            'packages/*/src/**/*.test.ts',
            // Reached across from apps/web on purpose: stryker.config.mjs
            // mutates this one file against *this* config, so its test has to
            // be runnable from here or every mutant in it survives by default.
            'apps/web/src/libs/db/__tests__/tenant-scope-guard.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'architecture',
          include: ['tests/**/*.test.ts'],
          // The guards read the repository as text and never mock, stub or
          // mutate global state, so they need no per-file isolation — and
          // sharing a worker lets `tracked-files.ts` list the repository and
          // read each file once per worker instead of once per file.
          isolate: false,
          // A budget for a hang, not for a guard's work. Under `npm run
          // verify` (turbo, four tasks at once) guards that finish in under a
          // second alone missed the 5 s default by being scheduled late —
          // docs/lessons/a-five-second-test-timeout-fires-under-verifys-concurrency.md.
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage/packages',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/__tests__/**'],
    },
  },
});
