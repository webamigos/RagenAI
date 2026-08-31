import { randomBytes } from 'node:crypto';
import { decryptContent } from '../../../utils/crypto/pii-encryption';
import type { Document } from '../../../types/Document';

/* eslint-disable no-var */
var mockGetPiiIngestionMode: jest.Mock;
var mockGetEncryptedPiiDek: jest.Mock;
var mockDecryptDataKey: jest.Mock;
var mockIsEncryptionConfigured: jest.Mock;
/* eslint-enable no-var */

jest.mock('../../../services/db/db', () => ({
  db: {
    getPiiIngestionMode: (...args: unknown[]) =>
      mockGetPiiIngestionMode(...args),
    getEncryptedPiiDek: (...args: unknown[]) => mockGetEncryptedPiiDek(...args),
  },
}));

jest.mock('../../../utils/crypto/key-provider', () => ({
  getKeyProvider: jest.fn(() => ({
    decryptDataKey: (...args: unknown[]) => mockDecryptDataKey(...args),
  })),
  isEncryptionConfigured: (...args: unknown[]) =>
    mockIsEncryptionConfigured(...args),
  resetKeyProviderForTests: jest.fn(),
}));

jest.mock('../../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { applyDualContentMode } from '../apply-dual-content-mode';

function makeDoc(
  content: string,
  meta: Record<string, unknown> = {},
): Document {
  return { pageContent: content, metadata: meta };
}

describe('applyDualContentMode', () => {
  const testDek = randomBytes(32);

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPiiIngestionMode = jest.fn();
    mockGetEncryptedPiiDek = jest.fn();
    mockDecryptDataKey = jest.fn();
    mockIsEncryptionConfigured = jest.fn();
    mockIsEncryptionConfigured.mockReturnValue(true);
    mockDecryptDataKey.mockResolvedValue(testDek);
  });

  it('returns masked docs unchanged in destructive mode', async () => {
    mockGetPiiIngestionMode.mockResolvedValue('destructive');
    const original = [makeDoc('Jan Kowalski PESEL 12345')];
    const masked = [makeDoc('Jan <PERSON> PESEL <ID>')];
    const result = await applyDualContentMode({
      originalDocs: original,
      maskedDocs: masked,
      orgId: 'org-1',
    });
    expect(result).toEqual(masked);
    expect(mockGetEncryptedPiiDek).not.toHaveBeenCalled();
  });

  it('returns masked docs unchanged when encryption not configured', async () => {
    mockGetPiiIngestionMode.mockResolvedValue('dual_content');
    mockIsEncryptionConfigured.mockReturnValue(false);
    const original = [makeDoc('original text')];
    const masked = [makeDoc('masked text')];
    const result = await applyDualContentMode({
      originalDocs: original,
      maskedDocs: masked,
      orgId: 'org-1',
    });
    expect(result).toEqual(masked);
  });

  it('returns masked docs unchanged when no DEK in DB', async () => {
    mockGetPiiIngestionMode.mockResolvedValue('dual_content');
    mockGetEncryptedPiiDek.mockResolvedValue(null);
    const original = [makeDoc('original text')];
    const masked = [makeDoc('masked text')];
    const result = await applyDualContentMode({
      originalDocs: original,
      maskedDocs: masked,
      orgId: 'org-1',
    });
    expect(result).toEqual(masked);
  });

  it('adds content_original and pii_mode to each doc in dual_content mode', async () => {
    mockGetPiiIngestionMode.mockResolvedValue('dual_content');
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');

    const originalText = 'Jan Kowalski PESEL 80010112345';
    const maskedText = 'Jan <PERSON> PESEL <ID>';
    const original = [makeDoc(originalText, { file_id: 'f1' })];
    const masked = [
      makeDoc(maskedText, {
        file_id: 'f1',
        pii_masked_entities: ['PERSON', 'PL_PESEL'],
      }),
    ];

    const result = await applyDualContentMode({
      originalDocs: original,
      maskedDocs: masked,
      orgId: 'org-1',
    });

    expect(result).toHaveLength(1);
    expect(result[0].pageContent).toBe(maskedText);
    expect(result[0].metadata.pii_mode).toBe('dual_content');
    expect(typeof result[0].metadata.content_original).toBe('string');

    // Verify content_original decrypts back to original text
    const decrypted = decryptContent(
      result[0].metadata.content_original as string,
      testDek,
    );
    expect(decrypted).toBe(originalText);
  });

  it('calls getEncryptedPiiDek once for multiple docs', async () => {
    mockGetPiiIngestionMode.mockResolvedValue('dual_content');
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');

    const original = [makeDoc('text 1'), makeDoc('text 2')];
    const masked = [makeDoc('masked 1'), makeDoc('masked 2')];
    await applyDualContentMode({
      originalDocs: original,
      maskedDocs: masked,
      orgId: 'org-1',
    });

    expect(mockGetEncryptedPiiDek).toHaveBeenCalledTimes(1);
    expect(mockDecryptDataKey).toHaveBeenCalledTimes(1);
  });

  it('throws when originalDocs and maskedDocs have different lengths', async () => {
    mockGetPiiIngestionMode.mockResolvedValue('dual_content');
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');

    const original = [makeDoc('text 1')];
    const masked = [makeDoc('masked 1'), makeDoc('masked 2')];

    await expect(
      applyDualContentMode({
        originalDocs: original,
        maskedDocs: masked,
        orgId: 'org-1',
      }),
    ).rejects.toThrow('doc array length mismatch');
  });

  it('pageContent of result is the masked text (not original)', async () => {
    mockGetPiiIngestionMode.mockResolvedValue('dual_content');
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');

    const original = [makeDoc('Jan Kowalski PESEL 12345')];
    const masked = [makeDoc('Jan <PERSON> PESEL <ID>')];
    const result = await applyDualContentMode({
      originalDocs: original,
      maskedDocs: masked,
      orgId: 'org-1',
    });

    expect(result[0].pageContent).toBe('Jan <PERSON> PESEL <ID>');
  });

  it('falls back to maskedDocs when decryptDataKey throws', async () => {
    mockGetPiiIngestionMode.mockResolvedValue('dual_content');
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');
    mockDecryptDataKey.mockRejectedValue(new Error('KMS unavailable'));

    const original = [makeDoc('Jan Kowalski PESEL 12345')];
    const masked = [makeDoc('Jan <PERSON> PESEL <ID>')];
    const result = await applyDualContentMode({
      originalDocs: original,
      maskedDocs: masked,
      orgId: 'org-1',
    });

    expect(result).toEqual(masked);
  });

  it('falls back to masked doc when encryptContent throws for one document', async () => {
    mockGetPiiIngestionMode.mockResolvedValue('dual_content');
    mockGetEncryptedPiiDek.mockResolvedValue('enc-dek-base64');

    const brokenDek = Buffer.alloc(1); // invalid DEK causes encryptContent to fail

    mockDecryptDataKey.mockResolvedValue(brokenDek);

    const original = [makeDoc('Jan Kowalski PESEL 12345')];
    const masked = [makeDoc('Jan <PERSON> PESEL <ID>', { file_id: 'f1' })];
    const result = await applyDualContentMode({
      originalDocs: original,
      maskedDocs: masked,
      orgId: 'org-1',
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(masked[0]);
    expect(result[0].metadata.pii_mode).toBeUndefined();
    expect(result[0].metadata.content_original).toBeUndefined();
  });
});
