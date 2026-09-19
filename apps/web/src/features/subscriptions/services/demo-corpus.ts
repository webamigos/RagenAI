import { SUPPORTED_MIME_TYPES } from '@/app/lib/constants/supportedMimeTypes';

/**
 * Which files the demo seed uploads, and what to call them on the way in.
 *
 * It lives here rather than beside the script for the same reason
 * `assertDemoSeedTarget` does: `apps/web/tsconfig.json` excludes `src/scripts`,
 * so nothing in that directory is typechecked and a mistake in it stays green
 * through `npm run verify`. The seed reads the directory and does the I/O; the
 * decisions — which names are uploadable, what MIME type each one carries —
 * are made here, where a test can reach them.
 *
 * The corpus itself is `scripts/demo-corpus/` (see its README): twelve
 * PDF/XLSX/DOCX documents about one fictional company, generated so that the
 * facts in them agree with each other.
 */

/**
 * Repo-relative, because the seed resolves it against the repository root.
 *
 * The corpus is built in two languages, one directory each, and the seed takes
 * one of them: a demo tenant shown to a Polish prospect and one shown to an
 * English-speaking prospect are different tenants, not one tenant holding both.
 * Point `DEMO_CORPUS_DIR` at `scripts/demo-corpus/files/en` for the English
 * set — or at both, if a bilingual knowledge base is the thing being
 * demonstrated; the two sets quote the same figures, so they cannot contradict
 * each other.
 */
export const DEMO_CORPUS_DIRECTORY = 'scripts/demo-corpus/files/pl';

/** Overrides the directory, for a corpus kept outside the repository. */
export const DEMO_CORPUS_DIRECTORY_ENV = 'DEMO_CORPUS_DIR';

/**
 * Extension → MIME type, inverted from the application's own table rather than
 * written out again.
 *
 * Ingest routes on the file *name* (`getFileType`), so the MIME type mostly
 * rides along — but it is stored, and the upload path and `apps/api` both read
 * it. Deriving it here means a format the application stops supporting stops
 * being seeded, instead of being uploaded as a type nothing can parse.
 */
const MIME_TYPE_BY_EXTENSION: Record<string, string> = Object.fromEntries(
  Object.entries(SUPPORTED_MIME_TYPES).map(([mimeType, extension]) => [
    extension,
    mimeType,
  ]),
);

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/**
 * The MIME type to upload `fileName` as, or `undefined` when the application
 * has no type for that extension.
 *
 * `undefined` is not an error — see `selectDemoCorpusFiles`. A corpus
 * directory is a folder on somebody's disk and will collect a `.DS_Store`, a
 * `.source.txt` kept beside a generated file, or notes.
 */
export function demoCorpusMimeType(fileName: string): string | undefined {
  return MIME_TYPE_BY_EXTENSION[extensionOf(fileName)];
}

export type DemoCorpusFile = { fileName: string; mimeType: string };

export type DemoCorpusSelection = {
  /** Uploadable, sorted by name so two runs report in the same order. */
  files: DemoCorpusFile[];
  /** Everything else, so the seed can say what it ignored instead of hiding it. */
  skipped: string[];
};

/**
 * Split a directory listing into what the seed uploads and what it ignores.
 *
 * Pure, and takes names rather than a path: the seed does the `readdir`, this
 * decides. Dotfiles are dropped without being reported — nobody put a
 * `.DS_Store` in a corpus on purpose and listing it as skipped only trains the
 * reader to ignore that line.
 */
export function selectDemoCorpusFiles(
  fileNames: readonly string[],
): DemoCorpusSelection {
  const files: DemoCorpusFile[] = [];
  const skipped: string[] = [];

  for (const fileName of [...fileNames].sort((a, b) => a.localeCompare(b))) {
    if (fileName.startsWith('.')) {
      continue;
    }

    const mimeType = demoCorpusMimeType(fileName);
    if (mimeType) {
      files.push({ fileName, mimeType });
    } else {
      skipped.push(fileName);
    }
  }

  return { files, skipped };
}
