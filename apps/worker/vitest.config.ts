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
    // jest's `modulePathIgnorePatterns` equivalent for the built output, which
    // otherwise offers a second copy of every module.
    server: {
      deps: {
        // `franc` is ESM-only with no CommonJS build; under vitest it loads
        // natively, so the manual mock jest needed for it is no longer the
        // only way to reach it.
        inline: ['franc'],
      },
    },
    testTimeout: 20_000,
  },
});
