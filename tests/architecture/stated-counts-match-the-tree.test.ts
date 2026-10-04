import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './tracked-files';

/**
 * The numbers the README and AGENTS.md state are checkable in two seconds, and a
 * reader who checks one and finds it wrong stops trusting the rest. AGENTS.md is
 * the file every coding agent reads first, so a wrong count there is believed.
 *
 * It said "Thirty-four ADRs" while `docs/adrs/` held fifty, and "Six
 * applications and eight packages" next to a table of five applications and a
 * workspace of seventeen packages (OSS 03). Nothing failed, because a number in
 * prose is not tested by anything that reads code.
 *
 * So the README states them in digits, and this reads them back. It looks at the
 * three phrases that carry a count — `<n> ADRs`, `<n> applications`,
 * `<n> packages` — and compares each with the directory it describes. A phrase
 * that is reworded away is not a failure: the guard checks the claims that are
 * made, not that a claim is made.
 */

const STATED_IN = ['README.md', 'AGENTS.md'] as const;

const texts = STATED_IN.map((file) => ({
  file,
  text: readFileSync(join(REPO_ROOT, file), 'utf8'),
}));

const entries = (dir: string, keep: (name: string) => boolean): number =>
  readdirSync(join(REPO_ROOT, dir), { withFileTypes: true }).filter((entry) =>
    keep(entry.name),
  ).length;

const adrs = entries('docs/adrs', (name) => /^\d+-.+\.md$/.test(name));
const apps = entries('apps', (name) => !name.startsWith('.'));
const packages = entries('packages', (name) => !name.startsWith('.'));

/** Every number that directly precedes `noun`, with an optional link wrapper. */
function claims(noun: string): { file: string; count: number }[] {
  const pattern = new RegExp(`\\b(\\d+) (?:\\[)?${noun}\\b`, 'g');

  return texts.flatMap(({ file, text }) =>
    [...text.matchAll(pattern)].map((match) => ({
      file,
      count: Number(match[1]),
    })),
  );
}

describe('the counts stated in the README and AGENTS.md match the tree', () => {
  it.each([
    ['ADRs', adrs, 'the ADR files in docs/adrs'],
    ['applications', apps, 'the directories in apps/'],
    ['packages', packages, 'the directories in packages/'],
  ] as const)('every "<n> %s" says %i', (noun, actual, what) => {
    const stated = claims(noun);

    // A guard that finds nothing to check is a guard that stopped working.
    expect(
      stated.length,
      `no "<n> ${noun}" in the README or AGENTS.md`,
    ).toBeGreaterThan(0);

    for (const { file, count } of stated) {
      expect(
        count,
        `${file} says ${count} ${noun}; ${what} has ${actual}`,
      ).toBe(actual);
    }
  });
});
