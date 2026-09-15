import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockFindUniqueOrThrow = vi.fn();
const mockUpsert = vi.fn();
const mockUpdateMany = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    organizationSettings: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

const { mockGenerateDataKey, mockDecryptDataKey } = vi.hoisted(() => ({
  mockGenerateDataKey: vi.fn(),
  mockDecryptDataKey: vi.fn(),
}));

vi.mock('@ragenai/crypto', async (importOriginal) => ({
  // Partial: the package exports the whole envelope, and replacing all of it
  // would stub functions this module never calls. Only what the test steers
  // is overridden.
  ...(await importOriginal<typeof import('@ragenai/crypto')>()),
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
  PiiMaskingNotConfiguredError,
} from '../organization-settings';

// The write-restriction gates resolve flags from the database. These files
// test what happens *after* the gate allows the operation; the gate's own
// behaviour is covered in feature-guards.test.ts and in the per-command
// refusal cases.
vi.mock('@/features/subscriptions/services/feature-guards', () => ({
  assertCanManageDocuments: vi.fn(),
  assertCanManageProjects: vi.fn(),
  assertCanManageOrganizationSettings: vi.fn(),
}));

/**
 * A policy is only meaningful where something can enforce it, so
 * `savePiiIngestionMode` refuses without a masker. Every case below is about
 * what happens once one exists; the refusal has its own block at the end.
 */
const PRESIDIO_ENV = {
  PRESIDIO_ANALYZER_URL: 'http://presidio-analyzer:3000',
  PRESIDIO_ANONYMIZER_URL: 'http://presidio-anonymizer:3000',
};

describe('PII Ingestion Mode Settings', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ...PRESIDIO_ENV };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

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
      // getOrCreatePiiDek path: row exists with null DEK → updateMany succeeds
      mockFindUnique.mockResolvedValue({ encryptedPiiDek: null });
      mockUpdateMany.mockResolvedValue({ count: 1 });
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

    it.each(['dual_content', 'destructive'] as const)(
      'refuses to store %s when no masker is configured',
      async (mode) => {
        delete process.env.PRESIDIO_ANALYZER_URL;
        delete process.env.PRESIDIO_ANONYMIZER_URL;

        await expect(
          savePiiIngestionMode('org-1', mode),
        ).rejects.toBeInstanceOf(PiiMaskingNotConfiguredError);
        // Not written, not partially written: a stored policy nothing enforces
        // reads as active in the admin panel and changes nothing on disk.
        expect(mockUpsert).not.toHaveBeenCalled();
      },
    );

    it('refuses when only one half of the masker is configured', async () => {
      delete process.env.PRESIDIO_ANONYMIZER_URL;

      await expect(
        savePiiIngestionMode('org-1', 'dual_content'),
      ).rejects.toBeInstanceOf(PiiMaskingNotConfiguredError);
    });

    it('does not call getOrCreatePiiDek when mode is destructive', async () => {
      mockUpsert.mockResolvedValue({});
      await savePiiIngestionMode('org-1', 'destructive');
      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockGenerateDataKey).not.toHaveBeenCalled();
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
      mockUpdateMany.mockResolvedValue({ count: 1 });
      const result = await getOrCreatePiiDek('org-1');
      expect(mockGenerateDataKey).toHaveBeenCalled();
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org-1',
            encryptedPiiDek: null,
          }),
          data: expect.objectContaining({
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

    it('returns existing DEK if another process won the race', async () => {
      const winnerDek = randomBytes(32);
      const winnerEncryptedDek = 'winner-enc-dek';
      mockFindUnique.mockResolvedValue({ encryptedPiiDek: null });
      mockUpdateMany.mockResolvedValue({ count: 0 });
      mockFindUniqueOrThrow.mockResolvedValue({
        encryptedPiiDek: winnerEncryptedDek,
      });
      mockDecryptDataKey.mockResolvedValue(winnerDek);
      const result = await getOrCreatePiiDek('org-1');
      expect(mockFindUniqueOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
        }),
      );
      expect(mockDecryptDataKey).toHaveBeenCalledWith(winnerEncryptedDek);
      expect(result).toEqual(winnerDek);
    });
  });
});
