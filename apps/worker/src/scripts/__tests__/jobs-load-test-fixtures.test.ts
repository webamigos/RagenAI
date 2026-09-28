import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileType } from '../../types/UserFile.js';
import { localPathFor } from '../../services/ensure-local-file.js';
import {
  filesOption,
  fixtureFor,
  loadFixtures,
  storageKey,
} from '../jobs-load-test-fixtures.js';

describe('loadFixtures', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'load-test-fixtures-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads every supported file, subdirectories included, in path order', async () => {
    await mkdir(path.join(dir, 'pl'));
    await mkdir(path.join(dir, 'en'));
    await writeFile(path.join(dir, 'pl', 'umowa.pdf'), 'pl-pdf');
    await writeFile(path.join(dir, 'en', 'handbook.PDF'), 'en-pdf');
    await writeFile(path.join(dir, 'notes.md'), '# notes');

    const fixtures = await loadFixtures(dir);

    expect(fixtures.map((f) => f.fileName)).toEqual([
      'handbook.PDF',
      'notes.md',
      'umowa.pdf',
    ]);
    expect(fixtures[0]).toMatchObject({
      fileType: FileType.PDF,
      isBinaryFile: true,
    });
    expect(fixtures[0]!.content.toString()).toBe('en-pdf');
    expect(fixtures[1]).toMatchObject({
      fileType: FileType.MARKDOWN,
      isBinaryFile: false,
    });
  });

  it('skips a type it does not name rather than guessing one', async () => {
    await writeFile(path.join(dir, 'report.pdf'), 'pdf');
    await writeFile(path.join(dir, 'sheet.xlsx'), 'xlsx');
    await writeFile(path.join(dir, '.DS_Store'), '');

    const fixtures = await loadFixtures(dir);

    expect(fixtures.map((f) => f.fileName)).toEqual(['report.pdf']);
  });

  it('refuses a directory with nothing to upload', async () => {
    await writeFile(path.join(dir, 'sheet.xlsx'), 'xlsx');

    await expect(loadFixtures(dir)).rejects.toThrow(/no pdf\/docx\/txt\/md/);
  });
});

describe('fixtureFor', () => {
  it('cycles the list across a batch larger than it', () => {
    const fixtures = ['a.pdf', 'b.pdf', 'c.pdf'].map((fileName) => ({
      fileName,
      fileType: FileType.PDF,
      isBinaryFile: true,
      content: Buffer.from(fileName),
    }));

    expect(
      Array.from({ length: 7 }, (_, i) => fixtureFor(fixtures, i).fileName),
    ).toEqual(['a.pdf', 'b.pdf', 'c.pdf', 'a.pdf', 'b.pdf', 'c.pdf', 'a.pdf']);
  });
});

describe('storageKey', () => {
  it('is the key the worker downloads, for the same row', () => {
    const fileId = '3f7c1b1e-8d7a-4c2e-9d55-0b6f0e1c2a11';
    const fileName = `load-${fileId}-annual-report-2025.pdf`;

    expect(storageKey(fileId, fileName)).toBe(`${fileId}.pdf`);
    // The worker's scratch path is keyed the same way, so the two agree on
    // the extension; a key without it would be downloaded as nothing.
    expect(path.basename(localPathFor({ orgId: 'o', fileId, fileName }))).toBe(
      storageKey(fileId, fileName),
    );
  });

  it('has no extension when the name has none', () => {
    expect(storageKey('id', 'README')).toBe('id');
  });
});

describe('filesOption', () => {
  it('is undefined without the flag, so the run uses synthetic text', () => {
    expect(filesOption(['--levels', '16'])).toBeUndefined();
  });

  it('reads the directory after the flag', () => {
    expect(filesOption(['--files', '/corpus/pdfs', '--levels', '16'])).toBe(
      '/corpus/pdfs',
    );
  });

  it('refuses a trailing flag, or one followed by another flag', () => {
    expect(() => filesOption(['--levels', '16', '--files'])).toThrow(
      /--files takes a directory/,
    );
    expect(() => filesOption(['--files', '--levels', '16'])).toThrow(
      /--files takes a directory/,
    );
  });
});
