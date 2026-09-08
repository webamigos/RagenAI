import { randomBytes } from 'node:crypto';
import { encryptContent } from '@ragenai/crypto';
import type { Document } from '../../types/Document';
import { mockQdrantInstance } from '../../__mocks__/@qdrant/js-client-rest';

// ---- hoisted mock refs (var to avoid TDZ with jest.mock hoisting) ----

/* eslint-disable no-var */
var mockGetEncryptedPiiDek: jest.Mock;
var mockTrackAiUsage: jest.Mock;
var mockIsEncryptionConfigured: jest.Mock;
var mockDecryptDataKey: jest.Mock;
var mockEmbedMany: jest.Mock;
var mockWithLangfuseTrace: jest.Mock;
var mockGetEmbeddingModelForOrg: jest.Mock;
/* eslint-enable no-var */

jest.mock('../../services/db/db', () => ({
  db: {
    getEncryptedPiiDek: (...args: unknown[]) => mockGetEncryptedPiiDek(...args),
    trackAiUsage: (...args: unknown[]) => mockTrackAiUsage(...args),
  },
}));

jest.mock('@ragenai/crypto', () => ({
  // Partial: this module also takes encryptContent/decryptContent from
  // the package, and a full mock would stub the envelope it is testing.
  ...jest.requireActual<typeof import('@ragenai/crypto')>('@ragenai/crypto'),
  isEncryptionConfigured: (...args: unknown[]) =>
    mockIsEncryptionConfigured(...args),
  getKeyProvider: jest.fn(() => ({
    decryptDataKey: (...args: unknown[]) => mockDecryptDataKey(...args),
  })),
}));

jest.mock('ai', () => ({
  embedMany: (...args: unknown[]) => mockEmbedMany(...args),
}));

jest.mock('../../services/llm', () => ({
  getEmbeddingModelForOrg: (...args: unknown[]) =>
    mockGetEmbeddingModelForOrg(...args),
}));

jest.mock('../../services/langfuse-trace', () => ({
  withLangfuseTrace: (_opts: unknown, fn: () => unknown) =>
    mockWithLangfuseTrace(_opts, fn),
}));

