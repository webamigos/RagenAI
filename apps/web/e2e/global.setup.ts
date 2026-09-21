import { execSync, type ChildProcess, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_LLM_PORT = 4100;
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Store the process globally so teardown can kill it
declare global {
  var __mockLlmProcess: ChildProcess | undefined;
  var __appsApiProcess: ChildProcess | undefined;
}

/** Where `ragenApiRequest` will send the Server Actions that go through apps/api. */
function apiBaseUrl(): string {
  return process.env.RAGEN_API_INTERNAL_URL ?? 'http://localhost:3001';
}

/**
 * The port apps/api must bind, taken from the same url the app will call.
 *
 * Derived rather than configured separately: a second variable is a second
 * thing to get out of step, and the failure when they disagree is a suite that
 * starts an apps/api nothing talks to.
 */
function apiPort(): string {
  return new URL(apiBaseUrl()).port || '3001';
}

/**
 * Whether anything at all holds the port, healthcheck or not.
 *
 * `apiAnswers()` below only recognises an apps/api. Something else on the port
 * — another app's dev server, a tunnel — leaves it `false`, and the spawn that
 * follows dies of `EADDRINUSE` immediately while the wait loop keeps polling
 * for a full minute and then blames the healthcheck. That is the same shape of
 * misleading message this whole function exists to remove, so the port is
 * checked by binding it: the one question with an unambiguous answer.
 */
async function portIsFree(port: string): Promise<boolean> {
  const { createServer } = await import('node:net');
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(Number(port), '0.0.0.0');
  });
}

/**
 * Whether an **apps/api** is on the port — not whether anything is.
 *
 * `/v1/healthcheck` is the route CI waits for, so this recognises the service
 * and nothing else. `portIsFree` below answers the other half of the question.
 */
async function apiAnswers(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl()}/v1/healthcheck`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start the apps/api this suite talks to, and refuse to run against one we did
 * not start.
 *
 * Phase C of ADR-21 moved several Server Actions behind `ragenApiRequest`, so
 * the project list and the thread export are HTTP calls now. `e2e.yml` starts
 * apps/api for exactly that reason and its own comment names those two
 * scenarios. Locally nothing did, and the gap fails open in the worst way: an
 * apps/api left running from an earlier session answers perfectly well, from
 * whichever database *it* was started with — normally the development one. The
 * seeded project and thread are then "missing", `smoke-11` and `smoke-12` go
 * red as if the app had lost them, and because the `authenticated` project
 * depends on `smoke-auth`, **160 p0–p3 tests do not run** under a summary that
 * says `2 failed`.
 *
 * There is no way to ask a running apps/api which database it holds, so a
 * stranger on the port is refused rather than trusted. That is the whole point:
 * the previous behaviour was to trust it silently.
 */
async function startAppsApi(): Promise<void> {
  if (process.env.CI) {
    // CI builds and starts it before Playwright, and waits for the same
    // healthcheck. Starting a second one here would take the port from it.
    return;
  }

  if (await apiAnswers()) {
    throw new Error(
      [
        `Something is already answering on ${apiBaseUrl()}, and this suite cannot`,
        'tell which database it reads. If it is an apps/api from an earlier',
        'session it is almost certainly on the development database, and the',
        'seeded project and thread will look missing — that is how smoke-11 and',
        'smoke-12 fail while every row is present in the e2e database.',
        '',
        'Stop it and re-run:  kill $(lsof -nP -iTCP:3001 -sTCP:LISTEN -t)',
      ].join('\n'),
    );
  }

  const port = apiPort();
  if (!(await portIsFree(port))) {
    throw new Error(
      [
        `Port ${port} is taken by something that is not an apps/api — it did`,
        'not answer /v1/healthcheck. Whatever it is, apps/api cannot bind the',
        'port, so this run has nowhere to send the Server Actions that go',
        'through it.',
        '',
        `Find it and stop it:  lsof -nP -iTCP:${port} -sTCP:LISTEN`,
      ].join('\n'),
    );
  }

  console.log('[global-setup] Building apps/api (turbo caches this)...');
  execSync('npm run api:build', { stdio: 'inherit', cwd: REPO_ROOT });

  console.log(`[global-setup] Starting apps/api on port ${port}...`);
  const proc = spawn('node', ['apps/api/dist/main.js'], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    detached: false,
    env: { ...process.env, PORT: port },
  });
  proc.stderr?.on('data', (data: Buffer) =>
    console.error('[apps-api]', data.toString().trim()),
  );
  globalThis.__appsApiProcess = proc;

  // A boot that fails — a missing variable, a database that refuses — exits in
  // under a second, and without this the loop below spends a minute proving it
  // and then reports a healthcheck timeout. The exit code is the real message.
  let exited: number | null = null;
  proc.once('exit', (code) => {
    exited = code;
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await apiAnswers()) {
      console.log('[global-setup] apps/api is up.');
      return;
    }
    if (exited !== null) {
      throw new Error(
        `apps/api exited with code ${exited} before answering. Its stderr is above.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(
    `apps/api did not answer ${apiBaseUrl()}/v1/healthcheck within 60s.`,
  );
}

export default async function globalSetup() {
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
  console.log('[global-setup] Seed done.');

  // Always start mock LLM server on a dedicated port (4100)
  console.log(
    `[global-setup] Starting mock LLM server on port ${MOCK_LLM_PORT}...`,
  );

  const proc = spawn(
    'npx',
    ['tsx', path.join(__dirname, 'mock-llm-server.ts')],
    {
      stdio: 'pipe',
      detached: false,
      env: { ...process.env, MOCK_LLM_PORT: String(MOCK_LLM_PORT) },
    },
  );

  // Wait for it to be ready
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Mock LLM server failed to start')),
      10_000,
    );
    proc.stdout?.on('data', (data: Buffer) => {
      if (data.toString().includes('Listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    proc.stderr?.on('data', (data: Buffer) => {
      console.error('[mock-llm]', data.toString().trim());
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  globalThis.__mockLlmProcess = proc;
  console.log('[global-setup] Mock LLM server started.');

  // After the mock, because apps/api validates its environment at boot and the
  // first thing it would otherwise report is a gateway it cannot reach.
  await startAppsApi();
}
