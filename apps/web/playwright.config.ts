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

// Always point LLM calls to the mock server (port 4100).
// The mock is started by global.setup.ts before tests run.
// This must be set here (not in global.setup) so the webServer process inherits it.
process.env.LITELLM_PROXY_URL = 'http://localhost:4100';

/**
 * The gateway's half of "point LLM calls at the mock", which used to be true of
 * `LITELLM_PROXY_URL` above and has not been since the proxy went (ADR-49).
 *
 * `e2e.yml` sets all five of these; nothing set them locally, and both halves
 * of that fail open. `routeTableFromEnv` falls back to
 * `infra/llm-gateway/routes.yaml` — the production table, with whatever
 * credentials `.env.local` holds — so a local run resolved `mock-model` to
 * `UnknownModelError` *and* sent the turns it could resolve to a real provider.
 * One run reached `mistral-small-3.2-24b-instruct-2506` and came back with
 * `total_tokens: 249`; the mock reports 20. A test suite that bills the
 * operator and ships them the question text is worse than one that fails.
 *
 * Assigned only when absent, so CI's explicit values win and an operator can
 * still point a single run somewhere else from their shell. That works because
 * this process does not load the root `.env.local` — only `.env.e2e.local`
 * above — so "absent here" really does mean "nobody asked for one".
 *
 * **The path has to be absolute.** `routeTableFromEnv` joins a relative one
 * onto `process.cwd()` and does not walk up, and the two processes that read it
 * have different working directories.
 */
const E2E_LLM_ENV = {
  LLM_ROUTES_PATH: path.join(__dirname, 'e2e', 'routes.e2e.yaml'),
  LLM_MOCK_BASE_URL: 'http://localhost:4100/v1',
  LLM_MOCK_API_KEY: 'sk-mock-e2e',
  // Both, and for the reason `routes.e2e.yaml` documents: the answer model
  // comes from the seeded organization and the rephraser from the environment,
  // so pinning one leaves the other resolving against a table that does not
  // describe it.
  DEFAULT_MODEL: 'mock-model',
  REPHRASE_MODEL: 'mock-model',
} as const;

for (const [name, value] of Object.entries(E2E_LLM_ENV)) {
  process.env[name] ??= value;
}

// Mark runtime as e2e test environment so optional secrets skip validation.
process.env.TARGET_ENV = 'test';
// Provide a deterministic secret for public link HMAC signing in e2e tests.
process.env.PUBLIC_LINK_TOKEN_SECRET =
  process.env.PUBLIC_LINK_TOKEN_SECRET ?? 'e2e-test-secret';

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
    // `output: 'standalone'` with outputFileTracingRoot at the monorepo root
    // nests the server under its workspace path inside the bundle (ADR-29).
    command: process.env.CI
      ? 'node .next/standalone/apps/web/server.js'
      : 'npm run start',
    url: baseURL,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    // Playwright defaults `stdout` to 'ignore' and only pipes `stderr`, so
    // every line the application logs was thrown away while Next's own
    // stack traces came through — which reads exactly like an app that logs
    // nothing. Pino writes to stdout.
    //
    // It cost two days on `p0-29`. The route table could not be read, the
    // gateway said so on the first request (`cannot read route table at
    // apps/web/apps/web/e2e/…`), and the diagnosis instead went through the
    // rule cache, the model defaults and a disproved theory about the missing
    // Qdrant service, because the one line that named the fault was
    // discarded by the test runner.
    stdout: 'pipe',
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
