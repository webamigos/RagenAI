import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    organizationSettings: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    settings: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
  },
}));

vi.mock('@/app/lib/utils/hashApiKey', () => ({
  encryptApiKey: (v: string) => `enc:${v}`,
  decryptApiKey: (v: string) => v.replace('enc:', ''),
}));

vi.mock('@/features/organizations/services/queries/get-api-keys-query', () => ({
  getApiKeyFromPool: () => null,
}));

import {
  getRagPipelineSettings,
  saveRagPipelineSettings,
  getDefaultRagPipelineSettings,
  saveDefaultRagPipelineSettings,
} from '../organization-settings';

describe('RAG Pipeline Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRagPipelineSettings', () => {
    it('returns defaults when no DB row exists', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await getRagPipelineSettings('org-1');

      expect(result).toEqual({
        multiQueryEnabled: true,
        docSummariesEnabled: true,
        contentModerationEnabled: true,
        rerankingEnabled: true,
      });
    });

    it('returns stored values when present', async () => {
      mockFindUnique.mockResolvedValue({
        multiQueryEnabled: false,
        docSummariesEnabled: true,
        contentModerationEnabled: false,
        rerankingEnabled: false,
      });

      const result = await getRagPipelineSettings('org-1');

      expect(result).toEqual({
        multiQueryEnabled: false,
        docSummariesEnabled: true,
        contentModerationEnabled: false,
        rerankingEnabled: false,
      });
    });

    it('falls back to defaults for null fields', async () => {
      mockFindUnique.mockResolvedValue({
        multiQueryEnabled: null,
        docSummariesEnabled: false,
        contentModerationEnabled: null,
        rerankingEnabled: null,
      });

      const result = await getRagPipelineSettings('org-1');

      expect(result).toEqual({
        multiQueryEnabled: true,
        docSummariesEnabled: false,
        contentModerationEnabled: true,
        rerankingEnabled: true,
      });
    });
  });

  describe('saveRagPipelineSettings', () => {
    it('upserts only provided fields', async () => {
      mockUpsert.mockResolvedValue({});

      await saveRagPipelineSettings('org-1', { multiQueryEnabled: false });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          update: { multiQueryEnabled: false },
          create: { organizationId: 'org-1', multiQueryEnabled: false },
        }),
      );
    });

    it('upserts multiple fields', async () => {
      mockUpsert.mockResolvedValue({});

      await saveRagPipelineSettings('org-1', {
        multiQueryEnabled: false,
        rerankingEnabled: true,
      });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { multiQueryEnabled: false, rerankingEnabled: true },
        }),
      );
    });
  });

  describe('getDefaultRagPipelineSettings', () => {
    it('returns hardcoded defaults when no Settings row', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await getDefaultRagPipelineSettings();

      expect(result).toEqual({
        multiQueryEnabled: true,
        docSummariesEnabled: true,
        contentModerationEnabled: true,
        rerankingEnabled: true,
      });
    });

    it('parses stored JSON defaults', async () => {
      mockFindUnique.mockResolvedValue({
        value: JSON.stringify({
          multiQueryEnabled: false,
          docSummariesEnabled: false,
          contentModerationEnabled: true,
          rerankingEnabled: false,
        }),
      });

      const result = await getDefaultRagPipelineSettings();

      expect(result).toEqual({
        multiQueryEnabled: false,
        docSummariesEnabled: false,
        contentModerationEnabled: true,
        rerankingEnabled: false,
      });
    });

    it('handles malformed JSON gracefully', async () => {
      mockFindUnique.mockResolvedValue({ value: 'not-json' });

      const result = await getDefaultRagPipelineSettings();

      expect(result).toEqual({
        multiQueryEnabled: true,
        docSummariesEnabled: true,
        contentModerationEnabled: true,
        rerankingEnabled: true,
      });
    });
  });

  describe('saveDefaultRagPipelineSettings', () => {
    it('merges with existing defaults', async () => {
      mockFindUnique.mockResolvedValue({
        value: JSON.stringify({
          multiQueryEnabled: true,
          docSummariesEnabled: true,
          contentModerationEnabled: true,
          rerankingEnabled: true,
        }),
      });
      mockUpsert.mockResolvedValue({});

      await saveDefaultRagPipelineSettings({ rerankingEnabled: false });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            value: JSON.stringify({
              multiQueryEnabled: true,
              docSummariesEnabled: true,
              contentModerationEnabled: true,
              rerankingEnabled: false,
            }),
          },
        }),
      );
    });
  });
});
