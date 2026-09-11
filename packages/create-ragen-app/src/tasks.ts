import { execa } from 'execa';

export interface RunOptions {
  cwd: string;
  /**
   * Extra env vars for the child process — needed for `generate:types` and
   * `migrate deploy`, which read `DATABASE_URL` from `process.env` directly
   * (see prisma.config.ts) and do not load `.env.local` themselves the way
   * `npm run db:seed` does (`tsx --env-file=.env.local`). execa merges this
   * with the parent's own `process.env` automatically.
   */
  env?: NodeJS.ProcessEnv;
}

export interface MigrateOptions {
  retries?: number;
  retryDelayMs?: number;
}

export async function isDockerAvailable(): Promise<boolean> {
  try {
    // A stuck `docker info` (e.g. Docker Desktop still starting up) would
    // otherwise block forever instead of falling through to the "Docker not
    // available" path.
    await execa('docker', ['info'], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export async function startDockerServices({ cwd }: RunOptions): Promise<void> {
  await execa('docker', ['compose', 'up', '-d'], { cwd, stdio: 'inherit' });
}

export async function installDependencies({ cwd }: RunOptions): Promise<void> {
  await execa('npm', ['install'], { cwd, stdio: 'inherit' });
}

export async function generatePrismaClient({
  cwd,
  env,
}: RunOptions): Promise<void> {
  await execa('npm', ['run', 'generate:types'], { cwd, env, stdio: 'inherit' });
}

export async function seedDatabase({ cwd, env }: RunOptions): Promise<void> {
  await execa('npm', ['run', 'db:seed'], { cwd, env, stdio: 'inherit' });
}

/**
 * Postgres needs a moment to accept connections right after
 * `docker compose up -d`, so a first `migrate deploy` failing is expected —
 * retry with a short backoff instead of surfacing that as a hard error.
 */
export async function migrateDatabase(
  { cwd, env }: RunOptions,
  { retries = 5, retryDelayMs = 3000 }: MigrateOptions = {},
): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await execa('npx', ['prisma', 'migrate', 'deploy'], {
        cwd,
        env,
        stdio: 'inherit',
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await delay(retryDelayMs);
      }
    }
  }

  throw new Error(
    `prisma migrate deploy failed after ${retries} attempts — is Postgres reachable? ${String(lastError)}`,
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
