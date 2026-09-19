import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A workflow that installs this repository uses the npm this repository pins.
 *
 * `package.json` declares `packageManager: npm@10.9.8` and nothing enforced
 * it: `actions/setup-node` installs whatever npm ships with the Node line it
 * resolves, and `node-version: '24'` means the newest 24.x, which carries
 * npm 11.
 *
 * The two disagree about this tree. npm 10 prunes
 * `@modelcontextprotocol/sdk/node_modules/zod` from the lockfile and npm 11's
 * `npm ci` requires it, so an install written locally is one CI refuses —
 * every job failing in well under a minute, before reaching any code. It
 * happened twice in one day, both times after the most ordinary action there
 * is: adding a dependency to a workspace.
 *
 * Nothing local can catch it. `npm run verify` never runs `npm ci`, which is
 * the only command that compares the lockfile against the manifest — so the
 * gate is green by construction and the first sign is a wall of red checks.
 *
 * That makes it a rule worth a test rather than a comment: the next workflow
 * to install dependencies will be written by copying one of these, and the
 * line that matters is the one easiest to leave out.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const WORKFLOWS = join(REPO_ROOT, '.github', 'workflows');

/** Either of these puts the pinned npm on PATH before anything installs. */
const PINS_NPM = [
  './.github/actions/use-pinned-npm',
  './.github/actions/setup-workspace',
];

/** `npm ci` and `npm clean-install` are the same command under two names. */
const INSTALLS = /npm (?:ci|clean-install)\b/;

const workflows = readdirSync(WORKFLOWS).filter(
  (f) => f.endsWith('.yml') || f.endsWith('.yaml'),
);

describe('every workflow that installs this repository', () => {
  it('has workflows to check, so a path change cannot empty this test', () => {
    // A guard that scans a directory is one rename away from passing over
    // nothing at all, which is the failure mode `check:config-paths` exists
    // for elsewhere in this repository.
    expect(workflows.length).toBeGreaterThan(3);
  });

  it.each(workflows)('uses the pinned npm — %s', (file) => {
    const text = readFileSync(join(WORKFLOWS, file), 'utf8');

    if (!INSTALLS.test(text)) {
      return;
    }

    expect(
      PINS_NPM.some((action) => text.includes(action)),
      [
        `${file} runs an install without putting the pinned npm on PATH first.`,
        'Add `- uses: ./.github/actions/use-pinned-npm` after setup-node, or',
        'use ./.github/actions/setup-workspace, which already does.',
        '',
        'Without it the runner installs with whatever npm its Node line',
        'carries, which is not the one package.json pins — and a lockfile',
        'written with the pinned version is then refused by `npm ci`.',
      ].join('\n'),
    ).toBe(true);
  });
});

describe('the pin itself', () => {
  it('is declared, since the action reads it rather than repeating it', () => {
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'),
    );

    expect(pkg.packageManager).toMatch(/^npm@\d+\.\d+\.\d+$/);
  });
});
