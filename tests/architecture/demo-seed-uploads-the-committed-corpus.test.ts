import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The demo seed ingests the corpus in `scripts/demo-corpus/`, by reading the
 * directory rather than by carrying documents in its own source.
 *
 * An architecture test, for the reason given in
 * `demo-seed-refuses-the-wrong-environment.test.ts`: `apps/web/tsconfig.json`
 * excludes `src/scripts`, so a rename in `features/subscriptions/services/`
 * can leave this script's import dangling while `npm run verify` stays green.
 *
 * What it protects: the seed used to hold three markdown documents as string
 * literals. Whoever replaces the corpus — which the demo is *for* — should be
 * adding files to a directory, not editing a script that is neither
 * typechecked nor runnable outside a full app environment. A seed that names
 * its files in code silently ignores a file added beside them.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SEED = 'apps/web/src/scripts/seed-demo-organization.ts';
const CORPUS = 'scripts/demo-corpus/files';

const source = readFileSync(join(REPO_ROOT, SEED), 'utf8');

describe('the demo seed uploads the committed corpus', () => {
  it('takes its file selection from a typechecked module', () => {
    expect(source).toMatch(
      /import \{[\s\S]*?selectDemoCorpusFiles[\s\S]*?\} from '@\/features\/subscriptions\/services\/demo-corpus'/,
    );
  });

  it('reads the directory, so a file added to the corpus needs no code change', () => {
    expect(source).toMatch(/readdir\(/);
  });

  it('carries no corpus of its own', () => {
    // The markdown that used to live here. A document body inlined in the
    // script is one nobody can open, diff or hand to a salesperson.
    expect(source).not.toMatch(/PLACEHOLDER_CORPUS/);
  });

  it('points at a corpus that is actually there', () => {
    const directory = join(REPO_ROOT, CORPUS);

    expect(existsSync(directory)).toBe(true);
    expect(readdirSync(directory).length).toBeGreaterThan(0);
  });

  it('names the corpus directory in one place', () => {
    // Not `scripts/demo-corpus/files` written out in the script: the constant
    // and the test above have to be able to disagree with each other.
    expect(source).toMatch(/DEMO_CORPUS_DIRECTORY/);
    expect(source).not.toMatch(/'scripts\/demo-corpus/);
  });
});
