import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Nothing writes `page_number` into chunk metadata.
 *
 * The field existed, held `index + 1`, and the design labelled it "page {n}" —
 * so a twelve-page PDF split into forty chunks reported "page 37". Gap 3 of
 * `docs/specs/2026-09-09-design-system-v2-functional-gaps.md` split it in two:
 * `chunk_index` for the ordinal it always was, and `source_page` for a real
 * page, written only when the parser knows one.
 *
 * This guards the half that is easy to undo. Re-adding `page_number` is a
 * one-word change that typechecks, passes every unit test, and puts an ordinal
 * back under a name that invites the old bug — and it cannot be caught by
 * reading a diff, because the two writers live in different apps.
 *
 * Old chunks in Qdrant still carry the field. That is deliberate: nothing
 * reads it, a re-index is what upgrades a document, and `source_page`'s
 * absence on those chunks is what makes them safe rather than mislabelled.
 */
const ROOT = join(import.meta.dirname, '..', '..');

const WRITERS = [
  'apps/worker/src/activities/embeddings/prepare-metadata.ts',
  'apps/web/src/app/api/threads/services/saveDataInVectorTable.ts',
  'apps/worker/src/services/llm/types/vector-store.ts',
  'apps/web/src/app/lib/types/types.ts',
];

/** Strips block and line comments so prose about the old name does not count. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('chunk metadata', () => {
  it.each(WRITERS)('%s does not write page_number', (relative) => {
    const code = stripComments(readFileSync(join(ROOT, relative), 'utf8'));

    expect(code).not.toMatch(/\bpage_number\b/);
  });

  it.each(WRITERS)('%s carries chunk_index instead', (relative) => {
    const code = stripComments(readFileSync(join(ROOT, relative), 'utf8'));

    expect(code).toMatch(/\bchunk_index\b/);
  });
});
