import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import type { Document } from '../../types/Document.js';
import { reindexDocumentVersion } from '../reindex-document-version.js';

/**
 * A version's text is new text — an edit or an applied suggestion can hold a
 * name the upload never had — so re-indexing it masks PII exactly as an
 * upload does: on the chunks, with the file's own policy.
 */
const payload = {
  orgId: 'org-1',
  fileId: 'file-1',
  fileName: 'umowa.md',
  projectId: 'proj-1',
  userId: 'user-1',
  documentId: 'doc-1',
};

function run(piiPolicy: 'NONE' | 'TOXIC_ONLY' | 'STRICT' = 'STRICT') {
  const activities = createMockActivities();
  activities.getDocumentContent.mockResolvedValue({
    content: '# Umowa\n\nZleceniobiorca: Jan Kowalski, PESEL 44051401359.',
    title: 'Umowa',
  });
  activities.getFileRecord.mockResolvedValue(
    makeUserFile({ piiPolicy, ownerId: 'owner-1' }),
  );
  activities.maskPii.mockImplementation(({ docs }: { docs: Document[] }) =>
    Promise.resolve(
      docs.map((d) => ({
        ...d,
        pageContent: d.pageContent
          .replace('Jan Kowalski', '<PERSON>')
          .replace('44051401359', '<PL_PESEL>'),
      })),
    ),
  );
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return { activities, done: reindexDocumentVersion(payload, ctx) };
}

describe('reindexDocumentVersion — PII', () => {
  it("masks the version's chunks with the file's policy before indexing them", async () => {
    const { activities, done } = run('STRICT');
    await done;

    const maskInput = activities.maskPii.mock.calls[0]![0] as {
      docs: Document[];
      piiPolicy: string;
      organizationId: string;
      userId: string | null;
    };
    expect(maskInput.piiPolicy).toBe('STRICT');
    expect(maskInput.organizationId).toBe('org-1');
    expect(maskInput.userId).toBe('owner-1');
    expect(maskInput.docs.map((d) => d.pageContent).join('')).toContain(
      'Jan Kowalski',
    );

    const indexed = activities.addDocumentsToVectorStore.mock.calls[0]![0] as {
      docs: Document[];
    };
    const text = indexed.docs.map((d) => d.pageContent).join('\n');
    expect(text).not.toContain('Jan Kowalski');
    expect(text).not.toContain('44051401359');
    expect(text).toContain('<PERSON>');
  });

  it('pairs each masked chunk with its own original for dual content', async () => {
    const { activities, done } = run();
    await done;

    const dual = activities.applyDualContentMode.mock.calls[0]![0] as {
      originalDocs: Document[];
      maskedDocs: Document[];
      orgId: string;
    };
    expect(dual.orgId).toBe('org-1');
    expect(dual.originalDocs).toHaveLength(dual.maskedDocs.length);
    expect(dual.originalDocs[0]!.pageContent).toContain('Jan Kowalski');
    expect(dual.maskedDocs[0]!.pageContent).toContain('<PERSON>');
  });

  it("stamps the chunks with the file's policy, not the default", async () => {
    const { activities, done } = run('NONE');
    await done;

    const prepared = activities.prepareMetadata.mock.calls[0]![0] as {
      fileRecord: { piiPolicy?: string };
    };
    expect(prepared.fileRecord.piiPolicy).toBe('NONE');
  });
});
