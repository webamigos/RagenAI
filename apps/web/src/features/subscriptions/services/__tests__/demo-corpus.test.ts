import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEMO_CORPUS_DIRECTORY,
  demoCorpusMimeType,
  selectDemoCorpusFiles,
} from '../demo-corpus';

const REPO_ROOT = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
);

describe('demoCorpusMimeType', () => {
  it.each([
    ['katalog-produktow-2026.pdf', 'application/pdf'],
    [
      'cennik-2026.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    [
      'umowa-ramowa-dostawy.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['notes.md', 'text/markdown'],
    ['rejestr.csv', 'text/csv'],
  ])('types %s as %s', (fileName, expected) => {
    expect(demoCorpusMimeType(fileName)).toBe(expected);
  });

  it('is case-insensitive about the extension', () => {
    expect(demoCorpusMimeType('RAPORT.PDF')).toBe('application/pdf');
  });

  it('has no type for an extension the application cannot parse', () => {
    expect(demoCorpusMimeType('corpus.zip')).toBeUndefined();
    expect(demoCorpusMimeType('README')).toBeUndefined();
  });
});

describe('selectDemoCorpusFiles', () => {
  it('returns the uploadable files sorted, whatever order the directory gave', () => {
    const { files } = selectDemoCorpusFiles([
      'umowa-ramowa-dostawy.docx',
      'cennik-2026.xlsx',
      'katalog-produktow-2026.pdf',
    ]);

    expect(files.map((file) => file.fileName)).toEqual([
      'cennik-2026.xlsx',
      'katalog-produktow-2026.pdf',
      'umowa-ramowa-dostawy.docx',
    ]);
  });

  it('reports an unsupported file instead of uploading it', () => {
    const { files, skipped } = selectDemoCorpusFiles([
      'raport.pdf',
      'corpus.zip',
    ]);

    expect(files.map((file) => file.fileName)).toEqual(['raport.pdf']);
    expect(skipped).toEqual(['corpus.zip']);
  });

  it('drops dotfiles silently, since nobody put them there on purpose', () => {
    const { files, skipped } = selectDemoCorpusFiles([
      '.DS_Store',
      'raport.pdf',
    ]);

    expect(files.map((file) => file.fileName)).toEqual(['raport.pdf']);
    expect(skipped).toEqual([]);
  });

  it('is empty rather than throwing on an empty directory', () => {
    expect(selectDemoCorpusFiles([])).toEqual({ files: [], skipped: [] });
  });
});

/**
 * The committed corpus and this selector have to agree: a file added to
 * `scripts/demo-corpus/files` that lands in `skipped` would be silently left
 * out of every demo, and nothing else would report it.
 */
describe('the committed corpus', () => {
  const entries = readdirSync(join(REPO_ROOT, DEMO_CORPUS_DIRECTORY));
  const { files, skipped } = selectDemoCorpusFiles(entries);

  it('is where the seed expects it', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('is entirely uploadable', () => {
    expect(skipped).toEqual([]);
  });

  it('covers the three formats a prospect actually brings', () => {
    const extensions = new Set(
      files.map((file) => file.fileName.split('.').pop()),
    );

    expect(extensions).toEqual(new Set(['pdf', 'xlsx', 'docx']));
  });
});
