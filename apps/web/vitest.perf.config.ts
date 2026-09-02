/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';

/**
 * DB-backed performance and access-control suites.
 *
 * Kept out of `vitest.config.ts` on purpose: these need a live Postgres with
 * the load dataset in it, so they must never run as part of the hermetic unit
 * suite that `npm run verify` gates on. Node environment, not jsdom — nothing
 * here renders.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./test-stubs/server-only.ts', import.meta.url),
      ),
      // The real logger picks its implementation with CommonJS `require()`,
      // which does not resolve outside webpack. The stub also records what it
      // logged, so the tenant-scope guard's warnings become assertable.
      '@/app/lib/utils/logger': fileURLToPath(
        new URL('./perf/logger-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['perf/**/*.test.ts'],
    // A cold query against a few thousand rows is slower than a mocked one,
    // and the matrix walks every named user against every fixture file.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Shared database: parallel files would race on the same rows.
    fileParallelism: false,
  },
});
