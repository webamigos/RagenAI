import { TestWorkflowEnvironment } from '@temporalio/testing';
import { WorkflowCoverage } from '@temporalio/nyc-test-coverage';
import {
  Runtime,
  DefaultLogger,
  type LogEntry,
  Worker,
} from '@temporalio/worker';
import { WorkflowFailedError } from '@temporalio/client';
import { FileType, EmbeddingStatus, ParsingStatus } from '../types/UserFile';
import type { UserFile } from '../types/UserFile';

let testEnv: TestWorkflowEnvironment;
const workflowCoverage = new WorkflowCoverage();

/**
 * These are not unit tests: each one starts a Temporal worker and runs a real
 * workflow against a time-skipping test environment. Jest's default 5s ceiling
 * is far too tight for that — measured idle, the tests take 384ms to 1742ms,
 * so the slowest has barely 3x of headroom.
 *
 * Under parallel load that headroom disappears. Running the suite alongside
 * the other workspaces' tests took it from 9s to 115s, and a test that
 * overruns is worse than slow: jest abandons the promise, so `worker.runUntil`
 * never settles, the worker is never shut down, and `afterAll` then fails with
 * `IllegalStateError: Cannot close connection while Workers hold a reference
 * to it` — which reads like a teardown bug rather than a timeout.
 *
 * 30s matches the explicit timeout already on `beforeAll` below, and leaves
 * roughly 17x on the slowest test. Do not lower it back to the default.
 */
jest.setTimeout(30_000);

beforeAll(async () => {
  Runtime.install({
    logger: new DefaultLogger('ERROR', (entry: LogEntry) =>
      console.log(`[${entry.level}]`, entry.message),
    ),
  });

  testEnv = await TestWorkflowEnvironment.createTimeSkipping();
}, 30_000);

afterAll(async () => {
  await testEnv?.teardown();
  workflowCoverage.mergeIntoGlobalCoverage();
});

// ---- helpers ----

function makeUserFile(overrides: Partial<UserFile> = {}): UserFile {
  return {
    id: 'file-1',
    organizationId: 'org-1',
    fileName: 'test.txt',
    fileSize: 100,
    fileType: FileType.TEXT,
    createdAt: null,
    updatedAt: null,
    metadata: null,
    documentId: null,
    projectId: 'proj-1',
    isUploaded: true,
    uploadedAt: null,
    parsingStatus: ParsingStatus.NOT_STARTED,
    parsingStartedAt: null,
    parsingCompletedAt: null,
    parsingFailedAt: null,
    embeddingStatus: EmbeddingStatus.NOT_STARTED,
    embeddingStartedAt: null,
    embeddingCompletedAt: null,
    embeddingFailedAt: null,
    isBinaryFile: false,
    ...overrides,
  };
}

