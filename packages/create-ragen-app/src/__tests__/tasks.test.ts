import { createServer, type Server } from 'node:net';

import { execa } from 'execa';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PII_PUBLISHED_PORTS,
  PUBLISHED_PORTS,
  RUSTFS_PUBLISHED_PORTS,
  busyPublishedPorts,
  composeUpCommand,
  publishedPortsFor,
  normalizeComposeProjectName,
  resolveComposeProjectName,
  generatePrismaClient,
  installDependencies,
  isDockerAvailable,
  migrateDatabase,
  seedDatabase,
  startDockerServices,
} from '../tasks';

vi.mock('execa', () => ({ execa: vi.fn() }));

const mockedExeca = vi.mocked(execa);

afterEach(() => {
  mockedExeca.mockReset();
});

describe('startDockerServices', () => {
  it('runs `docker compose up -d` in the given directory', async () => {
    mockedExeca.mockResolvedValueOnce({} as never);

    await startDockerServices({ cwd: '/tmp/app' });

    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', 'up', '-d'],
      {
        cwd: '/tmp/app',
        stdio: 'inherit',
      },
    );
  });

  it('adds a --profile per profile, before `up`', async () => {
    mockedExeca.mockResolvedValueOnce({} as never);

    await startDockerServices({ cwd: '/tmp/app', profiles: ['pii', 's3'] });

    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      ['compose', '--profile', 'pii', '--profile', 's3', 'up', '-d'],
      { cwd: '/tmp/app', stdio: 'inherit' },
    );
  });
});

describe('composeUpCommand', () => {
  it('is a plain `up` with no profile', () => {
    expect(composeUpCommand()).toBe('docker compose up -d');
  });

  it('names every profile the install chose, not just the first', () => {
    // Followed literally, a command missing `s3` starts a stack without the
    // object store `.env.local` was just pointed at.
    expect(composeUpCommand(['pii', 's3'])).toBe(
      'docker compose --profile pii --profile s3 up -d',
    );
  });
});

describe('publishedPortsFor', () => {
  it('is the default ports when no profile is chosen', () => {
    expect(publishedPortsFor([])).toEqual([...PUBLISHED_PORTS]);
  });

  it('adds each chosen profile’s ports', () => {
    expect(publishedPortsFor(['s3'])).toEqual([
      ...PUBLISHED_PORTS,
      ...RUSTFS_PUBLISHED_PORTS,
    ]);
    expect(publishedPortsFor(['pii', 's3'])).toEqual([
      ...PUBLISHED_PORTS,
      ...PII_PUBLISHED_PORTS,
      ...RUSTFS_PUBLISHED_PORTS,
    ]);
  });

  it('ignores a profile that publishes nothing it knows of', () => {
    expect(publishedPortsFor(['observability'])).toEqual([...PUBLISHED_PORTS]);
  });
});

describe('isDockerAvailable', () => {
  it('returns true when `docker info` succeeds', async () => {
    mockedExeca.mockResolvedValueOnce({} as never);
    expect(await isDockerAvailable()).toBe(true);
  });

  it('returns false when `docker info` fails', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('not found'));
    expect(await isDockerAvailable()).toBe(false);
  });
});

describe('installDependencies', () => {
  it('runs npm install in the given directory', async () => {
    mockedExeca.mockResolvedValueOnce({} as never);

    await installDependencies({ cwd: '/tmp/app' });

    expect(mockedExeca).toHaveBeenCalledWith('npm', ['install'], {
      cwd: '/tmp/app',
      stdio: 'inherit',
    });
  });
});

describe('generatePrismaClient', () => {
  it('runs the repo generate:types script', async () => {
    mockedExeca.mockResolvedValueOnce({} as never);

    await generatePrismaClient({ cwd: '/tmp/app' });

    expect(mockedExeca).toHaveBeenCalledWith('npm', ['run', 'generate:types'], {
      cwd: '/tmp/app',
      env: undefined,
      stdio: 'inherit',
    });
  });

  it('forwards the given env (e.g. DATABASE_URL) to execa', async () => {
    mockedExeca.mockResolvedValueOnce({} as never);
    const env = { DATABASE_URL: 'postgresql://test' };

    await generatePrismaClient({ cwd: '/tmp/app', env });

    expect(mockedExeca).toHaveBeenCalledWith('npm', ['run', 'generate:types'], {
      cwd: '/tmp/app',
      env,
      stdio: 'inherit',
    });
  });
});

describe('seedDatabase', () => {
  it('runs the repo db:seed script', async () => {
    mockedExeca.mockResolvedValueOnce({} as never);

    await seedDatabase({ cwd: '/tmp/app' });

    expect(mockedExeca).toHaveBeenCalledWith('npm', ['run', 'db:seed'], {
      cwd: '/tmp/app',
      stdio: 'inherit',
    });
  });
});

