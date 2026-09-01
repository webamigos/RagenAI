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
  },
});
