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
import { REQUIRED_NODE_VERSION, parseNodeVersion } from '../node-version';
import {
  busyPublishedPorts,
  generatePrismaClient,
  migrateDatabase,
  resolveComposeProjectName,
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
  log: { warn: vi.fn(), info: vi.fn() },
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

vi.mock('../tasks', async (importOriginal) => ({
  // The port tables are data the warning formats, not behaviour to stub — and
  // a mock that forgot them would make `cli.ts` iterate `undefined`.
  ...(await importOriginal<typeof import('../tasks')>()),
  isDockerAvailable: vi.fn().mockResolvedValue(true),
  busyPublishedPorts: vi.fn().mockResolvedValue([]),
  // Stubbed rather than inherited: the real one shells out to `docker compose
  // ls`, which made every test in this file wait on a daemon.
  resolveComposeProjectName: vi
    .fn()
    .mockResolvedValue({ name: 'ragen-test', disambiguated: false }),
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
  // The installer pins the proxy: LLM_GATEWAY defaults to `native`, which a
  // scaffolded install has no provider credentials for.
  '# LLM_GATEWAY=native',
  'DEFAULT_MODEL=gemini-3-flash-preview',
  'REPHRASE_MODEL=gemini-2.5-flash',
  'EMBEDDINGS_MODEL=bge-multilingual-gemma2',
  '# VECTOR_SIZE=3584',
  'OPENAI_API_KEY=',
  'ANTHROPIC_API_KEY=',
  // The storage and encryption prompts write these. A template without them
  // makes `applyEnvOverrides` report missing keys and the install abort, which
  // is what the real `.env.example` is held to by
  // `tests/architecture/create-ragen-app-knows-the-provider-seams.test.ts`.
  'STORAGE_PROVIDER=local',
  '# S3_BUCKET_NAME=',
  '# S3_REGION=',
  '# S3_ACCESS_KEY_ID=',
  '# S3_SECRET_ACCESS_KEY=',
  '# S3_ENDPOINT_URL=',
  '# S3_FORCE_PATH_STYLE=',
  '# ENCRYPTION_PROVIDER=',
  '# ENCRYPTION_MASTER_KEY=',
  '# SCW_KEY_MANAGER_KEY_ID=',
  '# SCW_API_KEY=',
  '# AWS_KMS_KEY_ID=',
  // The worker-runtime prompt writes these. Same reasoning as the two above:
  // a template without them makes the install abort on missing keys. Both
  // runtime variables are here because the wizard writes the one its answer
  // needs — `REDIS_URL` under BullMQ, the address under Temporal.
  // The PII prompt writes these when it is answered yes. Commented out in the
  // real `.env.example`, which is what "off unless asked for" looks like on
  // disk — `applyEnvOverrides` uncomments a line it is given a value for.
  '# PRESIDIO_ANALYZER_URL=',
  '# PRESIDIO_ANONYMIZER_URL=',
  'WORKER_RUNTIME=bullmq',
  'REDIS_URL=redis://localhost:56379',
  'WORKER_CONCURRENCY=',
  'TEMPORAL_SERVER_ADDRESS=',
  '# WORKER_ADMIN_PORT=',
  '# WORKER_ADMIN_USER=',
  '# WORKER_ADMIN_PASSWORD=',
].join('\n');

const ROOT_TEMPLATE_MISSING_DATABASE_URL = ROOT_TEMPLATE.split('\n')
  .filter((line) => !line.startsWith('DATABASE_URL='))
  .join('\n');

const ADMIN_TEMPLATE = [
  'BETTER_AUTH_SECRET=',
  'DATABASE_URL=postgresql://old',
  'INTERNAL_API_SECRET=',
].join('\n');

/**
 * Only the region the wizard rewrites. The real file carries the rest of the
 * groups, none of which the installer touches.
 */
const CONFIG_TEMPLATE = [
  "import { defineConfig } from '@ragenai/env';",
  '',
  'export default defineConfig({',
  '  // create-ragen-app:providers',
  '  storage: {',
  "    provider: 'local',",
  '    path: process.env.STORAGE_LOCAL_PATH,',
  '  },',
  '  // create-ragen-app:providers:end',
  '});',
  '',
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
    if (p.endsWith('ragen.config.ts')) {
      return CONFIG_TEMPLATE;
    }
    throw new Error(`unexpected readFileSync path in test: ${p}`);
  });
}

/**
 * `run()` refuses to scaffold on a Node below `REQUIRED_NODE_VERSION`, reading
 * the real `process.version` — so on a developer machine running Node 22 every
 * test in this file aborted at the gate before reaching the flow it was
 * written for, and the whole suite failed with twelve assertions about
 * functions that were never called. It passed in CI only because CI runs the
 * supported major.
 *
 * A unit test for the wizard's flow must not depend on the Node the runner
 * happens to be on. The version is pinned here to a supported one; the gate
 * itself is covered by `node-version.test.ts`, which feeds it versions
 * directly, and the `on an unsupported Node` block below pins an old one
 * through the same helper.
 */
const REAL_NODE_VERSION = process.version;

function pinNodeVersion(version: string): void {
  Object.defineProperty(process, 'version', {
    value: version,
    configurable: true,
    writable: false,
  });
}

beforeEach(() => {
  pinNodeVersion(`v${REQUIRED_NODE_VERSION}`);
  // `mockReset` first: `clearMocks: true` clears recorded calls but does *not*
  // drain the `mockResolvedValueOnce` queue, so an answer a test queued and
  // never reached — the cases that abort before any prompt — leaked into the
  // next test and was consumed by the wrong question.
  //
  // Then a default, because the storage and encryption prompts come after the
  // LLM one and every test below queues an answer only for the prompt it is
  // about. These two answer themselves with what a fresh install takes.
  vi.mocked(clack.select).mockReset();
  vi.mocked(clack.select).mockResolvedValue('local' as never);
  vi.mocked(existsSync).mockReturnValue(false);
  vi.mocked(readdirSync).mockReturnValue([] as never);
  vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as never);
  mockTemplates();
});