jest.mock('../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { qdrantService } from '../qdrant';
import { logger } from '../logger';

function makeDoc(
  content: string,
  meta: Record<string, unknown> = {},
): Document {
  return { pageContent: content, metadata: meta };
}

describe('qdrantService.addDocuments — dual_content embedding', () => {
  const testDek = randomBytes(32);

  beforeEach(() => {
    jest.clearAllMocks();

    // Reinitialise mock functions
    mockGetEncryptedPiiDek = jest.fn().mockResolvedValue(null);
    mockTrackAiUsage = jest.fn().mockResolvedValue(undefined);
    mockIsEncryptionConfigured = jest.fn().mockReturnValue(false);
    mockDecryptDataKey = jest.fn().mockResolvedValue(testDek);
    mockGetEmbeddingModelForOrg = jest.fn().mockResolvedValue('mock-model');
    mockWithLangfuseTrace = jest.fn().mockImplementation((_opts, fn) => fn());
    mockEmbedMany = jest
      .fn()
      .mockResolvedValue({ embeddings: [[0.1, 0.2]], usage: { tokens: 10 } });

    // Reset the shared Qdrant client singleton between tests by clearing the
    // module-level `client` / `clientPromise` via mock instance reset
    mockQdrantInstance.collectionExists.mockResolvedValue({ exists: true });
    mockQdrantInstance.createCollection.mockResolvedValue(undefined);
    mockQdrantInstance.createPayloadIndex.mockResolvedValue(undefined);
    mockQdrantInstance.upsert.mockResolvedValue(undefined);
  });

  it('embeds masked text when encryption is not configured', async () => {
    mockIsEncryptionConfigured.mockReturnValue(false);

    const maskedText = 'Jan <PERSON> PESEL <ID>';
    const encryptedOriginal = encryptContent(
      'Jan Kowalski PESEL 12345',
      testDek,
    );
    const docs = [
      makeDoc(maskedText, {
        pii_mode: 'dual_content',
        content_original: encryptedOriginal,
      }),
    ];

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    expect(mockGetEncryptedPiiDek).not.toHaveBeenCalled();
    expect(mockDecryptDataKey).not.toHaveBeenCalled();
    const embeddedTexts = mockEmbedMany.mock.calls[0][0].values;
    expect(embeddedTexts).toEqual([maskedText]);
  });

  it('embeds masked text when no DEK is stored in DB', async () => {
    mockIsEncryptionConfigured.mockReturnValue(true);
    mockGetEncryptedPiiDek.mockResolvedValue(null);

    const maskedText = 'Jan <PERSON> PESEL <ID>';
    const encryptedOriginal = encryptContent(
      'Jan Kowalski PESEL 12345',
      testDek,
    );
    const docs = [
      makeDoc(maskedText, {
        pii_mode: 'dual_content',
        content_original: encryptedOriginal,
      }),
    ];

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    expect(mockDecryptDataKey).not.toHaveBeenCalled();
    const embeddedTexts = mockEmbedMany.mock.calls[0][0].values;
    expect(embeddedTexts).toEqual([maskedText]);
  });

  it('embeds decrypted original text in dual_content mode when DEK is available', async () => {
    mockIsEncryptionConfigured.mockReturnValue(true);
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');
    mockDecryptDataKey.mockResolvedValue(testDek);

    const originalText = 'Jan Kowalski PESEL 80010112345';
    const maskedText = 'Jan <PERSON> PESEL <ID>';
    const encryptedOriginal = encryptContent(originalText, testDek);

    const docs = [
      makeDoc(maskedText, {
        pii_mode: 'dual_content',
        content_original: encryptedOriginal,
      }),
    ];

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    expect(mockGetEncryptedPiiDek).toHaveBeenCalledWith('org-1');
    expect(mockDecryptDataKey).toHaveBeenCalledWith('enc-dek-base64');
    const embeddedTexts = mockEmbedMany.mock.calls[0][0].values;
    expect(embeddedTexts).toEqual([originalText]);
  });

  it('stores masked pageContent in Qdrant payload, not the original', async () => {
    mockIsEncryptionConfigured.mockReturnValue(true);
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');
    mockDecryptDataKey.mockResolvedValue(testDek);

    const originalText = 'Jan Kowalski PESEL 80010112345';
    const maskedText = 'Jan <PERSON> PESEL <ID>';
    const encryptedOriginal = encryptContent(originalText, testDek);

    const docs = [
      makeDoc(maskedText, {
        pii_mode: 'dual_content',
        content_original: encryptedOriginal,
      }),
    ];

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    const upsertCall = mockQdrantInstance.upsert.mock.calls[0];
    const points = upsertCall[1].points;
    expect(points[0].payload.content).toBe(maskedText);
    expect(points[0].payload.pageContent).toBe(maskedText);
  });

  it('fetches DEK only once for a batch containing dual_content and normal docs', async () => {
    mockIsEncryptionConfigured.mockReturnValue(true);
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');
    mockDecryptDataKey.mockResolvedValue(testDek);
    mockEmbedMany.mockResolvedValue({
      embeddings: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      usage: { tokens: 20 },
    });

    const encryptedOriginal = encryptContent('original text', testDek);
    const docs = [
      makeDoc('masked text', {
        pii_mode: 'dual_content',
        content_original: encryptedOriginal,
      }),
      makeDoc('plain chunk with no pii', {}),
    ];

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    expect(mockGetEncryptedPiiDek).toHaveBeenCalledTimes(1);
    expect(mockDecryptDataKey).toHaveBeenCalledTimes(1);
  });

  it('falls back to masked text and logs a warning when decryption fails', async () => {
    mockIsEncryptionConfigured.mockReturnValue(true);
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');
    mockDecryptDataKey.mockResolvedValue(testDek);

    const maskedText = 'Jan <PERSON> PESEL <ID>';
    const docs = [
      makeDoc(maskedText, {
        pii_mode: 'dual_content',
        content_original: 'not-valid-base64-encrypted-content',
      }),
    ];

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    const embeddedTexts = mockEmbedMany.mock.calls[0][0].values;
    expect(embeddedTexts).toEqual([maskedText]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org-1' }),
      expect.stringContaining('failed to decrypt content_original'),
    );
  });

  it('skips DEK fetch when no docs have dual_content pii_mode', async () => {
    mockIsEncryptionConfigured.mockReturnValue(true);

    const docs = [makeDoc('plain chunk', { file_id: 'f1' })];
    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    expect(mockGetEncryptedPiiDek).not.toHaveBeenCalled();
    expect(mockDecryptDataKey).not.toHaveBeenCalled();
  });

  it('truncates decrypted original text to MAX_EMBEDDING_TEXT_CHARS when it exceeds the limit', async () => {
    const MAX_EMBEDDING_TEXT_CHARS = 2000;

    mockIsEncryptionConfigured.mockReturnValue(true);
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');
    mockDecryptDataKey.mockResolvedValue(testDek);

    const longOriginalText = 'A'.repeat(MAX_EMBEDDING_TEXT_CHARS + 10);
    const maskedText = 'masked <PERSON> text';
    const encryptedOriginal = encryptContent(longOriginalText, testDek);

    const docs = [
      makeDoc(maskedText, {
        pii_mode: 'dual_content',
        content_original: encryptedOriginal,
      }),
    ];

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    const embeddedTexts = mockEmbedMany.mock.calls[0][0].values;
    expect(embeddedTexts[0]).toHaveLength(MAX_EMBEDDING_TEXT_CHARS);
    expect(embeddedTexts[0]).toBe(
      longOriginalText.slice(0, MAX_EMBEDDING_TEXT_CHARS),
    );
    expect(embeddedTexts[0]).not.toBe(maskedText);
  });
});

/**
 * Batching lives in @ragenai/rag-core's prepareEmbeddingBatches, but the
 * mapping from batched embeddings back onto Qdrant points is this file's job:
 * `embeddings[i]` has to line up with `docs[i]` after the batches are
 * concatenated. Nothing caught a mis-alignment before these tests.
 */
describe('qdrantService.addDocuments — batching', () => {
  const EMBED_BATCH_SIZE = 96;
  const MAX_EMBEDDING_TEXT_CHARS = 2000;

  /** Texts sent to the provider, flattened back into document order. */
  const embeddedTexts = (): string[] =>
    mockEmbedMany.mock.calls.flatMap((call) => call[0].values);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEncryptedPiiDek = jest.fn().mockResolvedValue(null);
    mockTrackAiUsage = jest.fn().mockResolvedValue(undefined);
    mockIsEncryptionConfigured = jest.fn().mockReturnValue(false);
    mockDecryptDataKey = jest.fn().mockResolvedValue(randomBytes(32));
    mockGetEmbeddingModelForOrg = jest.fn().mockResolvedValue('mock-model');
    mockWithLangfuseTrace = jest.fn().mockImplementation((_opts, fn) => fn());
    // One distinct vector per text, so a mis-mapping is visible rather than
    // hidden behind identical values.
    mockEmbedMany = jest.fn().mockImplementation(({ values }) => ({
      embeddings: values.map((v: string) => [v.length, v.charCodeAt(6) || 0]),
      usage: { tokens: values.length },
    }));
    mockQdrantInstance.collectionExists.mockResolvedValue({ exists: true });
    mockQdrantInstance.createCollection.mockResolvedValue(undefined);
    mockQdrantInstance.createPayloadIndex.mockResolvedValue(undefined);
    mockQdrantInstance.upsert.mockResolvedValue(undefined);
  });

  it('splits more than one provider batch worth of documents', async () => {
    const docs = Array.from({ length: EMBED_BATCH_SIZE + 30 }, (_, i) =>
      makeDoc(`chunk-${i}`),
    );

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    expect(mockEmbedMany).toHaveBeenCalledTimes(2);
    expect(mockEmbedMany.mock.calls[0][0].values).toHaveLength(
      EMBED_BATCH_SIZE,
    );
    expect(mockEmbedMany.mock.calls[1][0].values).toHaveLength(30);
  });

  it('assigns each embedding to the point for its own document', async () => {
    const docs = Array.from({ length: 200 }, (_, i) => makeDoc(`chunk-${i}`));

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    expect(embeddedTexts()).toEqual(docs.map((d) => d.pageContent));

    // Upserts are batched separately from embeddings — BATCH_SIZE (100 points
    // per upsert) is a different limit than EMBED_BATCH_SIZE (96 texts per
    // embed call), so the points arrive across several calls.
    const points = mockQdrantInstance.upsert.mock.calls.flatMap(
      (call) => call[1].points,
    );
    expect(points).toHaveLength(200);
    points.forEach((point: { vector: Record<string, number[]> }, i: number) => {
      const text = docs[i].pageContent;
      expect(point.vector.dense).toEqual([
        text.length,
        text.charCodeAt(6) || 0,
      ]);
    });
  });

  it('truncates an oversized document that sits in a later batch', async () => {
    const docs = Array.from({ length: EMBED_BATCH_SIZE + 5 }, (_, i) =>
      makeDoc(i === EMBED_BATCH_SIZE + 2 ? 'B'.repeat(3000) : `chunk-${i}`),
    );

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    const oversized = embeddedTexts()[EMBED_BATCH_SIZE + 2];
    expect(oversized).toHaveLength(MAX_EMBEDDING_TEXT_CHARS);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ originalLength: 3000 }),
      expect.stringContaining('Truncating'),
    );
  });

  it('sums token usage across every batch', async () => {
    const docs = Array.from({ length: 150 }, (_, i) => makeDoc(`chunk-${i}`));

    await qdrantService.addDocuments({ orgId: 'org-1', docs });

    expect(mockTrackAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ totalTokens: 150, inputTokens: 150 }),
    );
  });
});
