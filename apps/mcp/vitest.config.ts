/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * This app was the last one on jest. `apps/worker` and `apps/api` moved to
 * Vitest for a reason this app did not have — AI SDK 7's dependency tree is
 * ESM-only and jest's CommonJS runtime cannot require it (ADR-48) — so it was
 * left behind as self-contained. Being the last holdout is the argument for
 * finishing it: two runners meant two sets of mocking idioms, two config
 * surfaces to carry across a TypeScript or Node bump, and one workspace where
 * a contributor's `vi.mock` muscle memory silently did nothing.
 *
 * No `vite-tsconfig-paths` here, unlike `apps/web` and `apps/admin`: this
 * workspace's tsconfig declares no `paths`, so the plugin would have nothing
 * to read. The app's own modules are reached by relative specifier and the two
 * `@ragenai/*` packages through node_modules, as they are at runtime.
 */
export default defineConfig({
  test: {
    // The suite was written against jest's injected globals. Keeping them
    // makes the migration a rename of the mocking API and nothing else — the
    // same call ADR-48 made for the other two apps.
    globals: true,
    environment: 'node',
    // jest's `testMatch` also collected `**/__tests__/**/*.ts` wholesale,
    // which would collect a fixture module placed beside the suites and fail
    // the run with "no test suite found". The suffix is the whole list.
    include: ['src/**/*.{spec,test}.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
    // jest's `clearMocks`. Kept, because several suites assert call counts
    // and relied on it.
    clearMocks: true,
    // jest's `forceExit` has no counterpart and needs none: it was there
    // because pino and the OTel SDK leave handles open and jest would hang
    // rather than exit, while Vitest terminates its pool workers. If a suite
    // ever does hang here, the cause is a handle to close, not a missing
    // option to re-add.
    // Replaces `jest.setup.ts` and its `setupFiles` entry. Vitest runs a
    // setup file per test file rather than once per process, which is what
    // `config/__tests__/env.test.ts` wants anyway — it replaces
    // `process.env` wholesale and restores it itself.
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Without an explicit `include`, v8 reports only the files a test
      // imported — an untested module would simply be absent, and the
      // percentage would describe the tested subset rather than the app.
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/**/*.{spec,test}.ts'],
    },
  },
});
