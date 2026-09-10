import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';

import * as clack from '@clack/prompts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cloneRagenApp } from '../clone';
import { run } from '../cli';
import {
  generatePrismaClient,
  migrateDatabase,
  seedDatabase,
  startDockerServices,
} from '../tasks';

const { CANCEL_TOKEN } = vi.hoisted(() => ({ CANCEL_TOKEN: Symbol('cancel') }));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: { warn: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
  text: vi.fn(),
  select: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  isCancel: (value: unknown) => value === CANCEL_TOKEN,
}));

vi.mock('../clone', () => ({
  cloneRagenApp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../tasks', () => ({
  isDockerAvailable: vi.fn().mockResolvedValue(true),
  startDockerServices: vi.fn().mockResolvedValue(undefined),
  installDependencies: vi.fn().mockResolvedValue(undefined),
  generatePrismaClient: vi.fn().mockResolvedValue(undefined),
  migrateDatabase: vi.fn().mockResolvedValue(undefined),
  seedDatabase: vi.fn().mockResolvedValue(undefined),
}));

const ROOT_TEMPLATE = [
  'SECRET_KEY=',
  'BETTER_AUTH_SECRET=',
  'PUBLIC_LINK_TOKEN_SECRET=',
  'SESSION_AUTH_SECRET=',
  'WORKER_SECRET_KEY=placeholder',
  'INTERNAL_API_SECRET=',
  'DATABASE_URL=postgresql://old',
].join('\n');

const ROOT_TEMPLATE_MISSING_DATABASE_URL = ROOT_TEMPLATE.split('\n')
  .filter((line) => !line.startsWith('DATABASE_URL='))
  .join('\n');

const ADMIN_TEMPLATE = [
  'BETTER_AUTH_SECRET=',
  'DATABASE_URL=postgresql://old',
  'INTERNAL_API_SECRET=',
].join('\n');

function mockTemplates(rootTemplate = ROOT_TEMPLATE): void {
  vi.mocked(readFileSync).mockImplementation((path) => {
    const p = String(path);
    if (p.endsWith('apps/admin/.env.example')) {
      return ADMIN_TEMPLATE;
    }
    if (p.endsWith('.env.example')) {
      return rootTemplate;
    }
    if (p.endsWith('config.yaml')) {
      return 'model_list:\n';
    }
    throw new Error(`unexpected readFileSync path in test: ${p}`);
  });
}

beforeEach(() => {
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(readdirSync).mockReturnValue([] as never);
  vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as never);
  mockTemplates();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('run', () => {
  it('aborts without writing files or starting Docker when the LLM prompt is cancelled', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce(CANCEL_TOKEN as never);

    await run(['/tmp/ragen-test']);

    expect(cloneRagenApp).toHaveBeenCalledOnce();
    expect(writeFileSync).not.toHaveBeenCalled();
    expect(startDockerServices).not.toHaveBeenCalled();
    expect(clack.cancel).toHaveBeenCalledWith('Cancelled.');
  });

  it('aborts before Docker/install when a manifest key has no matching template line', async () => {
    mockTemplates(ROOT_TEMPLATE_MISSING_DATABASE_URL);
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);

    await run(['/tmp/ragen-test']);

    // Still writes what it could match, so the user has something to fix by hand.
    expect(writeFileSync).toHaveBeenCalled();
    expect(startDockerServices).not.toHaveBeenCalled();
    expect(clack.cancel).toHaveBeenCalledWith(
      expect.stringContaining('DATABASE_URL'),
    );
  });

  it('rejects an existing target that is a file, not a directory, without crashing', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as never);

    await run(['/tmp/ragen-test']);

    expect(clack.cancel).toHaveBeenCalledWith(
      expect.stringContaining('not a directory'),
    );
    expect(cloneRagenApp).not.toHaveBeenCalled();
  });

  it('passes the generated DATABASE_URL through to prisma generate/migrate/seed', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);
    vi.mocked(clack.confirm).mockResolvedValue(true as never);

    await run(['/tmp/ragen-test']);

    const expectedEnv = expect.objectContaining({
      DATABASE_URL: 'postgresql://postgres:pass123@localhost:55432/ragen',
    });
    expect(generatePrismaClient).toHaveBeenCalledWith({
      cwd: '/tmp/ragen-test',
      env: expectedEnv,
    });
    expect(migrateDatabase).toHaveBeenCalledWith({
      cwd: '/tmp/ragen-test',
      env: expectedEnv,
    });
    expect(seedDatabase).toHaveBeenCalledWith({
      cwd: '/tmp/ragen-test',
      env: expectedEnv,
    });
  });
});
