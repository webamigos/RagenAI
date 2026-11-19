import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A worker script that starts `runFileEmbeddings` for files it planned
 * earlier must pass `keepActiveVersion: true`.
 *
 * The script picks the job per file when it builds its plan, and the job runs
 * minutes or hours later, behind everything else in the queue. An edit saved
 * in between makes `runFileEmbeddings` the wrong job: it parses the stored
 * file, which is still the original upload, and the edit leaves the index.
 * The flag makes the handler look again and hand over to
 * `reindexDocumentVersion`. See
 * `docs/lessons/a-job-chosen-at-enqueue-is-a-decision-that-ages.md`.
 *
 * The scripts are wiring with no unit test of their own, so a new one that
 * forgets the flag would be green everywhere. Scoped to `reindex-*`: the load
 * test starts the job too, for files it has just created.
 */

const SCRIPTS = join(
  import.meta.dirname,
  '..',
  '..',
  'apps',
  'worker',
  'src',
  'scripts',
);

const START = /start\(\s*'runFileEmbeddings'[\s\S]*?\}\s*\)/g;

describe('a bulk re-embed keeps the active version', () => {
  const sources = readdirSync(SCRIPTS)
    .filter((name) => /^reindex-.*\.ts$/.test(name))
    .map((name) => ({
      name,
      starts: readFileSync(join(SCRIPTS, name), 'utf8').match(START) ?? [],
    }))
    .filter((source) => source.starts.length > 0);

  it('finds the scripts that start the job', () => {
    expect(sources.map((source) => source.name).sort()).toEqual([
      'reindex-for-context.ts',
      'reindex-organization.ts',
    ]);
  });

  it.each(sources)('$name passes keepActiveVersion', ({ starts }) => {
    for (const start of starts) {
      expect(start).toContain('keepActiveVersion: true');
    }
  });
});
