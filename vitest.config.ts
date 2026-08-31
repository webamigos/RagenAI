/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],

  test: {
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest-setup.ts'],
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
      // Shared workspace packages (ADR-26). The BM25 encoder used to be tested
      // three times over, once per app; the canonical suite lives with the
      // canonical source and runs here, in the root Test job.
      'packages/*/src/**/*.test.ts',
    ],
    exclude: ['temporal/**'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Workspace packages are measured too. Their tests already ran here
      // (see `include` above), but leaving them out of coverage meant the
      // shared, security-relevant code — BM25 hashing, storage path traversal,
      // the OTel bridge — reported nothing at all.
      include: ['src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
      exclude: [
        'src/generated/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/__tests__/**',
        'packages/*/src/**/__tests__/**',
      ],
    },
  },
});