function createMockActivities() {
  return {
    getDocumentParser: jest
      .fn()
      .mockResolvedValue({ parser: 'legacy', strict: false }),
    checkIsBinaryFile: jest.fn().mockResolvedValue(false),
    checkMimeType: jest
      .fn()
      .mockResolvedValue({ mime: 'application/pdf', ext: 'pdf' }),
    updateBinaryInfo: jest.fn().mockResolvedValue(undefined),
    updateExtensionAndMime: jest.fn().mockResolvedValue(undefined),
    updateFileType: jest.fn().mockResolvedValue(undefined),
    updateParsingStatus: jest.fn().mockResolvedValue(undefined),
    updateEmbeddingStatus: jest.fn().mockResolvedValue(undefined),
    updateFileSize: jest.fn().mockResolvedValue(undefined),
    loadPdf: jest
      .fn()
      .mockResolvedValue([{ pageContent: 'pdf content', metadata: {} }]),
    loadDocling: jest
      .fn()
      .mockResolvedValue([{ pageContent: 'docling content', metadata: {} }]),
    loadText: jest
      .fn()
      .mockResolvedValue([{ pageContent: 'text content', metadata: {} }]),
    loadSrt: jest
      .fn()
      .mockResolvedValue([{ pageContent: 'subtitle content', metadata: {} }]),
    loadEpub: jest
      .fn()
      .mockResolvedValue([{ pageContent: 'epub content', metadata: {} }]),
    loadWebsite: jest
      .fn()
      .mockResolvedValue([{ pageContent: 'website content', metadata: {} }]),
    splitText: jest.fn().mockImplementation(({ rawDocs }) => rawDocs),
    // Mock preserves the incoming chunk_type so tests can assert that
    // synthetic summary chunks survive into updatedDocs and are correctly
    // filtered out of createMarkdownDocument downstream.
    prepareMetadata: jest.fn().mockImplementation(({ docs }) =>
      docs.map(
        (
          d: { pageContent: string; metadata?: { chunk_type?: string } },
          i: number,
        ) => ({
          pageContent: d.pageContent,
          metadata: {
            id: i,
            ...(d.metadata?.chunk_type
              ? { chunk_type: d.metadata.chunk_type }
              : {}),
          },
          embedding: [],
        }),
      ),
    ),
    addDocumentsToVectorStore: jest.fn().mockResolvedValue({ inputTokens: 50 }),
    createMarkdownDocument: jest.fn().mockResolvedValue([{ id: 'doc-1' }]),
    bindFileWithDocument: jest.fn().mockResolvedValue(undefined),
    createInitialDocumentVersion: jest.fn().mockResolvedValue(undefined),
    deleteDocumentVectors: jest.fn().mockResolvedValue(undefined),
    sendSuccessNotification: jest.fn().mockResolvedValue(undefined),
    sendInfoNotification: jest.fn().mockResolvedValue(undefined),
    sendErrorNotification: jest.fn().mockResolvedValue(undefined),
    deleteFileFromTmp: jest.fn().mockResolvedValue(undefined),
    generateAndUploadThumbnail: jest
      .fn()
      .mockResolvedValue('org-1/thumbnails/pub-1.png'),
    updateThumbnailKey: jest.fn().mockResolvedValue(undefined),
    // Default to empty-string summary so existing tests' chunk-count
    // assumptions hold. Feature-specific tests override this mock.
    generateDocumentSummary: jest.fn().mockResolvedValue(''),
    // Phase 4b — pass-through sanitizer mock. Default returns rawDocs
    // unchanged so existing tests see the same docs as before; a
    // feature-specific test can override to simulate suspicious content.
    sanitizeDocuments: jest
      .fn()
      .mockImplementation(({ rawDocs }: { rawDocs: unknown[] }) =>
        Promise.resolve(rawDocs),
      ),
    // PII masking — pass-through by default so existing tests are unaffected.
    // Feature-specific tests can override to assert masking behaviour.
    maskPii: jest
      .fn()
      .mockImplementation(({ docs }: { docs: unknown[] }) =>
        Promise.resolve(docs),
      ),
    // Dual-content mode — pass-through by default so existing tests are unaffected.
    applyDualContentMode: jest
      .fn()
      .mockImplementation(({ maskedDocs }: { maskedDocs: unknown[] }) =>
        Promise.resolve(maskedDocs),
      ),
    mergeFileMetadata: jest.fn().mockResolvedValue(undefined),
    // Language detection — best-effort, so a null default keeps existing
    // tests' assertions unaffected (no fileRecord.language, no persisted tag).
    detectDocumentLanguage: jest.fn().mockResolvedValue(null),
    updateLanguage: jest.fn().mockResolvedValue(undefined),
    // RAG scoring — best-effort, same pattern as summary/language: a null
    // default means the workflow's `if (ragScore)` guard skips
    // mergeFileMetadata, so existing tests' assertions are unaffected.
    scoreDocumentForRag: jest.fn().mockResolvedValue(null),
    updatePageCount: jest.fn().mockResolvedValue(undefined),
    createFileRecord: jest.fn().mockResolvedValue([
      {
        id: 'file-1',
        file_name: 'test.pdf',
        organization_id: 'org-1',
        project_id: 'proj-1',
      },
    ]),
  };
}

async function runWorkflow<T>(
  workflowName: string,
  args: unknown[],
  activities: Record<string, jest.Mock>,
): Promise<T> {
  const { client, nativeConnection } = testEnv;
  const taskQueue = `test-${Date.now()}-${Math.random()}`;

  const workerOptions = workflowCoverage.augmentWorkerOptions({
    connection: nativeConnection,
    taskQueue,
    workflowsPath: require.resolve('../workflows'),
    activities,
  });

  const worker = await Worker.create(workerOptions);

  return worker.runUntil(
    client.workflow.execute(workflowName, {
      args,
      workflowId: `test-${Date.now()}-${Math.random()}`,
      taskQueue,
    }),
  ) as Promise<T>;
}

