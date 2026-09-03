import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Seed the same database apps/web's suite seeds.
 *
 * The seed script is apps/web's, and it is invoked with an **absolute** path
 * and an explicit `cwd`. apps/web's own `global.setup.ts` calls it as
 * `npx tsx e2e/seed/e2e-seed.ts`, which only resolves because that suite runs
 * from apps/web; the same line from here would look in apps/admin and fail
 * with a confusing "module not found".
 */
export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for the admin E2E suite. It should point at ' +
        'the e2e database (ragen_e2e), not a development one — the seed ' +
        'truncates and rewrites tables.',
    );
  }

  const webRoot = path.resolve(__dirname, '..', '..', 'web');

  console.log('[admin-e2e] Seeding via apps/web/e2e/seed/e2e-seed.ts…');
  execSync('npx tsx e2e/seed/e2e-seed.ts', {
    cwd: webRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('[admin-e2e] Seed done.');
}
