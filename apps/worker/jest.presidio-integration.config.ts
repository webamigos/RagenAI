import type { Config } from 'jest';

/**
 * Separate config for the Presidio integration suite — real HTTP calls
 * against the analyzer/anonymizer containers, not mocked fetch. Kept out of
 * the default `jest.config.ts` testMatch (which would otherwise pick up any
 * `__tests__/**\/*.ts` or `*.test.ts` file) so `npm test`/`npm run
 * worker:test` never depends on Docker being up. Run explicitly via `npm run
 * test:presidio-integration` after starting the containers — see
 * `docs/runbooks/presidio-upgrade.md`.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/test/presidio-integration/**/*.presidio-integration.ts',
  ],
  modulePathIgnorePatterns: ['lib', 'mocha', 'dist'],
  clearMocks: true,
  forceExit: true,
  // Real network calls to real containers take longer than unit-test mocks.
  testTimeout: 30_000,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
        },
      },
    ],
  },
};

export default config;