function getWorkflowFailureCause(err: unknown): string {
  if (err instanceof WorkflowFailedError && err.cause) {
    return String(err.cause.message);
  }
  return err instanceof Error ? err.message : String(err);
}

// ---- runFileEmbeddings workflow ----

describe('runFileEmbeddings workflow', () => {
  it('processes a TEXT file end-to-end', async () => {
    const activities = createMockActivities();
    const payload = makeUserFile({ fileName: 'readme.txt' });

    const result = await runWorkflow<string>(
      'runFileEmbeddings',
      [payload],
      activities,
    );

    expect(result).toBe('success! file-1, readme.txt');

    expect(activities.checkIsBinaryFile).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        fileId: 'file-1',
        fileName: 'readme.txt',
      }),
    );
    expect(activities.updateBinaryInfo).toHaveBeenCalledWith(
      expect.objectContaining({ isBinary: false }),
    );

    // Text file -> loadText
    expect(activities.loadText).toHaveBeenCalled();
    expect(activities.loadPdf).not.toHaveBeenCalled();

    // Parsing status lifecycle
    expect(activities.updateParsingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: ParsingStatus.STARTED }),
    );
    expect(activities.updateParsingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: ParsingStatus.COMPLETED }),
    );

    // Embedding lifecycle
    expect(activities.updateEmbeddingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: EmbeddingStatus.STARTED }),
    );
    expect(activities.updateEmbeddingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: EmbeddingStatus.COMPLETED }),
    );

    // Text files get a markdown document created
    expect(activities.createMarkdownDocument).toHaveBeenCalled();
    expect(activities.bindFileWithDocument).toHaveBeenCalled();
    expect(activities.sendSuccessNotification).toHaveBeenCalled();

    // Cleanup
    expect(activities.deleteFileFromTmp).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        fileId: 'file-1',
        fileName: 'readme.txt',
      }),
    );
  });

  it('processes a PDF file with binary detection', async () => {
    const activities = createMockActivities();
    activities.checkIsBinaryFile.mockResolvedValue(true);
    activities.checkMimeType.mockResolvedValue({
      mime: 'application/pdf',
      ext: 'pdf',
    });

    const payload = makeUserFile({
      fileName: 'document.pdf',
      fileType: FileType.PDF,
    });

    const result = await runWorkflow<string>(
      'runFileEmbeddings',
      [payload],
      activities,
    );

    expect(result).toContain('success');
    expect(activities.checkMimeType).toHaveBeenCalled();
    expect(activities.loadPdf).toHaveBeenCalled();
    expect(activities.loadText).not.toHaveBeenCalled();

    // PDF files don't get createMarkdownDocument
    expect(activities.createMarkdownDocument).not.toHaveBeenCalled();

    // Thumbnail generation attempted
    expect(activities.generateAndUploadThumbnail).toHaveBeenCalled();
    expect(activities.updateThumbnailKey).toHaveBeenCalled();
  });

  it('fails when the initial S3 download (binary check) fails', async () => {
    const activities = createMockActivities();
    activities.checkIsBinaryFile.mockRejectedValue(new Error('S3 error'));

    const payload = makeUserFile({
      organizationId: 'org-1',
    });

    try {
      await runWorkflow('runFileEmbeddings', [payload], activities);
      fail('Expected workflow to throw');
    } catch (err) {
      // Activity retries exhaust → the workflow sees the failure
      expect(err).toBeInstanceOf(WorkflowFailedError);
    }
  });

  it('sets parsing status to FAILED when loader throws', async () => {
    const activities = createMockActivities();
    activities.loadText.mockRejectedValue(new Error('Parse error'));

    const payload = makeUserFile();

    try {
      await runWorkflow('runFileEmbeddings', [payload], activities);
      fail('Expected workflow to throw');
    } catch (err) {
      expect(getWorkflowFailureCause(err)).toContain('Document parsing failed');
    }

    expect(activities.updateParsingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: ParsingStatus.FAILED }),
    );
  });

  it('sets embedding status to FAILED when vector store throws', async () => {
    const activities = createMockActivities();
    activities.addDocumentsToVectorStore.mockRejectedValue(
      new Error('Vector store error'),
    );

    const payload = makeUserFile();

    try {
      await runWorkflow('runFileEmbeddings', [payload], activities);
      fail('Expected workflow to throw');
    } catch (err) {
      expect(getWorkflowFailureCause(err)).toContain('Embedding failed');
    }

    expect(activities.updateEmbeddingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: EmbeddingStatus.FAILED }),
    );
  });

  it('continues when thumbnail generation fails', async () => {
    const activities = createMockActivities();
    activities.checkIsBinaryFile.mockResolvedValue(true);
    activities.checkMimeType.mockResolvedValue({
      mime: 'application/pdf',
      ext: 'pdf',
    });
    activities.generateAndUploadThumbnail.mockRejectedValue(
      new Error('Thumbnail error'),
    );

    const payload = makeUserFile({
      fileName: 'doc.pdf',
      fileType: FileType.PDF,
    });

    const result = await runWorkflow<string>(
      'runFileEmbeddings',
      [payload],
      activities,
    );

    // Workflow should still succeed
    expect(result).toContain('success');
    expect(activities.updateThumbnailKey).not.toHaveBeenCalled();
  });

  it('prepends summary as a chunk and merges metadata when summary is generated', async () => {
    const activities = createMockActivities();
    activities.generateDocumentSummary.mockResolvedValue(
      'Summary of the document.',
    );

    const payload = makeUserFile({ fileName: 'report.txt' });

    await runWorkflow('runFileEmbeddings', [payload], activities);

    // Summary activity was called with the concatenated document text
    expect(activities.generateDocumentSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org-1',
        fileName: 'report.txt',
        documentText: expect.any(String),
      }),
    );

    // The summary was prepended as a chunk_type: 'summary' doc before
    // prepareMetadata received the list
    const prepareCallArgs = activities.prepareMetadata.mock.calls[0][0];
    expect(prepareCallArgs.docs[0]).toEqual({
      pageContent: 'Summary of the document.',
      metadata: { chunk_type: 'summary' },
    });

    // Metadata was merged after successful embedding
    expect(activities.mergeFileMetadata).toHaveBeenCalledWith({
      fileId: 'file-1',
      orgId: 'org-1',
      patch: { summary: 'Summary of the document.' },
    });

    // createMarkdownDocument MUST NOT contain the synthetic summary text —
    // the summary is for retrieval only, not for the persisted doc body
    // (ADR-16). Verify filtering works for text file types that hit this path.
    expect(activities.createMarkdownDocument).toHaveBeenCalled();
    const createDocArgs = activities.createMarkdownDocument.mock.calls[0][0];
    expect(createDocArgs.content).not.toContain('Summary of the document.');
  });

  it('does not prepend a summary chunk or merge metadata when summary is empty', async () => {
    const activities = createMockActivities();
    activities.generateDocumentSummary.mockResolvedValue('');

    const payload = makeUserFile({ fileName: 'readme.txt' });

    await runWorkflow('runFileEmbeddings', [payload], activities);

    // First chunk into prepareMetadata is the raw loader output, not a
    // synthetic summary chunk
    const prepareCallArgs = activities.prepareMetadata.mock.calls[0][0];
    expect(prepareCallArgs.docs[0].metadata?.chunk_type).toBeUndefined();

    expect(activities.mergeFileMetadata).not.toHaveBeenCalled();
  });

  it('continues ingest when generateDocumentSummary throws (defense-in-depth)', async () => {
    const activities = createMockActivities();
    // Simulate a Temporal-level failure that the activity's internal
    // try/catch cannot catch (task timeout, worker crash, retry exhaustion).
    activities.generateDocumentSummary.mockRejectedValue(
      new Error('activity task timed out'),
    );

    const payload = makeUserFile({ fileName: 'readme.txt' });

    const result = await runWorkflow<string>(
      'runFileEmbeddings',
      [payload],
      activities,
    );

    // Workflow still succeeds despite the summary rejection — the outer
    // try/catch in the workflow swallows it so retrieval-side ingest is
    // never blocked by summary failures (ADR-16).
    expect(result).toContain('success');

    // Ingest proceeds: prepareMetadata and addDocumentsToVectorStore fire
    expect(activities.prepareMetadata).toHaveBeenCalled();
    expect(activities.addDocumentsToVectorStore).toHaveBeenCalled();

    // Since summary is empty (rejected), no synthetic chunk and no
    // metadata merge
    const prepareCallArgs = activities.prepareMetadata.mock.calls[0][0];
    expect(prepareCallArgs.docs[0].metadata?.chunk_type).toBeUndefined();
    expect(activities.mergeFileMetadata).not.toHaveBeenCalled();
  });

  it('fails on unsupported MIME type', async () => {
    const activities = createMockActivities();
    activities.checkIsBinaryFile.mockResolvedValue(true);
    activities.checkMimeType.mockResolvedValue({
      mime: 'video/mp4',
      ext: 'mp4',
    });

    const payload = makeUserFile({ fileName: 'video.mp4' });

    try {
      await runWorkflow('runFileEmbeddings', [payload], activities);
      fail('Expected workflow to throw');
    } catch (err) {
      expect(getWorkflowFailureCause(err)).toContain('Unsupported mime type');
    }
  });

  it('passes pre-masking originalDocs and masked maskedDocs to applyDualContentMode', async () => {
    const activities = createMockActivities();

    // loadText returns a document with known original content
    activities.loadText.mockResolvedValue([
      { pageContent: 'original text', metadata: { source: 'test' } },
    ]);

    // maskPii returns a document with masked content
    activities.maskPii.mockImplementation(() =>
      Promise.resolve([
        { pageContent: '[MASKED]', metadata: { source: 'test' } },
      ]),
    );

    // Capture the arguments passed to applyDualContentMode
    let capturedArgs: {
      originalDocs?: Array<{ pageContent: string }>;
      maskedDocs?: Array<{ pageContent: string }>;
    } = {};
    activities.applyDualContentMode.mockImplementation(
      (args: {
        originalDocs: Array<{ pageContent: string }>;
        maskedDocs: Array<{ pageContent: string }>;
      }) => {
        capturedArgs = args;
        return Promise.resolve(args.maskedDocs);
      },
    );

    const payload = makeUserFile({ fileName: 'sensitive.txt' });
    await runWorkflow('runFileEmbeddings', [payload], activities);

    expect(activities.applyDualContentMode).toHaveBeenCalledTimes(1);
    // originalDocs must contain the pre-masking content
    expect(capturedArgs.originalDocs?.[0].pageContent).toBe('original text');
    // maskedDocs must contain the post-masking content
    expect(capturedArgs.maskedDocs?.[0].pageContent).toBe('[MASKED]');
  });
});

