import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  // Anchored to this workspace's own build output — an unanchored 'dist'
  // would also match any node_modules dependency resolved under a `dist/`
  // folder (a common package layout), silently blocking Jest from
  // require()-ing it.
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
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
