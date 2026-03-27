import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.e2e.local if it exists — overrides only the vars you set there.
// Falls back to .env.local for everything else (loaded by Next.js at runtime).
dotenv.config({
  path: path.resolve(__dirname, '.env.e2e.local'),
  override: true,
  debug: false,
  quiet: true,
} as dotenv.DotenvConfigOptions);

// Use process.env.PORT by default and fallback to port 3000
const PORT = process.env.PORT ?? 3000;

// Set webServer.url and use.baseURL with the location of the WebServer respecting the correct set port
const baseURL = `http://localhost:${PORT}`;

const AUTH_FILE = path.join(__dirname, 'e2e', '.auth', 'user.json');

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  globalSetup: './e2e/global.setup.ts',
  globalTeardown: './e2e/global.teardown.ts',
  timeout: 30 * 1000,
  testDir: path.join(__dirname, 'e2e'),
  /* Run tests sequentially — they share DB state */
  fullyParallel: false,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  outputDir: 'test-results/',
  /* Single worker — tests share DB state */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['list'], ['html'], ['playwright-ctrf-json-reporter', {}]],

  webServer: {
    command: process.env.CI
      ? 'node .next/standalone/server.js'
      : 'npm run start',
    url: baseURL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retry-with-trace',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'no-auth',
      testMatch: /smoke-0[1-6]-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'smoke-auth',
      testMatch: /smoke-(?!0[1-6])\d{2}-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
    },
    {
      name: 'authenticated',
      testMatch: /p\d+-\d{2}-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_FILE,
      },
      dependencies: ['smoke-auth'],
    },
  ],
});