// ---- scrapeWebsite workflow ----

describe('scrapeWebsite workflow', () => {
  it('scrapes and embeds a website successfully', async () => {
    const activities = createMockActivities();

    const result = await runWorkflow<string>(
      'scrapeWebsite',
      [
        {
          url: 'https://example.com',
          mode: 'scrape',
          orgId: 'org-1',
          projectId: 'proj-1',
          userId: 'user-1',
        },
      ],
      activities,
    );

    expect(result).toContain('Success');
    expect(result).toContain('https://example.com');

    // File record created
    expect(activities.createFileRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'https://example.com | scrape',
        fileType: FileType.URL,
      }),
    );

    // Website loaded
    expect(activities.loadWebsite).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com',
        mode: 'scrape',
      }),
    );

    // Document created and bound
    expect(activities.createMarkdownDocument).toHaveBeenCalled();
    expect(activities.bindFileWithDocument).toHaveBeenCalled();

    // Embedding lifecycle
    expect(activities.updateEmbeddingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: EmbeddingStatus.STARTED }),
    );
    expect(activities.updateEmbeddingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: EmbeddingStatus.COMPLETED }),
    );

    // Success notification
    expect(activities.sendSuccessNotification).toHaveBeenCalled();
  });

  it('fails on invalid crawl mode', async () => {
    const activities = createMockActivities();

    try {
      await runWorkflow(
        'scrapeWebsite',
        [
          {
            url: 'https://example.com',
            mode: 'invalid-mode',
            orgId: 'org-1',
            projectId: null,
          },
        ],
        activities,
      );
      fail('Expected workflow to throw');
    } catch (err) {
      expect(getWorkflowFailureCause(err)).toContain('Invalid crawl mode');
    }
  });

  it('sets parsing status to FAILED when scraping fails', async () => {
    const activities = createMockActivities();
    activities.loadWebsite.mockRejectedValue(new Error('Scrape failed'));

    try {
      await runWorkflow(
        'scrapeWebsite',
        [
          {
            url: 'https://example.com',
            mode: 'scrape',
            orgId: 'org-1',
            projectId: null,
          },
        ],
        activities,
      );
      fail('Expected workflow to throw');
    } catch (err) {
      expect(getWorkflowFailureCause(err)).toContain('Website parsing failed');
    }

    expect(activities.updateParsingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: ParsingStatus.FAILED }),
    );
  });

  it('sets embedding status to FAILED when embedding fails', async () => {
    const activities = createMockActivities();
    activities.addDocumentsToVectorStore.mockRejectedValue(
      new Error('Embedding error'),
    );

    try {
      await runWorkflow(
        'scrapeWebsite',
        [
          {
            url: 'https://example.com',
            mode: 'scrape',
            orgId: 'org-1',
            projectId: null,
          },
        ],
        activities,
      );
      fail('Expected workflow to throw');
    } catch (err) {
      expect(getWorkflowFailureCause(err)).toContain('Embedding failed');
    }

    expect(activities.updateEmbeddingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: EmbeddingStatus.FAILED }),
    );
  });
});

