/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * Separate config for the Presidio integration suite — real HTTP calls
 * against the analyzer/anonymizer containers, not mocked fetch. Kept out of
 * `vitest.config.ts`'s `include` (which would otherwise pick up any
 * `__tests__/**` or `*.test.ts` file) so `npm test`/`npm run worker:test`
 * never depends on Docker being up. Run explicitly via `npm run
 * test:presidio-integration` after starting the containers — see
 * `docs/runbooks/presidio-upgrade.md`.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/presidio-integration/**/*.presidio-integration.ts'],
    exclude: ['**/node_modules/**', 'dist/**', 'lib/**', 'generated/**'],
    clearMocks: true,
    // Real network calls to real containers take longer than unit-test mocks.
    testTimeout: 30_000,
  },
});
