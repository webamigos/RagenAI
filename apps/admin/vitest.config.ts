/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [tsconfigPaths()],

  resolve: {
    alias: {
      // See test-stubs/server-only.ts — the real module throws on import.
      'server-only': fileURLToPath(
        new URL('./test-stubs/server-only.ts', import.meta.url),
      ),
    },
  },

  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Without an explicit `include`, v8 reports only the files a test
      // imported — an untested module would simply be absent, and the
      // percentage would describe the tested subset rather than the app.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/generated/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/__tests__/**',
      ],
    },
  },
});
