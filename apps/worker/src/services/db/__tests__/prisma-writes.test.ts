// The writes migrated to Prisma in ADR-40 step 3a. None of them had a test of
// the query itself — the two that were covered at all were mocked at the `db`
// boundary, so they passed regardless of what the query did.
//
// The cases worth having are the two translations that would corrupt data
// quietly rather than fail loudly: a Json column takes the value and not
// `JSON.stringify`, and absence is `Prisma.DbNull` and not `null`.

/* eslint-disable no-var */
var mockUserFileUpdateMany: jest.Mock;
var mockVersionCount: jest.Mock;
var mockVersionCreate: jest.Mock;
var mockVersionUpdateMany: jest.Mock;
var mockAiUsageCreate: jest.Mock;
var mockWarn: jest.Mock;
/* eslint-enable no-var */

jest.mock('../prisma', () => {
  mockUserFileUpdateMany = jest.fn();
  mockVersionCount = jest.fn();
  mockVersionCreate = jest.fn();
  mockVersionUpdateMany = jest.fn();
  mockAiUsageCreate = jest.fn();
  return {
    getPrisma: () => ({
      userFile: { updateMany: mockUserFileUpdateMany },
      documentVersion: {
        count: mockVersionCount,
        create: mockVersionCreate,
        updateMany: mockVersionUpdateMany,
      },
      aiUsage: { create: mockAiUsageCreate },
    }),
  };
});

jest.mock('../../logger', () => {
  mockWarn = jest.fn();
  return { logger: { warn: mockWarn, info: jest.fn(), error: jest.fn() } };
});

jest.mock('knex', () => ({
  __esModule: true,
  default: jest.fn(() => {
    const noop = jest.fn();
    return Object.assign(noop, { raw: jest.fn(), transaction: jest.fn() });
  }),
}));

import { Prisma } from '../../../../generated/prisma';
import { db } from '../db';

beforeEach(() => {
  mockUserFileUpdateMany.mockReset();
  mockVersionCount.mockReset();
  mockVersionCreate.mockReset();
  mockVersionUpdateMany.mockReset();
  mockAiUsageCreate.mockReset();
  mockWarn.mockReset();
});

describe('updateThumbnailKey', () => {
  const call = () =>
    db.updateThumbnailKey({
      where: { fileId: 'file-1', orgId: 'org-1' },
      data: { thumbnailS3Key: 'thumbs/file-1.webp' },
    });

  it('updates the file in that org and returns the row count', async () => {
    mockUserFileUpdateMany.mockResolvedValue({ count: 1 });

    await expect(call()).resolves.toBe(1);
    expect(mockUserFileUpdateMany).toHaveBeenCalledWith({
      where: { id: 'file-1', organizationId: 'org-1' },
      data: { thumbnailS3Key: 'thumbs/file-1.webp' },
    });
  });

  // The caller's contract: nothing matched is an error, not a silent no-op.
  // `updateMany` is used precisely to keep this message rather than Prisma's.
  it('throws naming the file and org when nothing matched', async () => {
    mockUserFileUpdateMany.mockResolvedValue({ count: 0 });

    await expect(call()).rejects.toThrow(/fileId=file-1.*orgId=org-1/s);
  });
});

