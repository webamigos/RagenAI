import { execSync, type ChildProcess, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_LLM_PORT = 4100;

// Store the process globally so teardown can kill it
declare global {
  // eslint-disable-next-line no-var
  var __mockLlmProcess: ChildProcess | undefined;
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
}
