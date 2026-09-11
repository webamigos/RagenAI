import { execa } from 'execa';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
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
