/**
 * Real files for the jobs load test (Docling spec 2026-09-26, C3).
 *
 * The load test's synthetic text measures the queue and the providers, but a
 * `.txt` is the cheapest thing Docling ever converts, so it says nothing about
 * the number C3 asks for: how many conversions at once a Docling host takes
 * before the ceiling stops paying. `--files <dir>` swaps the synthetic text for
 * the files in a directory — the demo corpus's PDFs — cycled across the batch.
 *
 * Its own module, and one that touches no database or storage, so the parts a
 * mistake would hide in (which files are picked, which type a row is given,
 * which key the object is stored under) are tested without a stack.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { FileType } from '../types/UserFile.js';
import { getFileExtension } from '../utils/get-file-extension.js';

export interface LoadTestFixture {
  /** The name the row carries; its extension decides the storage key. */
  fileName: string;
  fileType: FileType;
  isBinaryFile: boolean;
  content: Buffer;
}

/**
 * The extensions the load test uploads, and the row each becomes.
 *
 * A short list on purpose: a fixture whose type the pipeline would treat
 * differently from a real upload measures a path no user takes, so anything
 * not named here is skipped rather than guessed.
 */
const TYPES: Record<string, { fileType: FileType; isBinaryFile: boolean }> = {
  pdf: { fileType: FileType.PDF, isBinaryFile: true },
  docx: { fileType: FileType.DOCX, isBinaryFile: true },
  txt: { fileType: FileType.TEXT, isBinaryFile: false },
  md: { fileType: FileType.MARKDOWN, isBinaryFile: false },
};

/** Every supported file under `dir`, subdirectories included, in path order. */
export async function loadFixtures(dir: string): Promise<LoadTestFixture[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();

  const fixtures: LoadTestFixture[] = [];
  for (const filePath of paths) {
    const type = TYPES[getFileExtension(filePath).toLowerCase()];
    if (!type) {
      continue;
    }
    fixtures.push({
      fileName: path.basename(filePath),
      ...type,
      content: await readFile(filePath),
    });
  }

  if (fixtures.length === 0) {
    // An empty list would make every file of the batch undefined — better to
    // stop before anything is written into the organization.
    throw new Error(
      `--files ${dir}: no ${Object.keys(TYPES).join('/')} files found`,
    );
  }
  return fixtures;
}

/** The fixture for the batch's `index`th file: the list, round and round. */
export function fixtureFor(
  fixtures: readonly LoadTestFixture[],
  index: number,
): LoadTestFixture {
  return fixtures[index % fixtures.length]!;
}

/**
 * The object key for a file, which has to be the one the worker reads:
 * `ensureLocalFile` downloads `${fileId}.${ext}`, the extension taken from the
 * row's `fileName`. Upload and cleanup both use this, so they cannot disagree.
 */
export function storageKey(fileId: string, fileName: string): string {
  const ext = getFileExtension(fileName);
  return ext ? `${fileId}.${ext}` : fileId;
}
