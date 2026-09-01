/* eslint-disable no-var */
var mockCreateInitialDocumentVersion: jest.Mock;
var mockWarn: jest.Mock;
var mockDebug: jest.Mock;
/* eslint-enable no-var */

jest.mock('../../../services/db/db', () => ({
  db: {
    createInitialDocumentVersion: (...args: unknown[]) =>
      mockCreateInitialDocumentVersion(...args),
  },
}));

jest.mock('../../../services/logger', () => ({
  logger: {
    warn: (...args: unknown[]) => mockWarn(...args),
    debug: (...args: unknown[]) => mockDebug(...args),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

import { createInitialDocumentVersion } from '../create-initial-document-version';

const input = {
  documentId: 'doc-1',
  organizationId: 'org-1',
  content: 'ingested text',
  title: 'report.pdf',
  authorId: 'user-1',
  ragScore: { total: 64 },
};

describe('createInitialDocumentVersion', () => {
  beforeEach(() => {
    mockCreateInitialDocumentVersion = jest.fn().mockResolvedValue(1);
    mockWarn = jest.fn();
    mockDebug = jest.fn();
  });

  it('seeds v1 with the ingest score attached', async () => {
    await createInitialDocumentVersion(input);

    expect(mockCreateInitialDocumentVersion).toHaveBeenCalledWith(input);
  });

  it('treats an already-versioned document as a replay, not an error', async () => {
    mockCreateInitialDocumentVersion.mockResolvedValue(0);

    await createInitialDocumentVersion(input);

    // Temporal replays and retries this workflow; a second v1 would collide
    // with the (document_id, version_number) unique constraint.
    expect(mockDebug).toHaveBeenCalled();
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('does not fail the ingest when the version cannot be written', async () => {
    mockCreateInitialDocumentVersion.mockRejectedValue(new Error('deadlock'));

    // A document with no history is still a usable document, and the backfill
    // script can add v1 later. Failing ingest over it would be the worse
    // outcome.
    await expect(createInitialDocumentVersion(input)).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });
});
