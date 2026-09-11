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
  ragenStackVolumeExists,
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
  note: vi.fn(),
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
  ragenStackVolumeExists: vi.fn().mockResolvedValue(false),
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
  '# LITELLM_MASTER_KEY=',
  'DEFAULT_MODEL_PROVIDER=litellm',
  'DEFAULT_MODEL=gemini-3-flash-preview',
  'REPHRASE_MODEL=gemini-2.5-flash',
  'EMBEDDINGS_MODEL=bge-multilingual-gemma2',
  '# VECTOR_SIZE=3584',
  'OPENAI_API_KEY=',
  'ANTHROPIC_API_KEY=',
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

  it('leaves written instructions when the user declines to paste a key', async () => {
    // Refusing to type a provider key into someone else's CLI is reasonable.
    // What must not happen is being left with a broken install and a
    // one-line warning that scrolls away behind a docker build.
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test']);

    const guide = vi
      .mocked(writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('SETUP-LLM.md'));

    expect(guide, 'expected SETUP-LLM.md to be written').toBeDefined();

    const contents = String(guide?.[1]);
    expect(contents).toContain('OPENAI_API_KEY');
    expect(contents).toContain('EMBEDDINGS_MODEL=text-embedding-3-small');
    expect(contents).toContain('VECTOR_SIZE=1536');
    expect(contents).toContain('model_list');
    expect(contents).toContain('docker compose restart litellm');
    expect(clack.note).toHaveBeenCalled();
  });

  it('writes a chat model and an embedding model into the LiteLLM config', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('openai' as never);
    vi.mocked(clack.password).mockResolvedValueOnce('sk-test' as never);
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test']);

    const config = vi
      .mocked(writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('config.yaml'));

    expect(String(config?.[1])).toContain('model_name: gpt-4o-mini');
    // Without this one the knowledge base 404s on a model the install has no
    // credentials for — the shipped default is Scaleway's.
    expect(String(config?.[1])).toContain('model_name: text-embedding-3-small');
  });

  it('points the rephrase model at the provider that was just configured', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('openai' as never);
    vi.mocked(clack.password).mockResolvedValueOnce('sk-test' as never);
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test']);

    const rootEnv = vi
      .mocked(writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('/.env.local'));

    expect(String(rootEnv?.[1])).toContain('REPHRASE_MODEL=gpt-4o-mini');
    expect(String(rootEnv?.[1])).toContain(
      'LITELLM_MASTER_KEY=sk-litellm-dev-key',
    );
  });

  it("warns before a second install silently shares the first one's data", async () => {
    vi.mocked(ragenStackVolumeExists).mockResolvedValueOnce(true);
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test']);

    expect(clack.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('RAGEN_STACK_NAME'),
    );
  });

  it('takes the key from the environment when --provider is given', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-from-env');
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test', '--provider=openai']);

    // No prompt at all: this path exists for people who will not type a key
    // into a CLI, and for CI, which cannot answer one.
    expect(clack.select).not.toHaveBeenCalled();
    expect(clack.password).not.toHaveBeenCalled();

    const rootEnv = vi
      .mocked(writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('/.env.local'));
    expect(String(rootEnv?.[1])).toContain('OPENAI_API_KEY=sk-from-env');
    expect(String(rootEnv?.[1])).toContain('DEFAULT_MODEL=gpt-4o-mini');
  });

  it('stops when --provider names a variable that is not set', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test', '--provider=openai']);

    // Asking for a provider and getting a silently unconfigured install is
    // the wrong answer to a mistyped variable name.
    expect(clack.cancel).toHaveBeenCalledWith(
      expect.stringContaining('OPENAI_API_KEY'),
    );
    expect(startDockerServices).not.toHaveBeenCalled();
  });

  it('reports completion so a caller can trust the exit code', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await expect(run(['/tmp/ragen-test'])).resolves.toBe(true);
  });

  it.each([
    [
      'a target that already has files in it',
      () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(readdirSync).mockReturnValue(['something'] as never);
      },
    ],
    [
      'a template missing a key the manifest writes',
      () => mockTemplates(ROOT_TEMPLATE_MISSING_DATABASE_URL),
    ],
  ])('reports failure for %s', async (_case, arrange) => {
    // An aborted install used to resolve into a zero exit code, so a shell
    // `&&`, a Dockerfile or a CI job read it as success.
    arrange();
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);

    await expect(run(['/tmp/ragen-test'])).resolves.toBe(false);
  });
});
