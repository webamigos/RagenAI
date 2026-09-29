import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import type { Document } from '../../types/Document.js';
import { runFileEmbeddings } from '../parse-and-embed.js';

/**
 * PII masking runs on the chunks, not on the parsed document.
 *
 * Masking the document before the split missed what the splitter adds — a
 * Docling table chunk is built from `metadata.doclingTables`, not from the
 * prose — and in `dual_content` mode it gave every chunk the whole document as
 * its "original", because the splitter copies the raw document's metadata onto
 * each chunk cut from it.
 */
const RAW: Document[] = [
  {
    pageContent: 'Umowa z Janem Kowalskim. Tabela poniżej.',
    metadata: { doclingTables: [{ rows: [['Jan Kowalski', '600 700 800']] }] },
  },
];

const CHUNKS: Document[] = [
  { pageContent: 'Umowa z Janem Kowalskim.', metadata: {} },
  { pageContent: 'Tabela poniżej.', metadata: {} },
  {
    pageContent: '| Jan Kowalski | 600 700 800 |',
    metadata: { chunk_type: 'table' },
  },
];

const mask = (text: string) =>
  text
    .replace(/Jan(em)? Kowalski(m)?/g, '<PERSON>')
    .replace(/\d{3} \d{3} \d{3}/g, '<PHONE>');

function run() {
  const activities = createMockActivities();
  activities.loadText.mockResolvedValue(RAW);
  activities.splitText.mockResolvedValue(CHUNKS);
  activities.maskPii.mockImplementation(({ docs }: { docs: Document[] }) =>
    Promise.resolve(
      docs.map((d) => ({ ...d, pageContent: mask(d.pageContent) })),
    ),
  );
  activities.applyDualContentMode.mockImplementation(
    ({
      originalDocs,
      maskedDocs,
    }: {
      originalDocs: Document[];
      maskedDocs: Document[];
    }) =>
      Promise.resolve(
        maskedDocs.map((d, i) => ({
          ...d,
          metadata: {
            ...d.metadata,
            pii_mode: 'dual_content',
            content_original: `enc(${originalDocs[i]!.pageContent})`,
          },
        })),
      ),
  );
  activities.checkMimeType.mockResolvedValue({
    mime: 'text/plain',
    ext: 'txt',
  });
  activities.getFileRecord.mockResolvedValue(
    makeUserFile({ fileName: 'umowa.txt' }),
  );
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return {
    activities,
    done: runFileEmbeddings({ fileId: 'f', orgId: 'o' }, ctx),
  };
}

describe('runFileEmbeddings — PII masking on the chunks', () => {
  it('splits the unmasked document, then masks every chunk, table chunks included', async () => {
    const { activities, done } = run();
    await done;

    const splitInput = activities.splitText.mock.calls[0]![0] as {
      rawDocs: Document[];
    };
    expect(splitInput.rawDocs[0]!.pageContent).toBe(RAW[0]!.pageContent);

    const maskInput = activities.maskPii.mock.calls[0]![0] as {
      docs: Document[];
    };
    expect(maskInput.docs.map((d) => d.pageContent)).toEqual(
      CHUNKS.map((c) => c.pageContent),
    );
  });

  it("gives each chunk its own original in dual_content mode, not the document's", async () => {
    const { activities, done } = run();
    await done;

    const dual = activities.applyDualContentMode.mock.calls[0]![0] as {
      originalDocs: Document[];
      maskedDocs: Document[];
    };
    expect(dual.originalDocs.map((d) => d.pageContent)).toEqual(
      CHUNKS.map((c) => c.pageContent),
    );
    expect(dual.maskedDocs).toHaveLength(dual.originalDocs.length);
    expect(dual.maskedDocs[2]!.pageContent).toBe('| <PERSON> | <PHONE> |');
  });

  it('indexes the masked chunks, each carrying its own encrypted original', async () => {
    const { activities, done } = run();
    await done;

    const prepared = activities.prepareMetadata.mock.calls[0]![0] as {
      docs: Document[];
    };
    const body = prepared.docs.filter(
      (d) => d.metadata?.chunk_type !== 'summary',
    );
    expect(body.map((d) => d.pageContent)).toEqual([
      'Umowa z <PERSON>.',
      'Tabela poniżej.',
      '| <PERSON> | <PHONE> |',
    ]);
    expect(body.map((d) => d.metadata?.content_original)).toEqual([
      'enc(Umowa z Janem Kowalskim.)',
      'enc(Tabela poniżej.)',
      'enc(| Jan Kowalski | 600 700 800 |)',
    ]);
  });

  it('never hands the summary unmasked text', async () => {
    const { activities, done } = run();
    await done;

    const summaryInput = activities.generateDocumentSummary.mock
      .calls[0]![0] as {
      documentText: string;
    };
    expect(summaryInput.documentText).not.toContain('Kowalski');
    expect(summaryInput.documentText).not.toContain('600 700 800');
  });
});