afterEach(() => {
  pinNodeVersion(REAL_NODE_VERSION);
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
    expect(contents).toContain('routes:');
    expect(contents).toContain('provider: openai');
    expect(clack.note).toHaveBeenCalled();
  });

  /**
   * A scaffolded install takes the same path every other deployment does:
   * `native`, with a route table naming the one provider whose key the user
   * actually gave us. The table shipped in the repository routes to Azure,
   * Bedrock, Vertex and Scaleway, so leaving it in place would make every
   * model call fail on the first question while the scaffold reported success.
   */
  it('scaffolds a direct install: native, with a route table it can serve', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('openai' as never);
    vi.mocked(clack.password).mockResolvedValueOnce('sk-test' as never);
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test']);

    const written = vi.mocked(writeFileSync).mock.calls;

    const rootEnv = written.find(([path]) =>
      String(path).endsWith('/.env.local'),
    );
    expect(String(rootEnv?.[1])).toContain('LLM_GATEWAY=native');

    const routes = written.find(([path]) =>
      String(path).endsWith('infra/llm-gateway/routes.yaml'),
    );
    expect(routes, 'expected a route table to be written').toBeDefined();
    expect(String(routes?.[1])).toContain('gpt-4o-mini:\n    provider: openai');
    expect(String(routes?.[1])).toContain(
      'text-embedding-3-small:\n    provider: openai',
    );
    // Nothing from the shipped table survives: those are routes to a 401.
    expect(String(routes?.[1])).not.toContain('vertex');
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
  });

  /**
   * What a fresh install is now: BullMQ on the Redis the compose file already
   * runs. The `REDIS_URL` line is the load-bearing one — since #1224 apps/web
   * and apps/api validate it at boot, so a scaffold that picked the runtime
   * and not its address would hand someone an install that refuses to start.
   */
  it('scaffolds a BullMQ install, with the Redis url the producers check at boot', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-from-env');
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test', '--provider=openai']);

    const rootEnv = vi
      .mocked(writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('/.env.local'));

    expect(String(rootEnv?.[1])).toContain('WORKER_RUNTIME=bullmq');
    expect(String(rootEnv?.[1])).toContain('REDIS_URL=redis://localhost:56379');
    // Unattended answers the shipped default rather than asking, so nothing
    // above prompted for it.
    expect(clack.select).not.toHaveBeenCalled();
  });

  /**
   * Choosing Temporal is choosing a server this install does not start (ADR-44
   * took it out of the compose file), so the wizard asks where it is rather
   * than writing `localhost:7233` on the operator's behalf — an address that is
   * right on a laptop and silent everywhere else.
   */
  it('asks where Temporal is when Temporal is chosen', async () => {
    vi.mocked(clack.select)
      .mockResolvedValueOnce('skip' as never)
      .mockResolvedValueOnce('local' as never)
      .mockResolvedValueOnce('local' as never)
      .mockResolvedValueOnce('temporal' as never);
    vi.mocked(clack.text).mockResolvedValueOnce(
      'temporal.internal:7233' as never,
    );
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test']);

    const rootEnv = vi
      .mocked(writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('/.env.local'));

    expect(String(rootEnv?.[1])).toContain('WORKER_RUNTIME=temporal');
    expect(String(rootEnv?.[1])).toContain(
      'TEMPORAL_SERVER_ADDRESS=temporal.internal:7233',
    );
    expect(clack.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('docker-compose.yml'),
    );
  });

  it('warns, before starting anything, about a port something else already holds', async () => {
    // Containers and volumes are Compose's to scope now, so the collision that
    // is left is a host port — and the consequence is the same one the old
    // volume warning was about: DATABASE_URL pointing at a database this
    // install did not create.
    vi.mocked(busyPublishedPorts).mockResolvedValueOnce([
      { service: 'Postgres', variable: 'POSTGRES_PORT', port: 55432 },
    ]);
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test']);

    const warning = vi
      .mocked(clack.log.warn)
      .mock.calls.map(([message]) => String(message))
      .find((message) => message.includes('POSTGRES_PORT'));

    expect(warning, 'no warning named the busy port').toBeDefined();
    // The port that is actually taken, and a free one to move it to — not a
    // generic "check your ports".
    expect(warning).toContain('55432');
    expect(warning).toContain('POSTGRES_PORT=55532');
    // And it fires before the stack starts, or it is advice after the fact.
    expect(startDockerServices).not.toHaveBeenCalled();
  });

  it('says nothing when every published port is free', async () => {
    // The old check read a volume name that this change stopped creating, so
    // it would have answered "clear" forever. A warning that cannot fire and a
    // warning that always fires are the same bug.
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test']);

    const warnings = vi
      .mocked(clack.log.warn)
      .mock.calls.map(([message]) => String(message));

    expect(
      warnings.some((message) => message.includes('already listening')),
    ).toBe(false);
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

  it('pins the Compose project name in .env, so a later `docker compose up` agrees', async () => {
    // Not `.env.local`: Compose reads `.env` from the project directory on its
    // own, which is what makes the name survive this process exiting. A name
    // set only in the installer's environment would scope the stack it starts
    // and nothing the user runs afterwards.
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test']);

    const dotEnv = vi
      .mocked(writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('/.env'));

    expect(dotEnv, 'no .env was written').toBeDefined();
    expect(String(dotEnv?.[1])).toContain('COMPOSE_PROJECT_NAME=ragen-test');
  });

  it('says so when the directory name was already taken by another project', async () => {
    // The silent half of the collision: Compose names a project after its
    // directory, so /work/a/ragen and /work/b/ragen are one project. A
    // *stopped* first stack holds no port, so the port warning cannot see it
    // and the second install just opens the first one's database.
    vi.mocked(resolveComposeProjectName).mockResolvedValueOnce({
      name: 'ragen-a1b2c3',
      disambiguated: true,
      takenBy: '/work/a/ragen/docker-compose.yml',
    });
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);
    vi.mocked(clack.confirm).mockResolvedValue(false as never);

    await run(['/tmp/ragen-test']);

    const dotEnv = vi
      .mocked(writeFileSync)
      .mock.calls.find(([path]) => String(path).endsWith('/.env'));
    expect(String(dotEnv?.[1])).toContain('COMPOSE_PROJECT_NAME=ragen-a1b2c3');

    const warning = vi
      .mocked(clack.log.warn)
      .mock.calls.map(([message]) => String(message))
      .find((message) => message.includes('ragen-a1b2c3'));

    expect(warning, 'the disambiguation was silent').toBeDefined();
    // Name the project it would have collided with, or the warning is a
    // mystery about someone else's machine.
    expect(warning).toContain('/work/a/ragen/docker-compose.yml');
  });

  describe('on an unsupported Node', () => {
    /*
     * Derived from the requirement rather than hardcoded, so raising
     * `REQUIRED_NODE_VERSION` cannot quietly turn these into tests of a
     * supported version. `beforeEach` pins a supported one back for every
     * other test in the file, so nothing here needs restoring.
     *
     * One *patch* below the floor, not one major: that is the shape of the
     * failure this guards. A caller on the floor's own major reads a refusal
     * naming "Node 24" as a bug in the wizard, which is why the message names
     * the full version and these assertions check for it.
     */
    const FLOOR = parseNodeVersion(REQUIRED_NODE_VERSION);
    if (!FLOOR) {
      throw new Error(
        `REQUIRED_NODE_VERSION is unparseable: ${REQUIRED_NODE_VERSION}`,
      );
    }
    const TOO_OLD =
      FLOOR.patch > 0
        ? `v${FLOOR.major}.${FLOOR.minor}.${FLOOR.patch - 1}`
        : `v${FLOOR.major}.${FLOOR.minor - 1}.0`;

    it('refuses before cloning anything', async () => {
      pinNodeVersion(TOO_OLD);

      await expect(run(['/tmp/ragen-test'])).resolves.toBe(false);

      // The whole point of checking first: the failure should cost nothing.
      expect(cloneRagenApp).not.toHaveBeenCalled();
      expect(writeFileSync).not.toHaveBeenCalled();
      expect(clack.cancel).toHaveBeenCalledWith(
        expect.stringContaining(REQUIRED_NODE_VERSION),
      );
    });

    it('is not something --yes can wave through', async () => {
      // --yes means "accept the defaults", not "ignore a requirement".
      pinNodeVersion(TOO_OLD);

      await expect(run(['/tmp/ragen-test', '--yes'])).resolves.toBe(false);
      expect(cloneRagenApp).not.toHaveBeenCalled();
    });

    it('warns and continues when --skip-install means it runs nothing', async () => {
      pinNodeVersion(TOO_OLD);
      vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);

      await expect(
        run(['/tmp/ragen-test', '--skip-docker', '--skip-install']),
      ).resolves.toBe(true);

      expect(cloneRagenApp).toHaveBeenCalled();
      expect(clack.log.warn).toHaveBeenCalledWith(
        expect.stringContaining(REQUIRED_NODE_VERSION),
      );
    });
  });
});