describe('migrateDatabase', () => {
  it('runs prisma migrate deploy once when it succeeds immediately', async () => {
    mockedExeca.mockResolvedValueOnce({} as never);

    await migrateDatabase({ cwd: '/tmp/app' }, { retries: 3, retryDelayMs: 0 });

    expect(mockedExeca).toHaveBeenCalledTimes(1);
    expect(mockedExeca).toHaveBeenCalledWith(
      'npx',
      ['prisma', 'migrate', 'deploy'],
      { cwd: '/tmp/app', env: undefined, stdio: 'inherit' },
    );
  });

  it('forwards the given env (e.g. DATABASE_URL) to execa', async () => {
    mockedExeca.mockResolvedValueOnce({} as never);
    const env = { DATABASE_URL: 'postgresql://test' };

    await migrateDatabase(
      { cwd: '/tmp/app', env },
      { retries: 3, retryDelayMs: 0 },
    );

    expect(mockedExeca).toHaveBeenCalledWith(
      'npx',
      ['prisma', 'migrate', 'deploy'],
      { cwd: '/tmp/app', env, stdio: 'inherit' },
    );
  });

  it('retries on failure and succeeds once Postgres is reachable', async () => {
    mockedExeca
      .mockRejectedValueOnce(new Error('connection refused'))
      .mockResolvedValueOnce({} as never);

    await migrateDatabase({ cwd: '/tmp/app' }, { retries: 3, retryDelayMs: 0 });

    expect(mockedExeca).toHaveBeenCalledTimes(2);
  });

  it('throws once every retry is exhausted', async () => {
    mockedExeca.mockRejectedValue(new Error('connection refused'));

    await expect(
      migrateDatabase({ cwd: '/tmp/app' }, { retries: 2, retryDelayMs: 0 }),
    ).rejects.toThrow(/failed after 2 attempts/);
    expect(mockedExeca).toHaveBeenCalledTimes(2);
  });
});

describe('busyPublishedPorts', () => {
  /**
   * Real sockets, not mocked ones. The thing worth testing here is whether an
   * occupied port is *recognised*, and every way of getting that wrong —
   * binding the wrong interface, treating a non-EADDRINUSE error as busy,
   * resolving before the probe closes — survives a mock of `node:net` intact.
   *
   * Every port is OS-assigned (`listen(0)`) rather than a number picked here.
   * A hardcoded port makes the test depend on what else happens to be running:
   * the "free" case fails if something holds it, and `occupy` rejects outright
   * if two of these files run at once — a red that says nothing about the code.
   */
  const listeners: Server[] = [];

  /** Binds an OS-assigned loopback port and returns it, still held. */
  async function occupyAnyPort(): Promise<number> {
    const server = createServer();
    listeners.push(server);
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error(`expected a TCP address, got ${String(address)}`));
          return;
        }
        resolve(address.port);
      });
    });
    return port;
  }

  /** An OS-assigned port that has been released — free as of this moment. */
  async function borrowFreePort(): Promise<number> {
    const port = await occupyAnyPort();
    await releaseAll();
    return port;
  }

  async function releaseAll(): Promise<void> {
    await Promise.all(
      listeners.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
          }),
      ),
    );
  }

  afterEach(releaseAll);

  it('reports nothing for ports no one is listening on', async () => {
    const [free, alsoFree] = [await borrowFreePort(), await borrowFreePort()];

    expect(
      await busyPublishedPorts([
        { service: 'a', variable: 'A_PORT', port: free },
        { service: 'b', variable: 'B_PORT', port: alsoFree },
      ]),
    ).toEqual([]);
  });

  it('reports exactly the occupied one, so the warning can name it', async () => {
    const free = await borrowFreePort();
    const taken = await occupyAnyPort();

    expect(
      await busyPublishedPorts([
        { service: 'taken', variable: 'TAKEN_PORT', port: taken },
        { service: 'free', variable: 'FREE_PORT', port: free },
      ]),
    ).toEqual([{ service: 'taken', variable: 'TAKEN_PORT', port: taken }]);
  });

  it('leaves the port free after probing it', async () => {
    // The probe binds to find out. If it did not release, running the wizard
    // twice — or the wizard then compose — would fail on a port it occupied
    // itself.
    const port = await borrowFreePort();

    await busyPublishedPorts([
      { service: 'probe', variable: 'PROBE_PORT', port },
    ]);

    await expect(occupyAnyPort()).resolves.toBeGreaterThan(0);
    await releaseAll();
    expect(
      await busyPublishedPorts([
        { service: 'probe', variable: 'PROBE_PORT', port },
      ]),
    ).toEqual([]);
  });

  it('defaults to the ports a plain `docker compose up` publishes', async () => {
    // Called with no argument by the wizard, so an empty default table would
    // silently check nothing.
    expect(PUBLISHED_PORTS.length).toBe(5);
    expect(PII_PUBLISHED_PORTS.length).toBe(2);
    expect(RUSTFS_PUBLISHED_PORTS.map(({ port }) => port)).toEqual([
      59000, 59001,
    ]);
  });
});