describe('createInitialDocumentVersion', () => {
  const params = {
    documentId: 'doc-1',
    organizationId: 'org-1',
    content: '# Title',
    title: 'Title',
    authorId: 'user-1',
    ragScore: { overall: 4 } as Record<string, unknown> | null,
  };

  it('does nothing when the document already has a version', async () => {
    mockVersionCount.mockResolvedValue(1);

    await expect(db.createInitialDocumentVersion(params)).resolves.toBe(0);
    expect(mockVersionCreate).not.toHaveBeenCalled();
  });

  // knex counted by document_id alone. DocumentVersion is tenant-scoped, so
  // that read would trip the guard — and the row being inserted carries both
  // columns anyway.
  it('scopes the idempotency check by org as well as document', async () => {
    mockVersionCount.mockResolvedValue(0);

    await db.createInitialDocumentVersion(params);

    expect(mockVersionCount).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', organizationId: 'org-1' },
    });
  });

  it('seeds version 1 as the active UPLOAD version', async () => {
    mockVersionCount.mockResolvedValue(0);

    await expect(db.createInitialDocumentVersion(params)).resolves.toBe(1);
    expect(mockVersionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: 'doc-1',
        organizationId: 'org-1',
        versionNumber: 1,
        changeType: 'UPLOAD',
        isActive: true,
        authorId: 'user-1',
      }),
    });
  });

  // The one that would corrupt data silently: a stringified score is stored as
  // a JSON string literal, and every reader gets a quoted blob back.
  it('passes the rag score as an object, not as JSON text', async () => {
    mockVersionCount.mockResolvedValue(0);

    await db.createInitialDocumentVersion(params);

    const { data } = mockVersionCreate.mock.calls[0][0];
    expect(data.ragScore).toEqual({ overall: 4 });
    expect(typeof data.ragScore).toBe('object');
  });

  // DbNull is SQL NULL; JsonNull is the JSON value `null`. knex wrote SQL
  // NULL, so `rag_score IS NULL` has to keep matching.
  it('writes SQL NULL, not JSON null, when there is no score', async () => {
    mockVersionCount.mockResolvedValue(0);

    await db.createInitialDocumentVersion({ ...params, ragScore: null });

    const { data } = mockVersionCreate.mock.calls[0][0];
    expect(data.ragScore).toBe(Prisma.DbNull);
  });
});

describe('updateActiveDocumentVersionRagScore', () => {
  it('updates only the active version of that document in that org', async () => {
    mockVersionUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      db.updateActiveDocumentVersionRagScore({
        documentId: 'doc-1',
        orgId: 'org-1',
        ragScore: { overall: 5 },
      }),
    ).resolves.toBe(1);
    expect(mockVersionUpdateMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1', organizationId: 'org-1', isActive: true },
      data: { ragScore: { overall: 5 } },
    });
  });

  it('returns 0 when there is no active version, rather than throwing', async () => {
    mockVersionUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      db.updateActiveDocumentVersionRagScore({
        documentId: 'doc-1',
        orgId: 'org-1',
        ragScore: {},
      }),
    ).resolves.toBe(0);
  });
});

describe('trackAiUsage', () => {
  const params = {
    organizationId: 'org-1',
    step: 'EMBEDDINGS' as const,
    provider: 'litellm',
    model: 'cohere-embed',
    inputTokens: 10,
    outputTokens: 0,
    totalTokens: 10,
  };

  it('writes the usage row', async () => {
    mockAiUsageCreate.mockResolvedValue({});

    await db.trackAiUsage(params);

    expect(mockAiUsageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        step: 'EMBEDDINGS',
        inputTokens: 10,
        totalTokens: 10,
        estimatedCost: 0,
      }),
    });
  });

  // Token counts arrive from provider responses and are not always integers or
  // even positive; the column is an Int.
  it.each([
    [-5, 0],
    [3.7, 3],
    [Number.NaN, 0],
  ])('clamps %p input tokens to %p', async (given, expected) => {
    mockAiUsageCreate.mockResolvedValue({});

    await db.trackAiUsage({ ...params, inputTokens: given });

    expect(mockAiUsageCreate.mock.calls[0][0].data.inputTokens).toBe(expected);
  });

  it('writes SQL NULL when there is no metadata', async () => {
    mockAiUsageCreate.mockResolvedValue({});

    await db.trackAiUsage(params);

    expect(mockAiUsageCreate.mock.calls[0][0].data.metadata).toBe(
      Prisma.DbNull,
    );
  });

  it('passes metadata as an object', async () => {
    mockAiUsageCreate.mockResolvedValue({});

    await db.trackAiUsage({ ...params, metadata: { fileId: 'file-1' } });

    expect(mockAiUsageCreate.mock.calls[0][0].data.metadata).toEqual({
      fileId: 'file-1',
    });
  });

  // Usage tracking is telemetry. Losing a row is acceptable; failing an ingest
  // because telemetry failed is not.
  it('never throws when the insert fails', async () => {
    mockAiUsageCreate.mockRejectedValue(new Error('connection lost'));

    await expect(db.trackAiUsage(params)).resolves.toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });
});