// ---- reindexDocumentVersion workflow ----

describe('reindexDocumentVersion workflow', () => {
  const payload = {
    orgId: 'org-1',
    fileId: 'file-1',
    fileName: 'readme.txt',
    projectId: 'proj-1',
    userId: 'user-1',
    content: '# Restored\n\nThe rolled-back text.',
  };

  it('clears the previous chunks before writing the new ones', async () => {
    const activities = createMockActivities();

    const result = await runWorkflow<string>(
      'reindexDocumentVersion',
      [payload],
      activities,
    );

    expect(result).toBe('file-1');
    // Qdrant point ids are random uuids, so an upsert cannot replace an earlier
    // ingest — without the delete, the rolled-back version's chunks stay in the
    // collection and retrieval cites text the user reverted.
    expect(activities.deleteDocumentVectors).toHaveBeenCalledWith({
      orgId: 'org-1',
      fileId: 'file-1',
    });
    expect(
      activities.deleteDocumentVectors.mock.invocationCallOrder[0],
    ).toBeLessThan(
      activities.addDocumentsToVectorStore.mock.invocationCallOrder[0],
    );
  });

  it('embeds the version text and never reads the stored file', async () => {
    const activities = createMockActivities();

    await runWorkflow('reindexDocumentVersion', [payload], activities);

    expect(activities.splitText).toHaveBeenCalledWith(
      expect.objectContaining({
        rawDocs: [{ pageContent: payload.content, metadata: {} }],
      }),
    );
    // The whole reason this workflow exists: runFileEmbeddings re-parses the
    // stored file, which still holds the original upload.
    expect(activities.checkIsBinaryFile).not.toHaveBeenCalled();
    expect(activities.loadText).not.toHaveBeenCalled();
  });

  it('marks the embedding failed when the re-index breaks', async () => {
    const activities = createMockActivities();
    activities.addDocumentsToVectorStore.mockRejectedValue(
      new Error('qdrant down'),
    );

    await expect(
      runWorkflow('reindexDocumentVersion', [payload], activities),
    ).rejects.toThrow();

    // The delete already went through, so the document may have no chunks at
    // all. FAILED is visible in the UI and re-running recovers it.
    expect(activities.updateEmbeddingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: EmbeddingStatus.FAILED }),
    );
  });

  it('refuses empty content rather than emptying the index', async () => {
    const activities = createMockActivities();

    await expect(
      runWorkflow(
        'reindexDocumentVersion',
        [{ ...payload, content: '   ' }],
        activities,
      ),
    ).rejects.toThrow();

    expect(activities.deleteDocumentVectors).not.toHaveBeenCalled();
  });
});
