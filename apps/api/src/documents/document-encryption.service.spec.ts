const mockIsEncryptionEnabled = jest.fn();
const mockGenerateThreadKey = jest.fn();
const mockEncryptContent = jest.fn();

jest.mock('../crypto/thread-encryption.js', () => ({
  isEncryptionEnabled: () => mockIsEncryptionEnabled(),
  generateThreadKey: () => mockGenerateThreadKey(),
  encryptContent: (content: string, dek: Buffer) =>
    mockEncryptContent(content, dek),
}));

import { DocumentEncryptionService } from './document-encryption.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

describe('DocumentEncryptionService', () => {
  function makeService(overrides: {
    userDocument?: Partial<Record<string, jest.Mock>>;
    organization?: Partial<Record<string, jest.Mock>>;
  }) {
    const prisma = {
      client: {
        userDocument: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          ...overrides.userDocument,
        },
        organization: {
          findMany: jest.fn().mockResolvedValue([]),
          ...overrides.organization,
        },
      },
    } as unknown as PrismaService;

    return { service: new DocumentEncryptionService(prisma), prisma };
  }

  beforeEach(() => {
    mockIsEncryptionEnabled.mockReset().mockReturnValue(true);
    mockGenerateThreadKey.mockReset().mockResolvedValue({
      plaintextDek: Buffer.from('dek'),
      encryptedDek: 'enc-dek',
    });
    mockEncryptContent.mockReset().mockReturnValue('cipher-text');
  });

  describe('encryptDocuments', () => {
    it('short-circuits when encryption is disabled', async () => {
      mockIsEncryptionEnabled.mockReturnValue(false);
      const { service } = makeService({});

      const result = await service.encryptDocuments('org-1');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/Encryption is not enabled/);
    });

    it('returns zero-progress result when there is nothing to encrypt', async () => {
      const { service } = makeService({
        userDocument: { findMany: jest.fn().mockResolvedValue([]) },
      });

      const result = await service.encryptDocuments('org-1');

      expect(result).toEqual({
        success: true,
        documentsProcessed: 0,
        errors: 0,
      });
    });

    it('encrypts every unencrypted document in a batch', async () => {
      const findMany = jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'doc-1', content: 'plain 1' },
          { id: 'doc-2', content: 'plain 2' },
        ])
        .mockResolvedValueOnce([]);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { service } = makeService({
        userDocument: { findMany, updateMany },
      });

      const result = await service.encryptDocuments('org-1');

      expect(result).toEqual({
        success: true,
        documentsProcessed: 2,
        errors: 0,
      });
      expect(updateMany).toHaveBeenCalledTimes(2);
    });

    it('races safely — a concurrent encrypt does not double count', async () => {
      const findMany = jest
        .fn()
        .mockResolvedValueOnce([{ id: 'doc-1', content: 'plain 1' }])
        .mockResolvedValueOnce([]);
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });

      const { service } = makeService({
        userDocument: { findMany, updateMany },
      });

      const result = await service.encryptDocuments('org-1');

      expect(result).toEqual({
        success: true,
        documentsProcessed: 0,
        errors: 0,
      });
    });

    it('counts per-document failures without aborting the batch', async () => {
      const findMany = jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'doc-1', content: 'plain 1' },
          { id: 'doc-2', content: 'plain 2' },
        ])
        .mockResolvedValueOnce([]);
      const updateMany = jest
        .fn()
        .mockRejectedValueOnce(new Error('db error'))
        .mockResolvedValueOnce({ count: 1 });

      const { service } = makeService({
        userDocument: { findMany, updateMany },
      });

      const result = await service.encryptDocuments('org-1');

      expect(result).toEqual({
        success: false,
        documentsProcessed: 1,
        errors: 1,
      });
    });
  });

  describe('encryptAllDocuments', () => {
    it('short-circuits when encryption is disabled', async () => {
      mockIsEncryptionEnabled.mockReturnValue(false);
      const { service } = makeService({});

      const result = await service.encryptAllDocuments();

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/Encryption is not enabled/);
    });

    it('aggregates results across every organization', async () => {
      const findManyOrgs = jest
        .fn()
        .mockResolvedValue([{ id: 'org-1' }, { id: 'org-2' }]);
      const findManyDocs = jest
        .fn()
        .mockResolvedValueOnce([{ id: 'doc-1', content: 'plain' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'doc-2', content: 'plain' }])
        .mockResolvedValueOnce([]);
      const updateMany = jest.fn().mockResolvedValue({ count: 1 });

      const { service } = makeService({
        organization: { findMany: findManyOrgs },
        userDocument: { findMany: findManyDocs, updateMany },
      });

      const result = await service.encryptAllDocuments();

      expect(result).toEqual({
        success: true,
        documentsProcessed: 2,
        errors: 0,
      });
    });
  });
});
