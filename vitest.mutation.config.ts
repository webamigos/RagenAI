/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Test scope for mutation testing only — used by `stryker.config.mjs`, never by
 * `npm run test`, `npm run packages:test` or any CI test job.
 *
 * Why this exists rather than reusing `vitest.config.ts`: Stryker's scope is
 * `packages/*` plus one file inside `apps/web` (the tenant-scope guard). The
 * root config deliberately covers `packages/*` only, because each app owns its
 * own config, and `apps/web/vitest.config.ts` cannot see `packages/*` tests
 * from where it sits. Neither one alone runs every test Stryker needs, and a
 * mutant with no covering test in scope survives unconditionally — which reads
 * in the report as a weak test suite when it is really a missing config entry.
 *
 * Keep `include` here in step with `mutate` in `stryker.config.mjs`: an entry
 * there whose covering tests are missing here is worse than no entry at all.
 */
export default defineConfig({
  resolve: {
    alias: {
      // apps/web's own tests get `@/*` from its tsconfig via vite-tsconfig-paths.
      // Running one of them from the repo root means resolving that alias here,
      // explicitly — the guard imports `@/generated/prisma/client` for
      // `Prisma.defineExtension`, so without this the file will not even load.
      // (That path is generated and gitignored; CI runs `npx prisma generate`
      // before `npm run test:mutation`.)
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },

  test: {
    environment: 'node',
    include: [
      'packages/*/src/**/*.test.ts',
      // Not a glob over apps/web: only the tests covering files listed in
      // Stryker's `mutate` belong here, and widening this to the whole app
      // suite would cost hours per mutant for no added signal.
      'apps/web/src/libs/db/__tests__/tenant-scope-guard.test.ts',
    ],
    clearMocks: true,
  },
});
