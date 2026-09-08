import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The file you are reading is only worth writing if something runs it.
 *
 * `tests/architecture/**` lives in the root vitest project, and the root is
 * not one of the `workspaces` globs — so nothing in `apps/*` or `packages/*`
 * reaches it. It is reachable only through the chain below, and the chain had
 * a broken link: `npm run verify` runs `turbo run … test …`, but **turbo will
 * not run a script in the root package unless turbo.json declares a `//#task`
 * entry for it**, and there was none. So `verify` — the command AGENTS.md
 * calls "THE gate" and "the one command that checks all of them at once" —
 * skipped every guard in this directory. Observed directly: with a
 * deliberately broken guard in the tree, `npm run verify` exited 0 while
 * `npx vitest run tests/architecture/` reported 3 failed.
 *
 * CI had compensated for it with a separate `npm run packages:test` step, and
 * the comment beside that step said so, which is why the gap survived: the
 * repository looked covered. It was, in CI, and not on anyone's machine. That
 * is how the knex-shaped assertion in
 * `thread-deletion-must-remove-messages.test.ts` passed local validation
 * during the ADR-40 migration and went red on `main`.
 *
 * See docs/lessons/a-stacked-pr-gets-no-ci-and-retargeting-does-not-start-one.md
 * — same family: a check that never ran is indistinguishable from one that
 * passed.
 *
 * Each `it` below is one link. Breaking any of them makes this whole directory
 * silent again, and silence is exactly what no other test can report.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function read(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

const rootPackage = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>;
  workspaces: string[];
};

const turbo = JSON.parse(read('turbo.json')) as {
  tasks: Record<string, unknown>;
};

describe('the gate runs the repo-wide guards', () => {
  it('still has a reason to exist: the root is not a workspace', () => {
    // Guard on the guard. If the root ever joins `workspaces`, turbo reaches
    // it as an ordinary package and the `//#test` link below stops being the
    // thing that matters — at which point these assertions are misleading
    // rather than wrong, and should be rewritten, not deleted.
    const globs = rootPackage.workspaces;

    expect(globs).toEqual(['packages/*', 'apps/*']);
  });

  it('link 1: verify delegates the test task to turbo', () => {
    expect(rootPackage.scripts.verify).toMatch(/\bturbo run\b[^&|]*\btest\b/);
  });

  it('link 2: turbo.json declares the root test task', () => {
    // Without this entry turbo silently runs nothing at the root. It does not
    // warn, and `turbo run test` still reports success.
    expect(
      Object.keys(turbo.tasks),
      'turbo will not run a root script without a `//#task` entry, so ' +
        'removing `//#test` drops every guard in tests/architecture from ' +
        '`npm run verify` and from CI, with no error anywhere.',
    ).toContain('//#test');
  });

  it('link 3: the root package has the script that task invokes', () => {
    expect(rootPackage.scripts.test).toBeDefined();
    expect(rootPackage.scripts.test).toMatch(/\bvitest\b/);
  });

  it('link 4: the root vitest project collects this directory', () => {
    const config = read('vitest.config.ts');

    // Matched against the config source rather than an imported value: the
    // config pulls in plugins, and importing it here would run them.
    expect(
      config,
      'The root vitest `include` no longer covers tests/**, so this file ' +
        'is not collected and cannot report anything.',
    ).toMatch(/include:\s*\[[^\]]*['"]tests\/\*\*\/\*\.test\.ts['"]/s);
  });

  it('link 5: CI reaches the guards through that same turbo task', () => {
    const workflow = read('.github/workflows/ci.yml');
    const runsTurboTest = /- run: npx turbo run test\b/.test(workflow);
    const runsRootVitestDirectly = /- run: npm run (packages:)?test\s*$/m.test(
      workflow,
    );

    // Either route is fine; having neither is not. This is asserted apart
    // from the local gate because the two diverged once already, and the
    // divergence is what hid the gap.
    expect(runsTurboTest || runsRootVitestDirectly).toBe(true);
  });
});
