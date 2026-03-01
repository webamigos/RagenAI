import { execSync } from 'child_process';

export default function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL environment variable is required for E2E tests.',
    );
  }

  console.log('[global-setup] Running E2E seed script...');
  execSync('npx tsx e2e/seed/e2e-seed.ts', {
    stdio: 'inherit',
    env: { ...process.env },
  });
  console.log('[global-setup] Done.');
}
