import { vi, type Mock } from 'vitest';

import {
  FileType,
  EmbeddingStatus,
  ParsingStatus,
} from '../../types/UserFile.js';
import type { UserFile } from '../../types/UserFile.js';

/**
 * The activity stubs every suite that runs a real handler needs, in one place.
 *
 * They were local to `workflow.spec.ts` until the D1 integration suite needed
 * the same set: that suite runs the same handlers against a real Redis, and a
 * second copy of this table would drift the moment an activity is added —
 * silently, because a handler asking for an unregistered activity fails with a
 * message about wiring rather than about the activity's absence here.
 *
 * Deliberately not under a `*.spec.ts` name: this file is collected by nothing.
 */

// ---- helpers ----

export function makeUserFile(overrides: Partial<UserFile> = {}): UserFile {
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
    ownerId: null,
    piiPolicy: 'TOXIC_ONLY',
    ...overrides,
  };
}

export function createMockActivities() {
  return {
    getDocumentParser: vi
      .fn()
      .mockResolvedValue({ parser: 'legacy', strict: false }),
    checkIsBinaryFile: vi.fn().mockResolvedValue(false),
    checkMimeType: vi
      .fn()
      .mockResolvedValue({ mime: 'application/pdf', ext: 'pdf' }),
    updateBinaryInfo: vi.fn().mockResolvedValue(undefined),
    updateExtensionAndMime: vi.fn().mockResolvedValue(undefined),
    updateFileType: vi.fn().mockResolvedValue(undefined),
    updateParsingStatus: vi.fn().mockResolvedValue(undefined),
    updateEmbeddingStatus: vi.fn().mockResolvedValue(undefined),
    updateFileSize: vi.fn().mockResolvedValue(undefined),
    loadPdf: vi
      .fn()
      .mockResolvedValue([{ pageContent: 'pdf content', metadata: {} }]),
    loadDocling: vi
      .fn()
      .mockResolvedValue([{ pageContent: 'docling content', metadata: {} }]),
    loadText: vi
      .fn()
      .mockResolvedValue([{ pageContent: 'text content', metadata: {} }]),
    loadSrt: vi
      .fn()
      .mockResolvedValue([{ pageContent: 'subtitle content', metadata: {} }]),
    loadEpub: vi
      .fn()
      .mockResolvedValue([{ pageContent: 'epub content', metadata: {} }]),
    loadWebsite: vi
      .fn()
      .mockResolvedValue([{ pageContent: 'website content', metadata: {} }]),
    splitText: vi.fn().mockImplementation(({ rawDocs }) => rawDocs),
    // Mock preserves the incoming chunk_type so tests can assert that
    // synthetic summary chunks survive into updatedDocs and are correctly
    // filtered out of createMarkdownDocument downstream.
    prepareMetadata: vi.fn().mockImplementation(({ docs }) =>
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
    addDocumentsToVectorStore: vi.fn().mockResolvedValue({ inputTokens: 50 }),
    createMarkdownDocument: vi.fn().mockResolvedValue([{ id: 'doc-1' }]),
    bindFileWithDocument: vi.fn().mockResolvedValue(undefined),
    createInitialDocumentVersion: vi.fn().mockResolvedValue(undefined),
    deleteDocumentVectors: vi.fn().mockResolvedValue(undefined),
    sendSuccessNotification: vi.fn().mockResolvedValue(undefined),
    sendInfoNotification: vi.fn().mockResolvedValue(undefined),
    sendErrorNotification: vi.fn().mockResolvedValue(undefined),
    deleteFileFromTmp: vi.fn().mockResolvedValue(undefined),
    generateAndUploadThumbnail: vi
      .fn()
      .mockResolvedValue('org-1/thumbnails/pub-1.png'),
    updateThumbnailKey: vi.fn().mockResolvedValue(undefined),
    // Default to empty-string summary so existing tests' chunk-count
    // assumptions hold. Feature-specific tests override this mock.
    generateDocumentSummary: vi.fn().mockResolvedValue(''),
    // Phase 4b — pass-through sanitizer mock. Default returns rawDocs
    // unchanged so existing tests see the same docs as before; a
    // feature-specific test can override to simulate suspicious content.
    sanitizeDocuments: vi
      .fn()
      .mockImplementation(({ rawDocs }: { rawDocs: unknown[] }) =>
        Promise.resolve(rawDocs),
      ),
    // PII masking — pass-through by default so existing tests are unaffected.
    // Feature-specific tests can override to assert masking behaviour.
    maskPii: vi
      .fn()
      .mockImplementation(({ docs }: { docs: unknown[] }) =>
        Promise.resolve(docs),
      ),
    // Dual-content mode — pass-through by default so existing tests are unaffected.
    applyDualContentMode: vi
      .fn()
      .mockImplementation(({ maskedDocs }: { maskedDocs: unknown[] }) =>
        Promise.resolve(maskedDocs),
      ),
    mergeFileMetadata: vi.fn().mockResolvedValue(undefined),
    // Language detection — best-effort, so a null default keeps existing
    // tests' assertions unaffected (no fileRecord.language, no persisted tag).
    detectDocumentLanguage: vi.fn().mockResolvedValue(null),
    updateLanguage: vi.fn().mockResolvedValue(undefined),
    // RAG scoring — best-effort, same pattern as summary/language: a null
    // default means the workflow's `if (ragScore)` guard skips
    // mergeFileMetadata, so existing tests' assertions are unaffected.
    scoreDocumentForRag: vi.fn().mockResolvedValue(null),
    updatePageCount: vi.fn().mockResolvedValue(undefined),
    createFileRecord: vi.fn().mockResolvedValue([
      {
        id: 'file-1',
        file_name: 'test.pdf',
        organization_id: 'org-1',
        project_id: 'proj-1',
      },
    ]),
    updateWorkflowId: vi.fn().mockResolvedValue(undefined),
    // The cancellation checkpoint. Every ingest calls it several times, so it
    // has to be registered even by tests that never cancel — an unregistered
    // activity fails the run rather than being skipped.
    isIngestCancelled: vi.fn().mockResolvedValue(false),
    // Both halves of C4 read rather than receive: the re-index reads the
    // document it was told to embed, and the ingest reads its own row.
    getDocumentContent: vi.fn().mockResolvedValue({
      content: '# Restored\n\nThe rolled-back text.',
      title: 'Restored',
    }),
    getFileRecord: vi.fn(),

    // ---- the five handlers `workflow.spec.ts` never ran ----
    //
    // Added for the D1 integration suite, which enqueues all eight jobs. They
    // sit here rather than in that suite so there is one answer to "what does
    // a handler get when an activity is stubbed", and so the next activity
    // added to a handler is missing from one table instead of two.
    generateDocumentContent: vi
      .fn()
      .mockResolvedValue([{ heading: 'Summary', body: 'Generated.' }]),
    createDocxFile: vi.fn().mockResolvedValue('ZG9jeA=='),
    uploadToGoogleDrive: vi.fn().mockResolvedValue({
      fileId: 'drive-1',
      fileUrl: 'https://drive.example/drive-1',
      fileName: 'Acme — Workshop Summary.docx',
    }),
    optimizeDocumentSuggestions: vi.fn().mockResolvedValue(undefined),
    syncRagScoreToVersion: vi.fn().mockResolvedValue(undefined),
    deleteStaleDemoThreads: vi.fn().mockResolvedValue({
      skipped: false,
      threadsDeleted: 2,
      messagesDeleted: 7,
    }),
    restoreDemoOrganizationRestrictions: vi
      .fn()
      .mockResolvedValue({ restored: true }),
    pruneDocumentRetrievals: vi.fn().mockResolvedValue({
      organizationsScanned: 3,
      retrievalsDeleted: 11,
      olderThan: '2026-06-18T00:00:00.000Z',
    }),
  };
}

/**
 * A cancellation checkpoint that starts answering "cancelled" only once some
 * other activity has run.
 *
 * Cancellation used to arrive as a signal, so the tests below had to race one
 * into a specific window — delaying an activity, awaiting a notify, and hoping
 * the signal beat the workflow's own round-trip. It is a database row now, so
 * the window is expressed directly: cancel from the checkpoint that follows
 * `after`, deterministically, with no timing in it.
 */
export function cancelledAfter(after: Mock): Mock {
  return vi
    .fn()
    .mockImplementation(() => Promise.resolve(after.mock.calls.length > 0));
}
