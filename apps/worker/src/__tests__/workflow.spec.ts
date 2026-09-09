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
import {
  cancelEmbeddingSignal,
  embeddingStateQuery,
} from '../workflows/signals';

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
    updateWorkflowId: jest.fn().mockResolvedValue(undefined),
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

/**
 * Like runWorkflow, but hands back the running worker + handle instead of
 * awaiting completion, so a test can signal/query mid-flight before letting
 * the workflow finish.
 */
async function startWorkflowForSignaling(
  workflowName: string,
  args: unknown[],
  activities: Record<string, jest.Mock>,
) {
  const { client, nativeConnection } = testEnv;
  const taskQueue = `test-${Date.now()}-${Math.random()}`;

  const workerOptions = workflowCoverage.augmentWorkerOptions({
    connection: nativeConnection,
    taskQueue,
    workflowsPath: require.resolve('../workflows'),
    activities,
  });

  const worker = await Worker.create(workerOptions);
  const handle = await client.workflow.start(workflowName, {
    args,
    workflowId: `test-${Date.now()}-${Math.random()}`,
    taskQueue,
  });

  return { worker, handle };
}

function getWorkflowFailureCause(err: unknown): string {
  if (err instanceof WorkflowFailedError && err.cause) {
    return String(err.cause.message);
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * Permanent/validation failures are thrown via `ApplicationFailure.nonRetryable`
 * so a workflow-start retry policy (there is none today, but nothing stops one
 * being added later) never burns time retrying a condition that can't change.
 * `nonRetryable` survives onto `WorkflowFailedError.cause` as a plain property.
 */
function getWorkflowFailureNonRetryable(err: unknown): boolean | undefined {
  if (err instanceof WorkflowFailedError && err.cause) {
    return (err.cause as { nonRetryable?: boolean }).nonRetryable;
  }
  return undefined;
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

  describe('the page count that feeds usage limits', () => {
    // Since Docling became the default parser every PDF's page count was
    // `ceil(totalChars / 3000)` — a fixed density assumption standing in for a
    // number the parser knew. It overcounts dense text and undercounts a page
    // that is mostly table or image, and it is what limits are charged
    // against.
    const runPdf = async (
      activities: ReturnType<typeof createMockActivities>,
    ) => {
      activities.checkIsBinaryFile.mockResolvedValue(true);
      activities.checkMimeType.mockResolvedValue({
        mime: 'application/pdf',
        ext: 'pdf',
      });
      // The shared mock defaults to the legacy parser; this is the Docling
      // path, which is what production runs and where the estimate lived.
      activities.getDocumentParser.mockResolvedValue({
        parser: 'docling',
        strict: false,
      });
      await runWorkflow<string>(
        'runFileEmbeddings',
        [makeUserFile({ fileName: 'document.pdf', fileType: FileType.PDF })],
        activities,
      );
      return activities.updatePageCount.mock.calls[0]?.[0];
    };

    it("uses the parser's count when it reported one", async () => {
      const activities = createMockActivities();
      // Twelve real pages whose text would have estimated to one.
      activities.loadDocling.mockResolvedValue([
        { pageContent: 'short', metadata: { doclingPageCount: 12 } },
      ]);

      await expect(runPdf(activities)).resolves.toMatchObject({
        pageCount: 12,
      });
    });

    it('falls back to the estimate when the format has no pages', async () => {
      // Markdown, plain text and CSV are not paginated; Docling reports
      // nothing and the estimate is the only honest answer left.
      const activities = createMockActivities();
      activities.loadDocling.mockResolvedValue([
        { pageContent: 'x'.repeat(6001), metadata: {} },
      ]);

      await expect(runPdf(activities)).resolves.toMatchObject({
        pageCount: 3,
      });
    });

    it('does not treat a zero count as an answer', async () => {
      const activities = createMockActivities();
      activities.loadDocling.mockResolvedValue([
        { pageContent: 'x'.repeat(3001), metadata: { doclingPageCount: 0 } },
      ]);

      await expect(runPdf(activities)).resolves.toMatchObject({
        pageCount: 2,
      });
    });
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
      // The file's mime type won't change on retry — retrying would just
      // burn the activity's full retry budget for a guaranteed failure.
      expect(getWorkflowFailureNonRetryable(err)).toBe(true);
    }
  });

  it('fails PPTX without Docling as nonRetryable, with FAILED recorded (not swallowed by the outer rewrap)', async () => {
    // Regression test: the parsing catch block used to rewrap every error —
    // including ones already thrown as ApplicationFailure.nonRetryable
    // inside the try — into a generic, retryable-looking message. This is
    // the one case (PPTX with no Docling parser) that already threw
    // nonRetryable before that fix, so it's the case that proves it.
    const activities = createMockActivities();
    activities.checkIsBinaryFile.mockResolvedValue(true);
    activities.checkMimeType.mockResolvedValue({
      mime: 'application/vnd.ms-powerpoint',
      ext: 'ppt',
    });

    const payload = makeUserFile({ fileName: 'slides.ppt' });

    try {
      await runWorkflow('runFileEmbeddings', [payload], activities);
      fail('Expected workflow to throw');
    } catch (err) {
      expect(getWorkflowFailureCause(err)).toBe(
        'PPTX files require DOCUMENT_PARSER=docling',
      );
      expect(getWorkflowFailureNonRetryable(err)).toBe(true);
    }

    expect(activities.updateParsingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: ParsingStatus.FAILED }),
    );
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

  describe('cancellation', () => {
    it('cancels before parsing when the signal arrives first, marking ParsingStatus.CANCELLED', async () => {
      const activities = createMockActivities();
      // Delays the first activity so the test has a real window to send the
      // signal and query before checkCancelled()'s first checkpoint runs.
      activities.checkIsBinaryFile.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(false), 100)),
      );

      const payload = makeUserFile({ fileName: 'readme.txt' });
      const { worker, handle } = await startWorkflowForSignaling(
        'runFileEmbeddings',
        [payload],
        activities,
      );

      const result = await worker.runUntil(async () => {
        await handle.signal(cancelEmbeddingSignal);
        // The query handler is live as soon as the signal handler is
        // registered — well before the workflow actually acts on the flag.
        const state = await handle.query(embeddingStateQuery);
        expect(state).toEqual({ stage: 'parsing', cancelled: true });

        return handle.result().catch((err: unknown) => err);
      });

      expect(result).toBeInstanceOf(WorkflowFailedError);
      expect(getWorkflowFailureCause(result)).toContain(
        'Embedding cancelled by user',
      );
      expect(activities.updateParsingStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: ParsingStatus.CANCELLED }),
      );
      // Proves this landed at the pre-parsing checkpoint, not after a partial
      // parse — cancellation is cooperative, not preemptive.
      expect(activities.loadText).not.toHaveBeenCalled();
    });

    it('cancels between resolving the parser config and the expensive loader, marking CANCELLED not FAILED', async () => {
      // getDocumentParser runs inside the parsing try block, right before
      // the Docling/legacy loader dispatch — signaling exactly when it's
      // called exercises the checkpoint added *inside* that try, and proves
      // the catch there rethrows the cancellation instead of overwriting
      // CANCELLED with FAILED.
      const activities = createMockActivities();
      let notifyParserResolved: () => void;
      const parserResolved = new Promise<void>((resolve) => {
        notifyParserResolved = resolve;
      });
      activities.getDocumentParser.mockImplementation(() => {
        // Notifying the moment the activity *starts* isn't enough on its
        // own: the workflow doesn't resume past `await getDocumentParser()`
        // until its result round-trips back through the Temporal server, so
        // a signal sent right after the notify can still race that
        // round-trip. Delaying the activity's own resolution gives the
        // signal a real window to land first regardless of that timing.
        notifyParserResolved();
        return new Promise((resolve) =>
          setTimeout(() => resolve({ parser: 'legacy', strict: false }), 50),
        );
      });

      const payload = makeUserFile({ fileName: 'readme.txt' });
      const { worker, handle } = await startWorkflowForSignaling(
        'runFileEmbeddings',
        [payload],
        activities,
      );

      const result = await worker.runUntil(async () => {
        await parserResolved;
        await handle.signal(cancelEmbeddingSignal);
        return handle.result().catch((err: unknown) => err);
      });

      expect(result).toBeInstanceOf(WorkflowFailedError);
      expect(getWorkflowFailureCause(result)).toContain(
        'Embedding cancelled by user',
      );
      expect(getWorkflowFailureNonRetryable(result)).toBe(true);
      // CANCELLED, not FAILED — the catch block must not have overwritten
      // checkCancelled()'s own status update.
      expect(activities.updateParsingStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: ParsingStatus.CANCELLED }),
      );
      expect(activities.updateParsingStatus).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: ParsingStatus.FAILED }),
      );
      // Never reached the actual (expensive) parse.
      expect(activities.loadText).not.toHaveBeenCalled();
    });

    it('lets an already-completed parse finish, then cancels before embedding starts', async () => {
      const activities = createMockActivities();
      // generateDocumentSummary runs after parsing has fully completed and
      // before the embedding checkpoint — signaling exactly when it's called
      // (rather than after a fixed delay) deterministically lands the signal
      // in that window regardless of how fast the mocked activities resolve.
      let notifySummaryCalled: () => void;
      const summaryCalled = new Promise<void>((resolve) => {
        notifySummaryCalled = resolve;
      });
      activities.generateDocumentSummary.mockImplementation(() => {
        notifySummaryCalled();
        return Promise.resolve('');
      });

      const payload = makeUserFile({ fileName: 'readme.txt' });
      const { worker, handle } = await startWorkflowForSignaling(
        'runFileEmbeddings',
        [payload],
        activities,
      );

      const result = await worker.runUntil(async () => {
        await summaryCalled;
        await handle.signal(cancelEmbeddingSignal);
        return handle.result().catch((err: unknown) => err);
      });

      expect(result).toBeInstanceOf(WorkflowFailedError);
      // Parsing already succeeded — cooperative cancellation does not undo it.
      expect(activities.updateParsingStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: ParsingStatus.COMPLETED }),
      );
      // Caught at the embedding checkpoint, before the expensive/costly call.
      expect(activities.updateEmbeddingStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: EmbeddingStatus.CANCELLED }),
      );
      expect(activities.updateEmbeddingStatus).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: EmbeddingStatus.STARTED }),
      );
      expect(activities.addDocumentsToVectorStore).not.toHaveBeenCalled();
    });
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
      expect(getWorkflowFailureNonRetryable(err)).toBe(true);
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

  it('cancels before scraping when the signal arrives first', async () => {
    const activities = createMockActivities();
    // Delays the first activity — called before the checkCancelled()
    // checkpoint — so there is a real window to signal before it runs.
    activities.createFileRecord.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve([
                {
                  id: 'file-1',
                  file_name: 'test.pdf',
                  organization_id: 'org-1',
                  project_id: 'proj-1',
                },
              ]),
            100,
          ),
        ),
    );

    const { worker, handle } = await startWorkflowForSignaling(
      'scrapeWebsite',
      [
        {
          url: 'https://example.com',
          mode: 'scrape',
          orgId: 'org-1',
          projectId: 'proj-1',
        },
      ],
      activities,
    );

    const result = await worker.runUntil(async () => {
      await handle.signal(cancelEmbeddingSignal);
      return handle.result().catch((err: unknown) => err);
    });

    expect(result).toBeInstanceOf(WorkflowFailedError);
    expect(getWorkflowFailureCause(result)).toContain(
      'Embedding cancelled by user',
    );
    expect(activities.updateParsingStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: ParsingStatus.CANCELLED }),
    );
    expect(activities.loadWebsite).not.toHaveBeenCalled();
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

  it('clears a stale stored language when the new content is undetermined', async () => {
    const activities = createMockActivities();
    // Simulate a previously-detected language ('und' → null) now that the
    // rolled-back content is too short/ambiguous for franc to classify.
    activities.detectDocumentLanguage.mockResolvedValue(null);

    await runWorkflow('reindexDocumentVersion', [payload], activities);

    // Must persist null (not skip the call) — otherwise the prior version's
    // language tag would wrongly survive onto content it no longer describes.
    expect(activities.updateLanguage).toHaveBeenCalledWith({
      fileId: 'file-1',
      orgId: 'org-1',
      language: null,
    });
  });

  it('does not touch the stored language when detection itself fails', async () => {
    const activities = createMockActivities();
    activities.detectDocumentLanguage.mockRejectedValue(
      new Error('franc blew up'),
    );

    await runWorkflow('reindexDocumentVersion', [payload], activities);

    // A transient detection failure must not overwrite whatever language tag
    // is already stored with null.
    expect(activities.updateLanguage).not.toHaveBeenCalled();
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

    try {
      await runWorkflow(
        'reindexDocumentVersion',
        [{ ...payload, content: '   ' }],
        activities,
      );
      fail('Expected workflow to throw');
    } catch (err) {
      // Empty content won't become non-empty on retry.
      expect(getWorkflowFailureNonRetryable(err)).toBe(true);
    }

    expect(activities.deleteDocumentVectors).not.toHaveBeenCalled();
  });
});
