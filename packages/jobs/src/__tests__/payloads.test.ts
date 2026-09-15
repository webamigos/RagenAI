import { describe, expect, it } from 'vitest';

import { toRunFileEmbeddingsPayload, type IngestFileRow } from '../payloads';

const row: IngestFileRow = {
  id: 'file-1',
  organizationId: 'org-1',
  fileName: 'report.pdf',
  fileSize: 1234,
  fileType: 'PDF',
  createdAt: new Date('2026-03-15T08:00:00Z'),
  updatedAt: new Date('2026-03-15T08:05:00Z'),
  metadata: { driveFileId: 'drive-1' },
  documentId: null,
  projectId: 'proj-1',
  isUploaded: true,
  uploadedAt: new Date('2026-03-15T08:01:00Z'),
  parsingStatus: 'COMPLETED',
  parsingStartedAt: new Date('2026-03-15T08:02:00Z'),
  parsingCompletedAt: new Date('2026-03-15T08:03:00Z'),
  parsingFailedAt: null,
  embeddingStatus: 'COMPLETED',
  embeddingStartedAt: new Date('2026-03-15T08:04:00Z'),
  embeddingCompletedAt: new Date('2026-03-15T08:05:00Z'),
  embeddingFailedAt: null,
  piiPolicy: 'STRICT',
  isBinaryFile: true,
  fileExtension: 'pdf',
  fileMimeType: 'application/pdf',
  thumbnailS3Key: null,
  sourceFileId: null,
  folderId: 'folder-1',
  pageCount: 12,
  language: 'pol',
};

describe('toRunFileEmbeddingsPayload', () => {
  it('converts every timestamp to an ISO string', () => {
    const payload = toRunFileEmbeddingsPayload(row);

    // All nine, not the seven a producer remembered: `createdAt` and
    // `updatedAt` are the two that were left as `Date` at one call site and
    // converted at another.
    expect(payload).toMatchObject({
      createdAt: '2026-03-15T08:00:00.000Z',
      updatedAt: '2026-03-15T08:05:00.000Z',
      uploadedAt: '2026-03-15T08:01:00.000Z',
      parsingStartedAt: '2026-03-15T08:02:00.000Z',
      parsingCompletedAt: '2026-03-15T08:03:00.000Z',
      embeddingStartedAt: '2026-03-15T08:04:00.000Z',
      embeddingCompletedAt: '2026-03-15T08:05:00.000Z',
    });
  });

  it('keeps an absent timestamp null rather than inventing one', () => {
    const payload = toRunFileEmbeddingsPayload(row);

    expect(payload.parsingFailedAt).toBeNull();
    expect(payload.embeddingFailedAt).toBeNull();
  });

  it('carries the columns the pipeline reads', () => {
    expect(toRunFileEmbeddingsPayload(row)).toMatchObject({
      id: 'file-1',
      organizationId: 'org-1',
      fileName: 'report.pdf',
      fileType: 'PDF',
      metadata: { driveFileId: 'drive-1' },
      isBinaryFile: true,
      fileExtension: 'pdf',
      pageCount: 12,
      language: 'pol',
    });
  });

  it("carries the row's own PII policy, which a re-embed must not silently drop", () => {
    expect(toRunFileEmbeddingsPayload(row).piiPolicy).toBe('STRICT');
  });

  it('lets a caller override what the row does not know', () => {
    const payload = toRunFileEmbeddingsPayload(row, {
      organizationSlug: 'acme',
      userEmail: 'someone@example.com',
      requestId: 'reembed-abc',
      piiPolicy: 'STRICT',
    });

    expect(payload).toMatchObject({
      organizationSlug: 'acme',
      userEmail: 'someone@example.com',
      requestId: 'reembed-abc',
      piiPolicy: 'STRICT',
    });
  });

  it('lets an override win over the row, which is how a Drive sync sends the size it just fetched', () => {
    const payload = toRunFileEmbeddingsPayload(row, {
      fileSize: 999,
      fileName: 'renamed.md',
    });

    expect(payload.fileSize).toBe(999);
    expect(payload.fileName).toBe('renamed.md');
  });
});
