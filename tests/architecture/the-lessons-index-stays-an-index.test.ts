import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `docs/lessons.md` is an index the Task Router tells every agent to read
 * before nontrivial work. It carried each lesson's summary and tags as well as
 * its title, grew to 100 KB — roughly 25,000 tokens before any work began —
 * and so was read by nobody. The summaries now open each lesson file as an
 * **In short** paragraph, and the index is titles only.
 *
 * This keeps it that way, and keeps it honest: every bullet resolves, every
 * lesson is listed, and nothing follows the link on a bullet line.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const INDEX = join(REPO_ROOT, 'docs', 'lessons.md');
const LESSONS_DIR = join(REPO_ROOT, 'docs', 'lessons');

/** Room to grow by about half again from 26 KB before anyone has to act. */
const INDEX_BUDGET = 40_000;

const index = readFileSync(INDEX, 'utf8');
const bullets = index.split('\n').filter((line) => line.startsWith('- ['));
const BULLET = /^- \[[^\n]+\]\(lessons\/([a-z0-9-]+\.md)\)$/;

describe('the lessons index stays an index', () => {
  it(`stays under ${INDEX_BUDGET} bytes`, () => {
    expect(Buffer.byteLength(index)).toBeLessThanOrEqual(INDEX_BUDGET);
  });

  it('lists each lesson as a bare link — the summary lives in the file', () => {
    const offenders = bullets.filter((line) => !BULLET.test(line));

    expect(
      offenders,
      'Put the summary in the lesson file as its **In short** paragraph, and ' +
        'leave only `- [Title](lessons/<slug>.md)` in the index.',
    ).toEqual([]);
  });

  it('links only to lessons that exist', () => {
    const missing = bullets
      .map((line) => BULLET.exec(line)?.[1])
      .filter((file): file is string => Boolean(file))
      .filter((file) => !existsSync(join(LESSONS_DIR, file)));

    expect(missing).toEqual([]);
  });

  it('lists every lesson file, so none is written and then never found', () => {
    const listed = new Set(bullets.map((line) => BULLET.exec(line)?.[1]));
    const unlisted = readdirSync(LESSONS_DIR)
      .filter((file) => file.endsWith('.md'))
      .filter((file) => !listed.has(file));

    expect(unlisted).toEqual([]);
  });
});
