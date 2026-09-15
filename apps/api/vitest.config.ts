/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * This app ran on jest until AI SDK 7, whose dependency tree is ESM-only. See
 * ADR-48 — `apps/worker` moved first, for the same reason and in the same way.
 *
 * The NestJS-specific part is the transform. Vite's default transformer is
 * esbuild, which does not implement `emitDecoratorMetadata` — it strips the
 * types a decorator's metadata is derived from. Nest resolves constructor
 * injection from exactly that metadata, so under esbuild a provider with an
 * unannotated constructor parameter fails to resolve at `compile()` time.
 * `chat.module.wiring.spec.ts` instantiates the whole `AppModule`, so it is
 * the one that would catch this; five specs build a testing module in total.
 *
 * SWC implements it, which is why the transform is swapped rather than the
 * tsconfig relaxed.
 */
export default defineConfig({
  plugins: [
    swc.vite({
      // unplugin-swc reads .swcrc by default; this app has none, so the
      // decorator settings are stated here rather than in a second file.
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
    }),
  ],
  test: {
    // The suite was written against jest's injected globals; keeping them
    // makes the migration a rename of the mocking API and nothing else.
    globals: true,
    environment: 'node',
    // jest's `testRegex: '.*\\.spec\\.ts$'` under `rootDir: src`. The e2e spec
    // lives in test/ and has its own config, as it did under jest.
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      // Without an explicit `include`, v8 reports only the files a test
      // imported — an untested module would simply be absent, and the
      // percentage would describe the tested subset rather than the app.
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.e2e-spec.ts',
        'src/main.ts',
        'src/**/*.module.ts',
      ],
    },
  },
});
