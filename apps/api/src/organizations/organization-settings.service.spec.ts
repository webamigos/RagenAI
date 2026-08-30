jest.mock('./hash-api-key.js', () => ({
  decryptApiKey: (v: string) => v.replace('enc:', ''),
  encryptApiKey: (v: string) => `enc:${v}`,
}));

const generateThreadKey = jest.fn();
const decryptThreadKey = jest.fn();
jest.mock('../crypto/thread-encryption.js', () => ({
  generateThreadKey: (...args: unknown[]) => generateThreadKey(...args),
  decryptThreadKey: (...args: unknown[]) => decryptThreadKey(...args),
}));

import { OrganizationSettingsService } from './organization-settings.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('OrganizationSettingsService', () => {
  function makeService(findUniqueResult: unknown) {
    const findUnique = jest.fn().mockResolvedValue(findUniqueResult);
    const prisma = {
      client: { organizationSettings: { findUnique } },
    } as unknown as PrismaService;
    return { service: new OrganizationSettingsService(prisma), findUnique };
  }

  describe('getUsageLimits', () => {
    it('returns null monthlyApiRequestLimit when not set', async () => {
      const { service } = makeService({});
      const result = await service.getUsageLimits('org-1');
      expect(result.monthlyApiRequestLimit).toBeNull();
    });

    it('returns stored monthlyApiRequestLimit', async () => {
      const { service } = makeService({ monthlyApiRequestLimit: 200 });
      const result = await service.getUsageLimits('org-1');
      expect(result.monthlyApiRequestLimit).toBe(200);
    });
  });

  describe('getRagPipelineSettings', () => {
    it('returns defaults when no DB row exists', async () => {
      const { service } = makeService(null);
      const result = await service.getRagPipelineSettings('org-1');
      expect(result).toEqual({
        multiQueryEnabled: true,
        docSummariesEnabled: true,
        contentModerationEnabled: true,
        rerankingEnabled: true,
      });
    });

    it('returns stored values when present', async () => {
      const { service } = makeService({
        multiQueryEnabled: false,
        docSummariesEnabled: true,
        contentModerationEnabled: false,
        rerankingEnabled: false,
      });
      const result = await service.getRagPipelineSettings('org-1');
      expect(result).toEqual({
        multiQueryEnabled: false,
        docSummariesEnabled: true,
        contentModerationEnabled: false,
        rerankingEnabled: false,
      });
    });

    it('falls back to defaults for null fields', async () => {
      const { service } = makeService({
        multiQueryEnabled: null,
        docSummariesEnabled: false,
        contentModerationEnabled: null,
        rerankingEnabled: null,
      });
      const result = await service.getRagPipelineSettings('org-1');
      expect(result).toEqual({
        multiQueryEnabled: true,
        docSummariesEnabled: false,
        contentModerationEnabled: true,
        rerankingEnabled: true,
      });
    });
  });

  describe('getLiteLLMOrgApiKey', () => {
    it('returns null when no key stored', async () => {
      const { service } = makeService({ litellmApiKey: null });
      expect(await service.getLiteLLMOrgApiKey('org-1')).toBeNull();
    });

    it('returns null when no settings row exists', async () => {
      const { service } = makeService(null);
      expect(await service.getLiteLLMOrgApiKey('org-1')).toBeNull();
    });
  });

  describe('getAllSettings', () => {
    it('returns hardcoded defaults when no settings row exists', async () => {
      const { service } = makeService(null);
      const result = await service.getAllSettings('org-1');
      expect(result.model).toBe('gemini-3-flash-preview');
      expect(result.temperature).toBe(0.8);
      expect(result.maxDocumentsToRetrieve).toBe(5);
      expect(result.anthropicApiKey).toBeNull();
    });

    it('falls back to defaults for unset optional fields', async () => {
      const { service } = makeService({
        openaiApiKey: null,
        anthropicApiKey: null,
        googleApiKey: null,
        bedrockCredentials: null,
        ollamaHost: null,
        openrouterApiKey: null,
        fireworksApiKey: null,
        azureOpenaiCredentials: null,
        model: null,
        temperature: null,
        prompt: null,
        maxDocumentsToRetrieve: null,
        voiceId: null,
      });
      const result = await service.getAllSettings('org-1');
      expect(result.model).toBe('gemini-3-flash-preview');
      expect(result.voiceId).toBe('JBFqnCBsd6RMkjVDRZzb');
    });

    it('returns null bedrockCredentials/azureOpenaiCredentials on malformed JSON', async () => {
      const { service } = makeService({
        bedrockCredentials: 'not-json-once-decrypted',
        azureOpenaiCredentials: 'also-not-json',
      });
      const result = await service.getAllSettings('org-1');
      expect(result.bedrockCredentials).toBeNull();
      expect(result.azureOpenaiCredentials).toBeNull();
    });
  });

  describe('getAllowedConnectors', () => {
    it('returns an empty array when not set', async () => {
      const { service } = makeService({});
      expect(await service.getAllowedConnectors('org-1')).toEqual([]);
    });

    it('returns the stored allowlist', async () => {
      const { service } = makeService({
        allowedConnectors: ['CLICKUP', 'SLACK'],
      });
      expect(await service.getAllowedConnectors('org-1')).toEqual([
        'CLICKUP',
        'SLACK',
      ]);
    });
  });

  describe('getDefaultAllowedConnectors', () => {
    function makeServiceWithSettingsRow(row: unknown) {
      const findUnique = jest.fn().mockResolvedValue(row);
      const prisma = {
        client: { settings: { findUnique } },
      } as unknown as PrismaService;
      return { service: new OrganizationSettingsService(prisma), findUnique };
    }

    it('returns an empty array when no row exists', async () => {
      const { service } = makeServiceWithSettingsRow(null);
      expect(await service.getDefaultAllowedConnectors()).toEqual([]);
    });

    it('parses the stored JSON array', async () => {
      const { service } = makeServiceWithSettingsRow({
        value: JSON.stringify(['CLICKUP', 'HUBSPOT']),
      });
      expect(await service.getDefaultAllowedConnectors()).toEqual([
        'CLICKUP',
        'HUBSPOT',
      ]);
    });

    it('returns an empty array on malformed JSON', async () => {
      const { service } = makeServiceWithSettingsRow({ value: 'not-json' });
      expect(await service.getDefaultAllowedConnectors()).toEqual([]);
    });

    it('filters out non-string entries and non-array values', async () => {
      const { service } = makeServiceWithSettingsRow({
        value: JSON.stringify({ not: 'an array' }),
      });
      expect(await service.getDefaultAllowedConnectors()).toEqual([]);
    });
  });

  describe('getOrCreatePiiDek', () => {
    function makeServiceWithOrgSettings() {
      const findUnique = jest.fn();
      const findUniqueOrThrow = jest.fn();
      const updateMany = jest.fn();
      const upsert = jest.fn().mockResolvedValue(undefined);
      const prisma = {
        client: {
          organizationSettings: {
            findUnique,
            findUniqueOrThrow,
            updateMany,
            upsert,
          },
        },
      } as unknown as PrismaService;
      return {
        service: new OrganizationSettingsService(prisma),
        findUnique,
        findUniqueOrThrow,
        updateMany,
        upsert,
      };
    }

    beforeEach(() => {
      generateThreadKey.mockReset();
      decryptThreadKey.mockReset();
    });

    it('decrypts and returns an existing DEK without generating a new one', async () => {
      const { service, findUnique } = makeServiceWithOrgSettings();
      findUnique.mockResolvedValue({ encryptedPiiDek: 'encrypted-dek' });
      decryptThreadKey.mockResolvedValue(Buffer.from('plaintext-dek'));

      const dek = await service.getOrCreatePiiDek('org-1');

      expect(dek.toString()).toBe('plaintext-dek');
      expect(decryptThreadKey).toHaveBeenCalledWith('encrypted-dek');
      expect(generateThreadKey).not.toHaveBeenCalled();
    });

    it('upserts a new DEK when no settings row exists yet', async () => {
      const { service, findUnique, upsert } = makeServiceWithOrgSettings();
      findUnique.mockResolvedValue(null);
      generateThreadKey.mockResolvedValue({
        plaintextDek: Buffer.from('fresh-dek'),
        encryptedDek: 'fresh-encrypted-dek',
      });

      const dek = await service.getOrCreatePiiDek('org-1');

      expect(dek.toString()).toBe('fresh-dek');
      expect(upsert).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        update: { encryptedPiiDek: 'fresh-encrypted-dek' },
        create: {
          organizationId: 'org-1',
          encryptedPiiDek: 'fresh-encrypted-dek',
        },
      });
    });

    it('conditionally initializes the DEK when a settings row exists with no DEK yet', async () => {
      const { service, findUnique, updateMany } = makeServiceWithOrgSettings();
      findUnique.mockResolvedValue({ encryptedPiiDek: null });
      updateMany.mockResolvedValue({ count: 1 });
      generateThreadKey.mockResolvedValue({
        plaintextDek: Buffer.from('fresh-dek'),
        encryptedDek: 'fresh-encrypted-dek',
      });

      const dek = await service.getOrCreatePiiDek('org-1');

      expect(dek.toString()).toBe('fresh-dek');
      expect(updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', encryptedPiiDek: null },
        data: { encryptedPiiDek: 'fresh-encrypted-dek' },
      });
    });

    it('uses the winning DEK when it loses the race to initialize one', async () => {
      const { service, findUnique, updateMany, findUniqueOrThrow } =
        makeServiceWithOrgSettings();
      findUnique.mockResolvedValue({ encryptedPiiDek: null });
      updateMany.mockResolvedValue({ count: 0 });
      findUniqueOrThrow.mockResolvedValue({
        encryptedPiiDek: 'winner-encrypted-dek',
      });
      generateThreadKey.mockResolvedValue({
        plaintextDek: Buffer.from('our-dek'),
        encryptedDek: 'our-encrypted-dek',
      });
      decryptThreadKey.mockResolvedValue(Buffer.from('winner-dek'));

      const dek = await service.getOrCreatePiiDek('org-1');

      expect(dek.toString()).toBe('winner-dek');
      expect(decryptThreadKey).toHaveBeenCalledWith('winner-encrypted-dek');
    });

    it('throws if the race is lost but the winner somehow has no DEK either', async () => {
      const { service, findUnique, updateMany, findUniqueOrThrow } =
        makeServiceWithOrgSettings();
      findUnique.mockResolvedValue({ encryptedPiiDek: null });
      updateMany.mockResolvedValue({ count: 0 });
      findUniqueOrThrow.mockResolvedValue({ encryptedPiiDek: null });
      generateThreadKey.mockResolvedValue({
        plaintextDek: Buffer.from('our-dek'),
        encryptedDek: 'our-encrypted-dek',
      });

      await expect(service.getOrCreatePiiDek('org-1')).rejects.toThrow(
        'Failed to initialize PII encryption key',
      );
    });
  });
});
