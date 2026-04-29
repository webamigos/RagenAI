import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    organizationSettings: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

const { mockGenerateDataKey, mockDecryptDataKey } = vi.hoisted(() => ({
  mockGenerateDataKey: vi.fn(),
  mockDecryptDataKey: vi.fn(),
}));

vi.mock('@/libs/crypto/thread-encryption', () => ({
  generateThreadKey: mockGenerateDataKey,
  decryptThreadKey: mockDecryptDataKey,
  isEncryptionEnabled: () => true,
}));

vi.mock('@/app/lib/utils/hashApiKey', () => ({
  encryptApiKey: (v: string) => `enc:${v}`,
  decryptApiKey: (v: string) => v.replace('enc:', ''),
}));

vi.mock('@/features/organizations/services/queries/get-api-keys-query', () => ({
  getApiKeyFromPool: () => null,
}));

import { randomBytes } from 'node:crypto';
import {
  getPiiIngestionMode,
  savePiiIngestionMode,
  getOrCreatePiiDek,
} from '../organization-settings';

describe('PII Ingestion Mode Settings', () => {
  const testDek = randomBytes(32);
  const testEncryptedDek = 'enc-dek-base64';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateDataKey.mockResolvedValue({
      plaintextDek: testDek,
      encryptedDek: testEncryptedDek,
    });
    mockDecryptDataKey.mockResolvedValue(testDek);
  });

  describe('getPiiIngestionMode', () => {
    it('returns destructive when no DB row exists', async () => {
      mockFindUnique.mockResolvedValue(null);
      const result = await getPiiIngestionMode('org-1');
      expect(result).toBe('destructive');
    });

    it('returns destructive when field is null', async () => {
      mockFindUnique.mockResolvedValue({ piiIngestionMode: null });
      const result = await getPiiIngestionMode('org-1');
      expect(result).toBe('destructive');
    });

    it('returns stored dual_content value', async () => {
      mockFindUnique.mockResolvedValue({ piiIngestionMode: 'dual_content' });
      const result = await getPiiIngestionMode('org-1');
      expect(result).toBe('dual_content');
    });
  });

  describe('savePiiIngestionMode', () => {
    it('upserts piiIngestionMode field', async () => {
      mockUpsert.mockResolvedValue({});
      await savePiiIngestionMode('org-1', 'dual_content');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          update: expect.objectContaining({ piiIngestionMode: 'dual_content' }),
          create: expect.objectContaining({
            organizationId: 'org-1',
            piiIngestionMode: 'dual_content',
          }),
        }),
      );
    });
  });

  describe('getOrCreatePiiDek', () => {
    it('returns existing DEK when encryptedPiiDek is set', async () => {
      mockFindUnique.mockResolvedValue({ encryptedPiiDek: testEncryptedDek });
      const result = await getOrCreatePiiDek('org-1');
      expect(mockDecryptDataKey).toHaveBeenCalledWith(testEncryptedDek);
      expect(result).toEqual(testDek);
      expect(mockGenerateDataKey).not.toHaveBeenCalled();
    });

    it('generates and stores new DEK when encryptedPiiDek is null', async () => {
      mockFindUnique.mockResolvedValue({ encryptedPiiDek: null });
      mockUpsert.mockResolvedValue({});
      const result = await getOrCreatePiiDek('org-1');
      expect(mockGenerateDataKey).toHaveBeenCalled();
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            encryptedPiiDek: testEncryptedDek,
          }),
        }),
      );
      expect(result).toEqual(testDek);
    });

    it('generates new DEK when no DB row exists', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockUpsert.mockResolvedValue({});
      const result = await getOrCreatePiiDek('org-1');
      expect(mockGenerateDataKey).toHaveBeenCalled();
      expect(result).toEqual(testDek);
    });
  });
});
