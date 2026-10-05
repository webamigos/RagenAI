import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './tracked-files';

/**
 * A change to `prisma/schema.prisma` must miss turbo's cache in every workspace
 * that compiles against a generated Prisma client.
 *
 * It did not. No task in the root `turbo.json` declares `inputs`, so turbo
 * hashes each workspace's own tracked files, and the schema sits at the
 * repository root, outside all of them. The generated clients are gitignored,
 * so they are not hashed either. Editing the schema changed the hash of one
 * task out of 89: the root `//#test`.
 *
 * On #1572 a migration widened `Subscription` by five columns. A test fixture
 * typed as `SubscriptionDetails` stopped compiling. Local `npm run verify`
 * said 70/70, replaying typecheck from cache. CI's Typecheck, Build and
 * test-e2e all failed on TS2322.
 *
 * The fix is a package `turbo.json` in each consumer that adds the schema to
 * every task's `inputs`, beside `$TURBO_DEFAULT$`. Without `$TURBO_DEFAULT$`
 * a task would hash the schema *instead of* its own files, and an edit to the
 * app itself would stop invalidating anything, which is worse than the bug.
 */

const SCHEMA_INPUT = '$TURBO_ROOT$/prisma/schema.prisma';
const DEFAULT_INPUT = '$TURBO_DEFAULT$';

type TurboConfig = {
  extends?: string[];
  tasks?: Record<string, { inputs?: string[] }>;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8')) as T;
}

/** `apps/<name>` directories with tracked code importing a generated client. */
function prismaConsumers(): string[] {
  const out = execFileSync(
    'git',
    ['grep', '-l', 'generated/prisma', '--', 'apps', ':!**/generated/**'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  const dirs = out
    .split('\n')
    .filter(Boolean)
    .map((path) => path.split('/').slice(0, 2).join('/'));
  return [...new Set(dirs)].sort();
}

const rootTasks = Object.keys(
  readJson<TurboConfig>('turbo.json').tasks ?? {},
).filter((task) => !task.startsWith('//'));

describe('a schema change invalidates the turbo cache', () => {
  const consumers = prismaConsumers();

  it('finds the workspaces that use a generated Prisma client', () => {
    // If this drops to zero the grep is wrong, not the repository.
    expect(consumers).toEqual(
      expect.arrayContaining([
        'apps/admin',
        'apps/api',
        'apps/web',
        'apps/worker',
      ]),
    );
  });

  it.each(consumers)('%s hashes the schema for every task it runs', (dir) => {
    const configPath = join(dir, 'turbo.json');
    expect(
      existsSync(join(REPO_ROOT, configPath)),
      `${configPath} is missing: without it a schema change replays this workspace's tasks from cache`,
    ).toBe(true);

    const config = readJson<TurboConfig>(configPath);
    expect(config.extends).toEqual(['//']);

    const scripts = Object.keys(
      readJson<{ scripts?: Record<string, string> }>(join(dir, 'package.json'))
        .scripts ?? {},
    );
    const tasks = rootTasks.filter((task) => scripts.includes(task));

    for (const task of tasks) {
      const inputs = config.tasks?.[task]?.inputs ?? [];
      expect(inputs, `${configPath} task "${task}"`).toContain(SCHEMA_INPUT);
      expect(inputs, `${configPath} task "${task}"`).toContain(DEFAULT_INPUT);
    }
  });
});
