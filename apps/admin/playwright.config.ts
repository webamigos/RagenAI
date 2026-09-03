import path from 'path';
import { fileURLToPath } from 'url';

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * End-to-end tests for the admin panel.
 *
 * The panel had none, while being able to ban an account, revoke a
 * credential, delete somebody's OAuth token and rewrite every organization's
 * limits. Its unit tests read Server Actions as text and mock Prisma; nothing
 * exercised sign-in, the role check, or a form actually saving.
 *
 * Separate from apps/web's suite rather than folded into it. Different port,
 * different auth cookie prefix (`ragen-admin` versus `better-auth`), different
 * locale handling — apps/web's `ROUTES` are locale-prefixed, its `LABELS` are
 * Polish regexes and its `login()` waits for a `/pl/new` URL, none of which
 * apply here.
 */

// The e2e database, same one apps/web's suite uses. `.env.e2e.local` at the
// repository root is the intended place to point it somewhere else.
dotenv.config({
  path: path.resolve(__dirname, '..', '..', '.env.e2e.local'),
  override: true,
  quiet: true,
} as dotenv.DotenvConfigOptions);

process.env.TARGET_ENV = 'test';

const PORT = process.env.ADMIN_PORT ?? 3200;
const baseURL = `http://localhost:${PORT}`;

const AUTH_FILE = path.join(__dirname, 'e2e', '.auth', 'admin.json');

export default defineConfig({
  globalSetup: './e2e/global.setup.ts',
  timeout: 30 * 1000,
  testDir: path.join(__dirname, 'e2e'),
  // The specs share one database and several of them write to it — banning a
  // user, granting a role. Running them in parallel would make each one's
  // starting state depend on another's timing.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  outputDir: 'test-results/',
  reporter: [['list'], ['html', { open: 'never' }]],

  webServer: {
    command: 'npm run start',
    url: `${baseURL}/login`,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },

  use: {
    baseURL,
    trace: 'retry-with-trace',
  },

  projects: [
    // Unauthenticated first, and with no dependency: these assert that the
    // panel refuses, so a broken sign-in must not stop them running.
    {
      name: 'no-auth',
      testMatch: /smoke-0[1-2]-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'smoke',
      testMatch: /smoke-(?!0[1-2])\d{2}-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
      dependencies: ['setup'],
    },
    {
      name: 'authenticated',
      testMatch: /p\d+-\d{2}-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
      dependencies: ['smoke'],
    },
  ],
});
