import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  modulePathIgnorePatterns: ['lib', 'mocha', 'dist'],
  clearMocks: true,
  collectCoverage: false,
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/lib/', '/dist/'],
  coverageProvider: 'v8',
  coverageReporters: ['text', 'text-summary', 'json-summary', 'html'],
  forceExit: true,
  // qdrant.ts uses `await import('@qdrant/js-client-rest')` (a dynamic import).
  // With tsconfig module:node16, ts-jest emits native dynamic imports which
  // Jest's CJS runner cannot intercept. Redirect the package to a manual mock
  // so the dynamic import is resolved to a synchronously-loadable CJS module.
  moduleNameMapper: {
    '@qdrant/js-client-rest':
      '<rootDir>/src/__mocks__/@qdrant/js-client-rest.ts',
  },
  // Override module to commonjs so dynamic import() calls are compiled
  // to require(), allowing jest.mock() interception in the CJS runner.
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
