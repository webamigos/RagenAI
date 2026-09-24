import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { basename, isAbsolute, relative, resolve } from 'node:path';

import { execa } from 'execa';

import { PII_COMPOSE_PROFILE } from './pii-masking';
import { RUSTFS_COMPOSE_PROFILE } from './storage-provider';

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
 * Compose takes its project name from the **directory basename**, which is not
 * the same as being unique per install.
 *
 * Removing the pinned `container_name`/volume `name:` from docker-compose.yml
 * scopes every resource to the project, and that is what lets two checkouts
 * coexist. But `/work/a/ragen` and `/work/b/ragen` produce the same project
 * name, and therefore the same containers, volumes and network — the original
 * bug, narrowed to same-named directories rather than fixed. Worse than the
 * port collision, because a *stopped* first stack collides silently: no port
 * is held, nothing refuses, and the second install opens the first one's
 * database.
 *
 * So the name is decided here, at install time, and written to the new tree's
 * `.env` — which Compose reads from the project directory on every later
 * `docker compose` the user runs, with no flag to remember. `.env` is the
 * lowest-precedence file `scripts/load-root-env.mjs` reads and is gitignored,
 * and nothing in the apps reads `COMPOSE_PROJECT_NAME`, so it cannot collide
 * with the install's own configuration.
 *
 * The basename is kept whenever it is free, because the readability given up
 * with the pinned names is worth not giving up twice. A suffix appears only
 * when this daemon already runs a project of that name from somewhere else.
 */
export interface ComposeProjectName {
  name: string;
  /** True when the plain basename was taken and a suffix was added. */
  disambiguated: boolean;
  /** The compose file of the project that took it, for the message. */
  takenBy?: string;
  /**
   * True when the suffix was added because Docker could not be asked, rather
   * than because a collision was seen. A different sentence to the reader:
   * nothing is wrong, and the name is cautious rather than forced.
   */
  daemonUnreachable?: boolean;
}

/**
 * Compose accepts `[a-z0-9][a-z0-9_-]*`. A directory called `My Ragen!` or
 * `.ragen` is perfectly legal and would otherwise make every compose command
 * fail with a validation error after the install had finished.
 */
export function normalizeComposeProjectName(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/-+$/, '');
  return cleaned || 'ragen';
}

/** Six hex characters of the absolute path — stable for this directory. */
function pathSuffix(absoluteDir: string): string {
  return createHash('sha256').update(absoluteDir).digest('hex').slice(0, 6);
}

/**
 * Whether a compose file belongs to the install in `absoluteDir`.
 *
 * `relative()` rather than a `startsWith(dir + '/')` prefix test, for two
 * reasons: on Windows `resolve()` returns backslashes, so a forward-slash
 * prefix never matches and every re-run would look like a collision — which
 * renames the stack and abandons its volumes, the worst outcome available
 * here. And a prefix test is true for `/work/ragen-app-2` against
 * `/work/ragen-app` unless the separator is appended exactly right.
 *
 * A file *inside* the directory counts, at any depth: `-f infra/compose.yml`
 * is a legitimate way to run this stack, and treating it as someone else's
 * project is the same destructive mistake.
 */
function isInsideDirectory(file: string, absoluteDir: string): boolean {
  const path = relative(absoluteDir, resolve(file.trim()));
  // `..` means outside; an absolute result means a different Windows drive,
  // where "inside" is not a question that has a yes.
  return !path.startsWith('..') && !isAbsolute(path);
}

export async function resolveComposeProjectName(
  targetDir: string,
): Promise<ComposeProjectName> {
  const absoluteDir = resolve(targetDir);
  const base = normalizeComposeProjectName(basename(absoluteDir));
  const suffixed = `${base}-${pathSuffix(absoluteDir)}`;

  let projects: Array<{ Name?: string; ConfigFiles?: string }> = [];
  try {
    const { stdout } = await execa(
      'docker',
      ['compose', 'ls', '--all', '--format', 'json'],
      { timeout: 10_000 },
    );
    projects = JSON.parse(stdout) as typeof projects;
  } catch {
    // An unreachable daemon, or a Compose too old for `ls --format json`.
    //
    // The plain basename is *not* the safe answer here, which is what it first
    // looked like. A daemon that cannot be reached still holds the volumes of
    // every install made before it stopped, and they collide as soon as it
    // starts — so falling back to the basename fails in the silent, expensive
    // direction: a second install quietly opening the first one's database.
    // The suffix fails in the visible, cheap one: a less pretty name in
    // `docker ps`.
    return { name: suffixed, disambiguated: true, daemonUnreachable: true };
  }

  // A project whose compose files live under *this* directory is this install
  // — a re-run of the wizard over an existing tree — and must keep its name,
  // or the second run would point at empty volumes.
  const collision = projects.find(
    (project) =>
      project.Name === base &&
      !(project.ConfigFiles ?? '')
        .split(',')
        .some((file) => isInsideDirectory(file, absoluteDir)),
  );

  if (!collision) {
    return { name: base, disambiguated: false };
  }

  return {
    name: suffixed,
    disambiguated: true,
    takenBy: collision.ConfigFiles?.split(',')[0]?.trim(),
  };
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

/**
 * The two more, behind the `s3` profile, that only a RustFS install starts:
 * the S3 API the apps talk to, and the web console.
 */
export const RUSTFS_PUBLISHED_PORTS = [
  { service: 'RustFS (S3 API)', variable: 'RUSTFS_PORT', port: 59000 },
  {
    service: 'RustFS console',
    variable: 'RUSTFS_CONSOLE_PORT',
    port: 59001,
  },
] as const;

export interface PublishedPort {
  service: string;
  variable: string;
  port: number;
}

/**
 * The extra ports each optional profile publishes, keyed by profile name.
 *
 * One table rather than a branch per profile, because the port probe, the
 * recovery command and the "update .env.local" hint all have to agree on what
 * a profile starts — and with two profiles the branch-per-profile version was
 * already printing a command that named only one of them.
 */
export const PROFILE_PUBLISHED_PORTS: Record<string, readonly PublishedPort[]> =
  {
    [PII_COMPOSE_PROFILE]: PII_PUBLISHED_PORTS,
    [RUSTFS_COMPOSE_PROFILE]: RUSTFS_PUBLISHED_PORTS,
  };

/** Every port a `docker compose up` with these profiles publishes. */
export function publishedPortsFor(
  profiles: readonly string[],
): PublishedPort[] {
  return [
    ...PUBLISHED_PORTS,
    ...profiles.flatMap((profile) => PROFILE_PUBLISHED_PORTS[profile] ?? []),
  ];
}

/**
 * The `docker compose up` a person should type to get the stack this install
 * configured, profiles included.
 *
 * Built from the same list `startDockerServices` is given, so a printed
 * command cannot drift from an executed one. A command that drops a profile
 * starts a stack without the services whose URLs were just written to
 * `.env.local` — the half-configuration the profiles exist to prevent, only
 * printed instead of executed.
 */
export function composeUpCommand(profiles: readonly string[] = []): string {
  return [
    'docker compose',
    ...profiles.map((profile) => `--profile ${profile}`),
    'up -d',
  ].join(' ');
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
 * RustFS is the same shape behind `s3` — the apps would be configured for an
 * object store on 59000 that nothing started, and fail at the first upload.
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
