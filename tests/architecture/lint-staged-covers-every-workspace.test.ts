import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every workspace that can be linted must be linted on commit.
 *
 * `lint-staged.config.mjs` maps a workspace directory to its npm name so
 * ESLint 9 runs with that workspace as its cwd — without which it cannot find
 * the workspace's own `eslint.config.*`. The map is hand-maintained, and a
 * workspace added later only reaches it if whoever added the workspace
 * remembers this one file. Four did not:
 *
 * - `packages/env` (ADR-37), `packages/platform-contracts` (ADR-33) and
 *   `packages/litellm-client` (ADR-34) each shipped with an ESLint config and
 *   a `lint` script, so `turbo run lint` checked them in CI while nothing
 *   checked them on commit;
 * - `apps/docs` and `packages/db` had no ESLint config at all and no `lint`
 *   script, so no CI job covered them either — they were unlinted everywhere.
 *
 * A comment asking the next person to remember is what was there before, and
 * it is what failed. This derives the expected set from the filesystem so the
 * map cannot silently fall behind again: add a workspace with an ESLint
 * config and this test names it until the map does too.
 *
 * Note this checks ESLint coverage only. Prettier is a separate `matchBase`
 * catch-all in the same file that already applies to every workspace.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

/** The globs in the root package.json's `workspaces` field, as directories. */
const WORKSPACE_PARENTS = ['apps', 'packages'];

/**
 * `packages/eslint-config` is exempt: it *is* the shared config, it exports
 * flat-config arrays rather than consuming one, and it has no
 * `eslint.config.*` of its own. It is therefore never picked up below, and
 * this note exists so a reader does not go looking for the omission.
 */
function findLintableWorkspaces(): string[] {
  const found: string[] = [];

  for (const parent of WORKSPACE_PARENTS) {
    const parentPath = join(REPO_ROOT, parent);
    if (!existsSync(parentPath)) {
      continue;
    }

    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const dir = join(parentPath, entry.name);
      if (!existsSync(join(dir, 'package.json'))) {
        continue;
      }

      const hasEslintConfig = readdirSync(dir).some((file) =>
        file.startsWith('eslint.config.'),
      );
      if (hasEslintConfig) {
        found.push(`${parent}/${entry.name}`);
      }
    }
  }

  return found.sort();
}

function readConfiguredWorkspaces(): Map<string, string> {
  const source = readFileSync(
    join(REPO_ROOT, 'lint-staged.config.mjs'),
    'utf8',
  );

  const block = source.match(/const workspaces = \{([\s\S]*?)\n\};/);
  expect(
    block,
    'lint-staged.config.mjs no longer declares `const workspaces = { … }`; this test reads it as text and needs updating alongside it.',
  ).not.toBeNull();

  const entries = new Map<string, string>();
  const pattern = /'([^']+)':\s*'([^']+)'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(block![1])) !== null) {
    entries.set(match[1] as string, match[2] as string);
  }

  return entries;
}

describe('lint-staged covers every lintable workspace', () => {
  const configured = readConfiguredWorkspaces();
  const lintable = findLintableWorkspaces();

  it('finds workspaces to check, so a broken discovery cannot pass vacuously', () => {
    expect(lintable.length).toBeGreaterThan(5);
    expect(configured.size).toBeGreaterThan(5);
  });

  it.each(lintable)(
    '%s has an ESLint config, so it must be in the lint-staged map',
    (workspace) => {
      expect(
        configured.has(workspace),
        `${workspace} has an eslint.config.* but is missing from \`workspaces\` in lint-staged.config.mjs, so nothing lints it on commit. Add it, mapped to the name in its package.json.`,
      ).toBe(true);
    },
  );

  it('maps every workspace to the name its own package.json declares', () => {
    for (const [dir, name] of configured) {
      const packageJsonPath = join(REPO_ROOT, dir, 'package.json');
      expect(
        existsSync(packageJsonPath),
        `lint-staged.config.mjs maps ${dir}, which does not exist. A renamed or removed workspace leaves an entry that silently matches nothing.`,
      ).toBe(true);

      const declared = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
        name?: string;
      };

      expect(
        declared.name,
        `lint-staged.config.mjs calls ${dir} "${name}", but its package.json says "${declared.name}". \`npm exec --workspace\` resolves by name, so a stale name makes the entry a no-op rather than an error.`,
      ).toBe(name);
    }
  });

  it('gives every mapped workspace a lint script, so CI checks it too', () => {
    for (const [dir] of configured) {
      const declared = JSON.parse(
        readFileSync(join(REPO_ROOT, dir, 'package.json'), 'utf8'),
      ) as { scripts?: Record<string, string> };

      expect(
        declared.scripts?.lint,
        `${dir} is linted on commit but has no \`lint\` script, so \`turbo run lint\` skips it and CI would not catch what a --no-verify commit lets through.`,
      ).toBeDefined();
    }
  });
});
