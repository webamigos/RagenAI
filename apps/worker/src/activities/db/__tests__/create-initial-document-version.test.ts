/* eslint-disable no-var */
var mockCreateInitialDocumentVersion: Mock;
var mockWarn: Mock;
var mockDebug: Mock;
/* eslint-enable no-var */

vi.mock('../../../services/db/db.js', () => ({
  db: {
    createInitialDocumentVersion: (...args: unknown[]) =>
      mockCreateInitialDocumentVersion(...args),
  },
}));

vi.mock('../../../services/logger.js', () => ({
  logger: {
    warn: (...args: unknown[]) => mockWarn(...args),
    debug: (...args: unknown[]) => mockDebug(...args),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import type { Mock } from 'vitest';
import { createInitialDocumentVersion } from '../create-initial-document-version.js';

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
    mockCreateInitialDocumentVersion = vi.fn().mockResolvedValue(1);
    mockWarn = vi.fn();
    mockDebug = vi.fn();
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

  it('rethrows so Temporal retries a transient failure', async () => {
    mockCreateInitialDocumentVersion.mockRejectedValue(new Error('deadlock'));

    // Swallowing here would spend the retry budget on nothing: the workflow is
    // the layer that decides an exhausted budget is survivable, not this one.
    await expect(createInitialDocumentVersion(input)).rejects.toThrow(
      'deadlock',
    );
    expect(mockWarn).toHaveBeenCalled();
  });
});
