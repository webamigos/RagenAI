import type { JobContext } from '@ragenai/jobs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';

/**
 * C2 of spec 2026-09-26-rag-readiness-score-review: both paths that write
 * chunks write `metadata.diagnostics` for them, and neither can be failed by
 * it. The checks themselves are tested beside `document-diagnostics.ts`; this
 * is the wiring, which is the only place the parse path reaches them.
 */

const failDiagnostics = vi.hoisted(() => ({ value: false }));

vi.mock('../../services/document-diagnostics.js', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../services/document-diagnostics.js')
    >();
  return {
    ...actual,
    computeDocumentDiagnostics: vi.fn(
      (...args: Parameters<typeof actual.computeDocumentDiagnostics>) => {
        if (failDiagnostics.value) {
          throw new TypeError('unexpected chunk shape');
        }
        return actual.computeDocumentDiagnostics(...args);
      },
    ),
  };
});

const { runFileEmbeddings } = await import('../parse-and-embed.js');
const { reindexDocumentVersion } =
  await import('../reindex-document-version.js');
const { computeDocumentDiagnostics } =
  await import('../../services/document-diagnostics.js');

function context(activities: ReturnType<typeof createMockActivities>) {
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return ctx;
}

function diagnosticsPatches(
  activities: ReturnType<typeof createMockActivities>,
) {
  return activities.mergeFileMetadata.mock.calls
    .map(([arg]) => (arg as { patch: Record<string, unknown> }).patch)
    .filter((patch) => 'diagnostics' in patch)
    .map((patch) => patch.diagnostics);
}

function statusWrites(activities: ReturnType<typeof createMockActivities>) {
  return activities.updateEmbeddingStatus.mock.calls.map(
    ([arg]) => (arg as { status: string }).status,
  );
}

beforeEach(() => {
  failDiagnostics.value = false;
  vi.mocked(computeDocumentDiagnostics).mockClear();
});

describe('runFileEmbeddings — diagnostics', () => {
  it('writes the findings for the chunks it indexed', async () => {
    const activities = createMockActivities();
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'regulamin.pdf' }),
    );

    await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      context(activities),
    );

    const [diagnostics] = diagnosticsPatches(activities);
    expect(diagnostics).toMatchObject({
      version: 1,
      computedAt: expect.any(String),
      findings: expect.any(Array),
      stats: { chunkCount: 1 },
    });
    expect(activities.addDocumentsToVectorStore).toHaveBeenCalled();
  });

  it('records a Docling fallback as a finding', async () => {
    const activities = createMockActivities();
    activities.getDocumentParser.mockResolvedValue({
      parser: 'docling',
      strict: false,
    });
    activities.loadDocling.mockRejectedValue(new Error('docling is busy'));
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'regulamin.pdf' }),
    );

    await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      context(activities),
    );

    expect(vi.mocked(computeDocumentDiagnostics).mock.calls[0][2]).toEqual({
      parser: 'legacy',
      doclingExpected: true,
    });
    const [diagnostics] = diagnosticsPatches(activities) as {
      findings: { check: string }[];
    }[];
    expect(diagnostics.findings.map((f) => f.check)).toContain(
      'fallback-parser',
    );
  });

  it('does not call a deliberate legacy parser a fallback', async () => {
    const activities = createMockActivities();
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'regulamin.pdf' }),
    );

    await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      context(activities),
    );

    expect(vi.mocked(computeDocumentDiagnostics).mock.calls[0][2]).toEqual({
      parser: 'legacy',
      doclingExpected: false,
    });
  });

  it('completes the ingest when the checks throw, and clears the old findings', async () => {
    failDiagnostics.value = true;
    const activities = createMockActivities();
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'regulamin.pdf' }),
    );

    await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      context(activities),
    );

    expect(diagnosticsPatches(activities)).toEqual([null]);
    expect(statusWrites(activities)).toContain('COMPLETED');
    expect(statusWrites(activities)).not.toContain('FAILED');
  });

  it('completes the ingest when the write fails', async () => {
    const activities = createMockActivities();
    activities.mergeFileMetadata.mockImplementation(async (arg: unknown) => {
      if ('diagnostics' in (arg as { patch: object }).patch) {
        throw new Error('database unavailable');
      }
    });
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'regulamin.pdf' }),
    );

    await expect(
      runFileEmbeddings(
        { fileId: 'file-1', orgId: 'org-1' },
        context(activities),
      ),
    ).resolves.not.toThrow();
    expect(statusWrites(activities)).not.toContain('FAILED');
  });
});

describe('runFileEmbeddings — a file kept out of the index', () => {
  // Parsed, not indexed: the findings would describe chunks retrieval does
  // not hold. The old ones are cleared — the previous chunks were deleted.
  it.each([
    ['staged into Brain', { intake: 'brain' }, 'STAGED'],
    ['withdrawn from retrieval', { retrieval: 'withdrawn' }, 'WITHDRAWN'],
  ])('writes no findings for a file %s', async (_, metadata, status) => {
    const activities = createMockActivities();
    activities.getFileRecord.mockResolvedValue(
      makeUserFile({ fileName: 'regulamin.pdf', metadata }),
    );

    await runFileEmbeddings(
      { fileId: 'file-1', orgId: 'org-1' },
      context(activities),
    );

    expect(activities.addDocumentsToVectorStore).not.toHaveBeenCalled();
    expect(statusWrites(activities)).toContain(status);
    expect(computeDocumentDiagnostics).not.toHaveBeenCalled();
    expect(diagnosticsPatches(activities)).toEqual([null]);
  });
});

describe('reindexDocumentVersion — diagnostics', () => {
  const payload = {
    orgId: 'org-1',
    fileId: 'file-1',
    fileName: 'regulamin.md',
    projectId: 'proj-1',
    userId: 'user-1',
    documentId: 'doc-1',
  };

  it('writes findings for the re-indexed version text, with no parser to blame', async () => {
    const activities = createMockActivities();

    await expect(
      reindexDocumentVersion(payload, context(activities)),
    ).resolves.toBe('file-1');

    expect(vi.mocked(computeDocumentDiagnostics).mock.calls[0][2]).toEqual({
      parser: 'version-text',
      doclingExpected: false,
    });
    const [diagnostics] = diagnosticsPatches(activities);
    expect(diagnostics).toMatchObject({ version: 1, stats: { chunkCount: 1 } });
  });

  it('keeps an indexed version COMPLETED when the checks throw', async () => {
    failDiagnostics.value = true;
    const activities = createMockActivities();

    await expect(
      reindexDocumentVersion(payload, context(activities)),
    ).resolves.toBe('file-1');

    expect(diagnosticsPatches(activities)).toEqual([null]);
    expect(statusWrites(activities)).toEqual(['STARTED', 'COMPLETED']);
  });

  it('writes nothing for a file kept out of the index', async () => {
    const activities = createMockActivities();
    activities.getFileRecord.mockResolvedValue({
      id: 'file-1',
      organizationId: 'org-1',
      metadata: { intake: 'brain' },
      embeddingStatus: 'STAGED',
    });

    await reindexDocumentVersion(payload, context(activities));

    expect(diagnosticsPatches(activities)).toEqual([]);
  });
});
