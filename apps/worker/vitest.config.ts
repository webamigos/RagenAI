/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * This app ran on jest until AI SDK 7, whose dependency tree is ESM-only.
 * jest's runtime here compiled the suite to CommonJS — deliberately, so that
 * `jest.mock` kept working through the app's own ESM migration — and a
 * CommonJS runtime cannot require an ESM-only dependency. Extending
 * `transformIgnorePatterns` cascaded (`@ai-sdk/mcp` pulled `@workflow/serde`,
 * and so on) and transforming all of `node_modules` did not help either.
 *
 * Vitest runs the suite as real ESM, which is also what the app itself is, so
 * the runner and the runtime finally agree. See ADR-48.
 */
export default defineConfig({
  test: {
    // The suite was written against jest's injected globals. Keeping them
    // means the migration is a rename of the mocking API and nothing else —
    // no import added to 96 files.
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.ts', 'src/**/*.{spec,test}.ts'],
    exclude: ['**/node_modules/**', 'dist/**', 'lib/**', 'generated/**'],
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Without an explicit `include`, v8 reports only the files a test
      // imported — an untested module would simply be absent, and the
      // percentage would describe the tested subset rather than the app.
      include: ['src/**/*.ts'],
      exclude: [
        'src/generated/**',
        'src/**/__tests__/**',
        'src/**/*.{spec,test}.ts',
      ],
    },
  },
});
