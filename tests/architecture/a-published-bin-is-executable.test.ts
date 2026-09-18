import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `tsc` does not set the executable bit, and npm does.
 *
 * That asymmetry hides itself in the direction that matters least and shows
 * itself in the direction that confuses most. Installing a published package
 * chmods everything named in `bin`, so `npx create-ragen-app@latest` has always
 * worked. Inside this repository `npx` resolves the *workspace* bin instead —
 * a symlink to `dist/index.js` straight out of `tsc`, mode 644 — and answers:
 *
 *   sh: node_modules/.bin/create-ragen-app: Permission denied
 *
 * Which reads like a broken install, or a broken machine, rather than a missing
 * bit on a build output. It was found while verifying a release, by typing the
 * obvious command in the obvious directory.
 *
 * Third instance of one theme in this package's history: **the working tree is
 * not what ships.** The other two were `npm pack` honouring `files` (so the
 * workspace resolved files the tarball does not carry) and a version bump that
 * published while sitting uncommitted. Each time, the published artifact was
 * fine and the local one was not, or the reverse — and each time the check that
 * would have caught it did not exist yet.
 *
 * So this guards the two halves that make a `bin` runnable, statically, from
 * the manifests rather than from build output:
 *
 * - the **shebang**, without which the bit is useless, and
 * - the **bit**, without which the shebang is never reached.
 *
 * Static on purpose, matching `build-output-stays-where-the-start-command-looks`:
 * a guard that reads `dist/` answers for whatever happened to be built last,
 * and passes vacuously on a tree that has not been built at all.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

interface PublishedBin {
  workspace: string;
  command: string;
  /** The built file, relative to the workspace. */
  target: string;
  build: string;
}

/** Every workspace that installs a command, read out of its own manifest. */
function publishedBins(): PublishedBin[] {
  const found: PublishedBin[] = [];

  for (const workspace of ['packages', 'apps'].flatMap((parent) =>
    readdirSafe(join(REPO_ROOT, parent)).map((name) => `${parent}/${name}`),
  )) {
    const manifestPath = join(REPO_ROOT, workspace, 'package.json');
    if (!existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      bin?: Record<string, string> | string;
      scripts?: Record<string, string>;
    };
    if (!manifest.bin) {
      continue;
    }

    const bins =
      typeof manifest.bin === 'string'
        ? { [workspace.split('/')[1]]: manifest.bin }
        : manifest.bin;

    for (const [command, target] of Object.entries(bins)) {
      found.push({
        workspace,
        command,
        target,
        build: manifest.scripts?.build ?? '',
      });
    }
  }

  return found;
}

/** A missing `apps/` or `packages/` is not worth a crash here. */
function readdirSafe(directory: string): string[] {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}

const BINS = publishedBins();

describe('a published bin is executable', () => {
  it('found the commands it is supposed to check', () => {
    // Two today: create-ragen-app and ragen. A manifest shape this stopped
    // understanding would otherwise turn every check below into a no-op.
    expect(BINS.map((bin) => bin.command).sort()).toEqual([
      'create-ragen-app',
      'ragen',
    ]);
  });

  it.each(BINS)(
    '$workspace: `$command` is made executable by its own build',
    ({ workspace, command, target, build }) => {
      // `chmod +x`, not a node one-liner, because `clean` in these same
      // manifests is already `rm -rf dist` — POSIX is assumed here, and
      // publishing runs both through `prepack`.
      expect(
        build,
        `${workspace} installs \`${command}\` from ${target}, and its build script is "${build}". tsc leaves that file mode 644, so \`npx ${command}\` inside this repository fails with "Permission denied" — npm only sets the bit when it installs the published tarball, which is why the published package works and the workspace does not. Append \`&& chmod +x ${target}\`.`,
      ).toMatch(
        new RegExp(
          `chmod\\s+\\+x\\s+${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        ),
      );
    },
  );

  it.each(BINS)(
    '$workspace: the source behind `$command` starts with a shebang',
    ({ workspace, command, target }) => {
      // The bit and the shebang are worth nothing separately: a mode-755 file
      // the kernel cannot interpret fails as "Exec format error", which is an
      // even less obvious message than the permission one.
      const source = join(
        REPO_ROOT,
        workspace,
        target.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts'),
      );

      expect(
        existsSync(source),
        `Could not find the source behind \`${command}\` at ${source}. If the layout moved, this guard has to move with it.`,
      ).toBe(true);
      expect(
        readFileSync(source, 'utf8').split('\n')[0],
        `${source} must start with a shebang, or the executable bit points at a file the kernel cannot run.`,
      ).toBe('#!/usr/bin/env node');
    },
  );

  it.each(BINS)(
    '$workspace: `$command` is executable right now, if it has been built',
    ({ workspace, target, command }) => {
      // The belt to the static braces above, and the only assertion here that
      // looks at reality. `//#test` depends on `^build` in turbo.json, so under
      // `npm run verify` and in CI this always has something to look at; a bare
      // `npx vitest` on an unbuilt tree is told to build rather than passed.
      const built = join(REPO_ROOT, workspace, target);

      expect(
        existsSync(built),
        `${built} is missing, so this cannot check whether \`${command}\` is executable — run \`npm run packages:build\` (which is what \`npm run verify\` does for you).`,
      ).toBe(true);
      expect(
        statSync(built).mode & 0o111,
        `${built} is not executable, so \`npx ${command}\` fails with "Permission denied" inside this repository. The build script should have chmod'd it; rebuild with \`npm run packages:build\`.`,
      ).not.toBe(0);
    },
  );
});
