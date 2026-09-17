import { createServer, type Server } from 'node:net';

import { execa } from 'execa';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PII_PUBLISHED_PORTS,
  PUBLISHED_PORTS,
  busyPublishedPorts,
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
   * A real socket, not a mocked one. The thing worth testing here is whether
   * an occupied port is *recognised*, and every way of getting that wrong —
   * binding the wrong interface, treating a non-EADDRINUSE error as busy,
   * resolving before the probe closes — survives a mock of `node:net` intact.
   */
  const listeners: Server[] = [];

  async function occupy(port: number): Promise<void> {
    const server = createServer();
    listeners.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  }

  afterEach(async () => {
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
  });

  it('reports nothing for ports no one is listening on', async () => {
    // Two ports in the ephemeral range, chosen to be uninteresting to anything
    // this repository runs.
    expect(
      await busyPublishedPorts([
        { service: 'a', variable: 'A_PORT', port: 59_231 },
        { service: 'b', variable: 'B_PORT', port: 59_232 },
      ]),
    ).toEqual([]);
  });

  it('reports exactly the occupied one, so the warning can name it', async () => {
    await occupy(59_233);

    expect(
      await busyPublishedPorts([
        { service: 'taken', variable: 'TAKEN_PORT', port: 59_233 },
        { service: 'free', variable: 'FREE_PORT', port: 59_234 },
      ]),
    ).toEqual([{ service: 'taken', variable: 'TAKEN_PORT', port: 59_233 }]);
  });

  it('leaves the port free after probing it', async () => {
    // The probe binds to find out. If it did not release, running the wizard
    // twice — or the wizard then compose — would fail on a port it occupied
    // itself.
    await busyPublishedPorts([
      { service: 'probe', variable: 'PROBE_PORT', port: 59_235 },
    ]);

    await expect(occupy(59_235)).resolves.toBeUndefined();
  });

  it('defaults to the ports a plain `docker compose up` publishes', async () => {
    // Called with no argument by the wizard, so an empty default table would
    // silently check nothing.
    expect(PUBLISHED_PORTS.length).toBe(5);
    expect(PII_PUBLISHED_PORTS.length).toBe(2);
  });
});
