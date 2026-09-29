import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { splitText } from '../split-documents.js';
import { FileType } from '../../../types/UserFile.js';

/**
 * Docling output, and any Markdown, is cut by the Markdown splitter, which
 * recorded no heading — so a Docling chunk had no `section_path` and ADR-19's
 * `section` attribute was empty (spec 2026-09-29-contextual-chunks, A1).
 */
const MARKDOWN = [
  '# Regulamin pracy',
  '',
  '## Urlopy',
  '',
  'Pracownikowi przysługuje dwadzieścia sześć dni urlopu w roku.',
  '',
  '## Nadgodziny',
  '',
  'Nadgodziny rozlicza się w następnym miesiącu.',
].join('\n');

const settings = { chunkSize: 80, chunkOverlap: 0 };

describe('splitText — the section a chunk sits under', () => {
  it('gives Docling prose chunks their heading path', async () => {
    const chunks = await splitText({
      fileType: FileType.PDF,
      rawDocs: [{ pageContent: MARKDOWN, metadata: {} }],
      splitterSettings: settings,
      parsedWithDocling: true,
    });

    const byText = (needle: string) =>
      chunks.find((c) => c.pageContent.includes(needle))?.metadata?.sectionPath;
    expect(byText('dwadzieścia sześć')).toBe('Regulamin pracy > Urlopy');
    expect(byText('następnym miesiącu')).toBe('Regulamin pracy > Nadgodziny');
  });

  it('does the same for a Markdown file, which is how a version is re-indexed', async () => {
    const chunks = await splitText({
      fileType: FileType.MARKDOWN,
      rawDocs: [{ pageContent: MARKDOWN, metadata: {} }],
      splitterSettings: settings,
    });

    expect(
      chunks.find((c) => c.pageContent.includes('następnym miesiącu'))?.metadata
        ?.sectionPath,
    ).toBe('Regulamin pracy > Nadgodziny');
  });
});
