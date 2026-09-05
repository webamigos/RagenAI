import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  modulePathIgnorePatterns: ['lib', 'dist'],
  clearMocks: true,
  forceExit: true,
  // Source uses Node16 module resolution (import specifiers end in `.js`,
  // per the project's `"type": "module"`) — strip that extension so
  // ts-jest's CommonJS transform can resolve the same files under Jest.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
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
