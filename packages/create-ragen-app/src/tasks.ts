import { createServer } from 'node:net';

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
 * Every host port a default `docker compose up` publishes, with the variable
 * that moves it. The order is the order the warning prints them in.
 *
 * Defaults are duplicated from docker-compose.yml rather than parsed out of
 * it, because this runs *before* the repository is cloned — there is no file
 * to read yet. `ports-agree-with-compose.test.ts` holds the two in step.
 */
export const PUBLISHED_PORTS = [
  { service: 'Postgres', variable: 'POSTGRES_PORT', port: 55432 },
  { service: 'Qdrant', variable: 'QDRANT_PORT', port: 6333 },
  { service: 'Qdrant (gRPC)', variable: 'QDRANT_GRPC_PORT', port: 6334 },
  { service: 'Docling', variable: 'DOCLING_PORT', port: 5001 },
  { service: 'Redis', variable: 'REDIS_PORT', port: 56379 },
] as const;

/** The two more, behind the `pii` profile, that only a masking install starts. */
export const PII_PUBLISHED_PORTS = [
  {
    service: 'Presidio analyzer',
    variable: 'PRESIDIO_ANALYZER_PORT',
    port: 5002,
  },
  {
    service: 'Presidio anonymizer',
    variable: 'PRESIDIO_ANONYMIZER_PORT',
    port: 5003,
  },
] as const;

export interface PublishedPort {
  service: string;
  variable: string;
  port: number;
}

/**
 * Which of these host ports something is already listening on.
 *
 * This replaces a check for the volume `ragen-postgres-data`. That volume name
 * was pinned in docker-compose.yml, which is what made a second install share
 * the first one's database — and removing the pin removed the sharing, so the
 * old check now answers a question nobody is asking and would answer "clear"
 * for every install made after the change. A guard that quietly stops firing
 * is worse than no guard.
 *
 * Ports are what is genuinely left: Compose prefixes names per project, and
 * prefixes nothing about a published port, so two stacks still collide on
 * 55432. Binding is also a better probe than asking Docker — it sees a native
 * Postgres on the port as well, which is the other way this install ends up
 * talking to a database it did not start.
 */
export async function busyPublishedPorts(
  candidates: readonly PublishedPort[] = PUBLISHED_PORTS,
): Promise<PublishedPort[]> {
  const results = await Promise.all(
    candidates.map(async (candidate) =>
      (await isPortInUse(candidate.port)) ? candidate : undefined,
    ),
  );
  return results.filter((candidate): candidate is PublishedPort =>
    Boolean(candidate),
  );
}

/**
 * Loopback only, because that is where docker-compose.yml publishes
 * (`RAGEN_BIND_ADDR` defaults to 127.0.0.1). Anything other than EADDRINUSE —
 * a permission error, a system without IPv4 loopback — reports "free": the
 * cost of a missed warning is a compose error the caller then reads, and the
 * cost of a false one is telling someone their machine is occupied when it is
 * not.
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', (error: NodeJS.ErrnoException) => {
      resolve(error.code === 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(false);
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * `profiles` names compose profiles to add to the default set.
 *
 * Without it, choosing PII masking would write the two Presidio URLs and start
 * nothing behind them: those services sit behind compose's `pii` profile, so a
 * plain `up -d` skips them and the app would point at containers nobody ran.
 */
export async function startDockerServices({
  cwd,
  profiles = [],
}: RunOptions & { profiles?: string[] }): Promise<void> {
  const args = profiles.flatMap((profile) => ['--profile', profile]);
  await execa('docker', ['compose', ...args, 'up', '-d'], {
    cwd,
    stdio: 'inherit',
  });
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
