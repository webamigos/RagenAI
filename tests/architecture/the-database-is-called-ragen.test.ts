import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The database is `ragen`. It was `smart` + `rag` once, and the old name
 * outlived the rename in twelve places — every one of them a connection
 * string.
 *
 * This was not cosmetic. `docker-compose.yml` creates `POSTGRES_DB: ragen`
 * and both `.env.example` files already said `/ragen`, so the survivors named
 * a database that does not exist:
 *
 * - AGENTS.md documented a minimum `.env.local` that cannot connect, which is
 *   the first thing a fresh clone copies;
 * - the first-run setup page offered it as the example connection string — to
 *   someone already stuck on a misconfiguration, which is the worst possible
 *   moment to hand over a wrong value.
 *
 * The remaining ten were test fixtures, harmless in themselves and exactly
 * what makes a name like this come back: someone copies a fixture into a new
 * example and the wrong database is documented again.
 *
 * The needle is assembled rather than written out, so this file does not
 * contain the string it forbids and needs no exemption for itself — an
 * exemption by path would also wave through a real occurrence added here.
 */
const RETIRED_NAME = new RegExp(['smart', 'rag'].join(''), 'i');

/**
 * This walks ~2,900 files and reads every one, so its runtime is the machine's
 * rather than the code's. Vitest's 5s default is sized for a unit test, and
 * under `npm run verify` — four workspaces building and testing at once — the
 * I/O contention pushed it past that and failed a green tree.
 *
 * Faster *and* given room: matching a case-insensitive regexp against the file
 * replaced lowercasing a copy of it, which is four times quicker (846ms to
 * 199ms across the tree). The timeout is then headroom for a loaded machine,
 * not the thing holding it up.
 */
const WALKS_THE_TREE = 30_000;

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const SEARCH_ROOTS = ['apps', 'packages', 'docs', 'tests', 'infra', 'prisma'];

/**
 * Build output only. These are gitignored, and a stale docs build still holds
 * the old string from whenever it was last generated — scanning it would fail
 * this test on a machine that had run `docs:build` and pass on one that had
 * not, which is worse than not scanning it.
 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.docusaurus',
  'build',
  'dist',
  'coverage',
  'generated',
  '.turbo',
]);

const TEXT_FILE = /\.(ts|tsx|js|mjs|cjs|json|md|ya?ml|env|example|sql|prisma)$/;

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (TEXT_FILE.test(entry)) {
      yield full;
    }
  }
}

/**
 * Files worth checking that no `SEARCH_ROOTS` walk reaches.
 *
 * `.vscode/settings.json` is here because it is where the word survived
 * longest: a spell-check dictionary is the one place a retired name is added
 * *deliberately*, to silence the checker that noticed it. Scanning the whole
 * `.vscode` directory instead would pull in per-developer editor state that
 * has nothing to do with this rule.
 */
const ROOT_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'CONTRIBUTING.md',
  'docker-compose.yml',
  '.env.example',
  'ragen.config.ts',
  join('.vscode', 'settings.json'),
].map((name) => join(REPO_ROOT, name));

describe('the retired database name is gone', () => {
  it(
    'appears in no source, document or fixture',
    { timeout: WALKS_THE_TREE },
    () => {
      const files = [
        ...SEARCH_ROOTS.flatMap((root) => [...walk(join(REPO_ROOT, root))]),
        ...ROOT_FILES,
      ];

      const offenders = files
        .filter((file) => {
          try {
            return RETIRED_NAME.test(readFileSync(file, 'utf8'));
          } catch {
            return false;
          }
        })
        .map((file) => relative(REPO_ROOT, file));

      expect(
        offenders,
        `The database is "ragen" — docker-compose.yml creates POSTGRES_DB: ragen. A connection string naming the old database points at one that does not exist.`,
      ).toEqual([]);
    },
  );

  it(
    'is looking at the files it thinks it is',
    { timeout: WALKS_THE_TREE },
    () => {
      // A walk that silently matched nothing would make the assertion above
      // pass for the wrong reason.
      const files = SEARCH_ROOTS.flatMap((root) => [
        ...walk(join(REPO_ROOT, root)),
      ]);

      expect(files.length).toBeGreaterThan(100);
    },
  );
});
