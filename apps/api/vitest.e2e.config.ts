/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { config as loadEnv } from 'dotenv';

/**
 * The e2e suite boots the real `AppModule` over supertest, so it needs the same
 * decorator-metadata transform as the unit config — see `vitest.config.ts` for
 * why esbuild cannot provide it.
 *
 * It stays a separate config, as it did under jest (`test/jest-e2e.json`), so
 * `npm test` does not boot an application.
 */
// `ConfigModule` looks for `.env.local`/`.env` beside this app, and the
// monorepo keeps one file at the root instead (see `scripts/load-root-env.mjs`).
// Without this the app boots far enough to build `PrismaService` and then
// throws on `DATABASE_URL` — which is how this suite was already failing under
// jest, where nothing loaded the root file either.
loadEnv({ path: new URL('../../.env.local', import.meta.url).pathname });

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
  },
});