describe('a docker start that fails', () => {
  /**
   * The one step whose failure must not abort the install.
   *
   * Every other step here stops, because carrying on would leave a tree that
   * fails later somewhere that does not point back. This one is different: the
   * files are already written and correct, and the usual cause is the conflict
   * the warning above predicts — another stack holding these host ports.
   * Aborting leaves a complete install, a raw `ExecaError` and no next step.
   */
  it('warns and carries on instead of cancelling the install', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);
    vi.mocked(clack.confirm).mockResolvedValue(true as never);
    vi.mocked(startDockerServices).mockRejectedValueOnce(
      new Error('Bind for 127.0.0.1:6333 failed: port is already allocated'),
    );

    await expect(run(['/tmp/ragen-test'])).resolves.toBe(true);

    expect(clack.cancel).not.toHaveBeenCalled();
    expect(clack.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('already holding these host'),
    );
    // The setup after it still runs: the install is finished, not abandoned.
    expect(generatePrismaClient).toHaveBeenCalled();
  });

  /**
   * The sharper half of the same failure. Compose usually refuses because
   * another stack holds these ports — and that stack's Postgres is answering
   * on the port this install was just configured for. Migrating would write
   * into *its* database.
   */
  it('keeps migrations and the seed away from a database it did not start', async () => {
    vi.mocked(clack.select).mockResolvedValueOnce('skip' as never);
    vi.mocked(clack.confirm).mockResolvedValue(true as never);
    vi.mocked(startDockerServices).mockRejectedValueOnce(
      new Error('Bind for 127.0.0.1:55432 failed: port is already allocated'),
    );

    await expect(run(['/tmp/ragen-test'])).resolves.toBe(true);

    // Local to the new tree, no connection opened — still runs.
    expect(generatePrismaClient).toHaveBeenCalled();
    // These two talk to a database.
    expect(migrateDatabase).not.toHaveBeenCalled();
    expect(seedDatabase).not.toHaveBeenCalled();
    expect(clack.log.warn).toHaveBeenCalledWith(
      expect.stringContaining('npx prisma migrate deploy'),
    );
  });
});
