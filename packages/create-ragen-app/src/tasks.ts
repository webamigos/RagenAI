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

/**
 * Whether this Docker daemon already runs a Ragen stack.
 *
 * docker-compose.yml pins container, volume and network names instead of
 * letting Compose prefix them per project, so a second install does not just
 * collide on the container names — it silently attaches to the *same*
 * postgres and qdrant volumes as the first one. Checking the volume rather
 * than a container catches a stack that is merely stopped, which is the
 * case that looks safest and is not.
 *
 * Reads RAGEN_STACK_NAME for the same reason compose does: someone already
 * running a stack under a name of their own would otherwise be told their
 * machine is clear, and collide with it.
 */
export async function ragenStackVolumeExists(): Promise<boolean> {
  const stackName = process.env.RAGEN_STACK_NAME?.trim() || 'ragen';
  const postgresVolume = `${stackName}-postgres-data`;

  try {
    const { stdout } = await execa(
      'docker',
      ['volume', 'ls', '--format', '{{.Name}}'],
      { timeout: 10_000 },
    );
    return stdout.split('\n').some((name) => name.trim() === postgresVolume);
  } catch {
    // Same reasoning as isDockerAvailable: an unreachable daemon is not a
    // reason to fail, the caller is about to find that out anyway.
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
