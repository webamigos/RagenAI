import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * An ADR that is referenced everywhere and exists nowhere.
 *
 * ADR-44 — the decision that made BullMQ the worker runtime — landed in #1222
 * and was deleted by #1223 four days later, in a pull request whose subject was
 * *taking Temporal out of the default install*. Nothing noticed. Sixty-one
 * references survived it: `AGENTS.md`'s Task Router, the README, the Helm
 * chart, both compose files, `packages/env`, `packages/create-ragen-app`, two
 * workflows, a dozen tests — every one of them a link into the void, and every
 * static check green. The generated configuration reference was the only thing
 * that could see it, because it resolves ADR numbers while rendering, and it
 * only runs when somebody publishes docs.
 *
 * The rule a comment cannot enforce, per AGENTS.md: **a record that is cited is
 * a record that exists.** This reads the repository as text, the way the other
 * guards here do, and fails with the citing file named rather than with a
 * broken link on the docs site.
 *
 * It checks the reference resolves, not that the prose is current — staleness
 * is a review question, and a test that tried to judge it would fail on
 * wording.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const ADR_DIR = join(REPO_ROOT, 'docs', 'adrs');

/** Directories with nothing hand-written in them. */
const SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'playwright-report',
  'test-results',
]);

const SEARCHED_EXTENSIONS = [
  '.md',
  '.mdx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.js',
  '.yml',
  '.yaml',
];

/**
 * `ADR-44`, `ADR 44` and `adr-07` all cite the same record. The link form
 * (`docs/adrs/44-…md`) is checked separately below, because a wrong *slug* with
 * a right number is its own failure and points at a file that does not open.
 */
const ADR_NUMBER = /\bADRs?[-\s]?(\d{2})\b/gi;
const ADR_PATH = /adrs\/(\d{2}-[a-z0-9-]+\.md)/g;

/**
 * A number a spec has claimed for a record it has not written yet.
 *
 * Two of those exist — the pgvector and Mistral-parser specs each reserve the
 * next number in an unchecked phase item — and they are the opposite of the
 * failure this guard is for: a forward reference that says so. The marker has
 * to be adjacent to the citation, so reserving a number is a deliberate
 * sentence rather than a word appearing anywhere in the file.
 */
const RESERVED = /^\s*\(reserved\b/i;

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) {
        walk(full, found);
      }
      continue;
    }
    if (SEARCHED_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

const adrFiles = readdirSync(ADR_DIR).filter((name) =>
  /^\d{2}-.+\.md$/.test(name),
);
const numbers = new Set(adrFiles.map((name) => name.slice(0, 2)));
const slugs = new Set(adrFiles);
const sourceFiles = walk(REPO_ROOT);

describe('an ADR reference resolves', () => {
  it('finds the ADR directory it is guarding', () => {
    expect(adrFiles.length).toBeGreaterThan(10);
  });

  it('has a record for every ADR number cited anywhere in the repository', () => {
    const dangling: string[] = [];

    for (const file of sourceFiles) {
      // This file names ADR-44 to explain itself, and the fixture below cites a
      // number on purpose. Both would otherwise be their own failure.
      if (file.startsWith(join(REPO_ROOT, 'tests', 'architecture'))) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(ADR_NUMBER)) {
        const [citation, number] = match;
        if (numbers.has(number)) {
          continue;
        }
        if (RESERVED.test(text.slice(match.index + citation.length))) {
          continue;
        }
        dangling.push(`${relative(REPO_ROOT, file)} cites ${citation}`);
      }
    }

    expect(
      Array.from(new Set(dangling)),
      'Each of these names an ADR with no record in docs/adrs. Restore the ' +
        'record, or fix the reference — a citation that does not open is worse ' +
        'than no citation, because it reads as though the reasoning is written ' +
        'down somewhere.',
    ).toEqual([]);
  });

  it('has a file for every ADR path linked anywhere in the repository', () => {
    const broken: string[] = [];

    for (const file of sourceFiles) {
      if (file.startsWith(join(REPO_ROOT, 'tests', 'architecture'))) {
        continue;
      }
      const text = readFileSync(file, 'utf8');
      for (const [, slug] of text.matchAll(ADR_PATH)) {
        if (!slugs.has(slug)) {
          broken.push(`${relative(REPO_ROOT, file)} links docs/adrs/${slug}`);
        }
      }
    }

    expect(
      Array.from(new Set(broken)),
      'A link whose number is right and whose slug is wrong still 404s. ' +
        'Rename the link, or the record.',
    ).toEqual([]);
  });
});