describe('normalizeComposeProjectName', () => {
  it.each([
    ['ragen-app', 'ragen-app'],
    ['My Ragen!', 'my-ragen'],
    ['.hidden', 'hidden'],
    ['2024_install', '2024_install'],
    ['Ragen AI (prod)', 'ragen-ai-prod'],
  ])('turns %o into %o', (raw, expected) => {
    // Compose accepts `[a-z0-9][a-z0-9_-]*` and validates *every* command, so
    // an unnormalized name would fail after the install had finished, in the
    // user's own `docker compose up`.
    expect(normalizeComposeProjectName(raw)).toBe(expected);
    expect(normalizeComposeProjectName(raw)).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
  });

  it.each(['', '---', '!!!'])('falls back to a usable name for %o', (raw) => {
    expect(normalizeComposeProjectName(raw)).toBe('ragen');
  });
});

describe('resolveComposeProjectName', () => {
  function composeLsReturns(
    projects: Array<{ Name: string; ConfigFiles: string }>,
  ): void {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify(projects),
    } as never);
  }

  it('keeps the directory name when nothing else claims it', async () => {
    // The readability given up with the pinned container names is not worth
    // giving up twice — a suffix only appears when it has to.
    composeLsReturns([
      { Name: 'something-else', ConfigFiles: '/other/docker-compose.yml' },
    ]);

    expect(await resolveComposeProjectName('/work/a/my-ragen')).toEqual({
      name: 'my-ragen',
      disambiguated: false,
    });
  });

  it('disambiguates when another directory of the same name holds the project', async () => {
    // The whole point: Compose derives the project from the basename, so
    // /work/a/ragen and /work/b/ragen are one project, one set of volumes, one
    // database — and a stopped first stack makes it silent.
    composeLsReturns([
      { Name: 'ragen', ConfigFiles: '/work/a/ragen/docker-compose.yml' },
    ]);

    const resolved = await resolveComposeProjectName('/work/b/ragen');

    expect(resolved.disambiguated).toBe(true);
    expect(resolved.name).toMatch(/^ragen-[0-9a-f]{6}$/);
    expect(resolved.takenBy).toBe('/work/a/ragen/docker-compose.yml');
  });

  it('is stable for a directory, so a re-run does not rename the stack', async () => {
    // A name derived from anything volatile would point the second run at
    // empty volumes, which is the failure this is preventing.
    composeLsReturns([
      { Name: 'ragen', ConfigFiles: '/work/a/ragen/docker-compose.yml' },
    ]);
    const first = await resolveComposeProjectName('/work/b/ragen');
    composeLsReturns([
      { Name: 'ragen', ConfigFiles: '/work/a/ragen/docker-compose.yml' },
    ]);
    const second = await resolveComposeProjectName('/work/b/ragen');

    expect(second.name).toBe(first.name);
  });

  it('leaves this install’s own project alone on a re-run', async () => {
    // Running the wizard again over an existing tree finds a project with this
    // name — its own. Renaming it there would abandon the volumes holding the
    // database it already migrated.
    composeLsReturns([
      { Name: 'ragen', ConfigFiles: '/work/b/ragen/docker-compose.yml' },
    ]);

    expect(await resolveComposeProjectName('/work/b/ragen')).toEqual({
      name: 'ragen',
      disambiguated: false,
    });
  });

  it('suffixes rather than guessing when docker cannot be asked', async () => {
    // The plain basename looked like the safe fallback and is not: a daemon
    // that cannot be reached still holds the volumes of every install made
    // before it stopped, and they collide the moment it starts. So this fails
    // in the visible direction — a less pretty name — rather than the silent
    // one, a second install opening the first one's database.
    mockedExeca.mockRejectedValueOnce(new Error('daemon not running'));

    const resolved = await resolveComposeProjectName('/work/a/ragen');

    expect(resolved.name).toMatch(/^ragen-[0-9a-f]{6}$/);
    expect(resolved.daemonUnreachable).toBe(true);
    // No `takenBy`: nothing was seen to collide with. The caller says a
    // different sentence for this case.
    expect(resolved.takenBy).toBeUndefined();
  });

  it('agrees with itself about a path, daemon or no daemon', async () => {
    // The suffix for a directory has to be the same one the collision path
    // produces, or the two branches would name the same install differently.
    composeLsReturns([
      { Name: 'ragen', ConfigFiles: '/elsewhere/ragen/docker-compose.yml' },
    ]);
    const seen = await resolveComposeProjectName('/work/a/ragen');
    mockedExeca.mockRejectedValueOnce(new Error('daemon not running'));
    const unseen = await resolveComposeProjectName('/work/a/ragen');

    expect(unseen.name).toBe(seen.name);
  });

  it.each([
    // The case a `startsWith(dir + '/')` prefix test got wrong: a sibling
    // whose name merely begins with ours is someone else's project.
    ['/work/ragen-app-2/docker-compose.yml', true],
    // And the case it got wrong in the other, destructive direction: a compose
    // file nested inside this install is still this install, and renaming its
    // project would abandon the volumes holding its database.
    ['/work/ragen-app/infra/compose.yml', false],
  ])(
    'treats a project whose config is at %s as a collision: %s',
    async (configFile, expectedCollision) => {
      composeLsReturns([{ Name: 'ragen-app', ConfigFiles: configFile }]);

      const resolved = await resolveComposeProjectName('/work/ragen-app');

      expect(resolved.disambiguated).toBe(expectedCollision);
    },
  );
});
