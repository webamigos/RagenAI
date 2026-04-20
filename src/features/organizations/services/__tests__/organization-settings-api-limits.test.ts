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
  getUsageLimits,
  saveUsageLimits,
  getDefaultOrganizationLimits,
} from '../organization-settings';

describe('API Request Limits in Organization Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUsageLimits', () => {
    it('returns null monthlyApiRequestLimit when not set', async () => {
      mockFindUnique.mockResolvedValue({});

      const result = await getUsageLimits('org-1');

      expect(result.monthlyApiRequestLimit).toBeNull();
    });

    it('returns stored monthlyApiRequestLimit', async () => {
      mockFindUnique.mockResolvedValue({ monthlyApiRequestLimit: 200 });

      const result = await getUsageLimits('org-1');

      expect(result.monthlyApiRequestLimit).toBe(200);
    });
  });

  describe('saveUsageLimits', () => {
    it('saves monthlyApiRequestLimit', async () => {
      mockUpsert.mockResolvedValue({});

      await saveUsageLimits('org-1', { monthlyApiRequestLimit: 500 });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          update: { monthlyApiRequestLimit: 500 },
          create: { organizationId: 'org-1', monthlyApiRequestLimit: 500 },
        }),
      );
    });

    it('saves null monthlyApiRequestLimit (unlimited)', async () => {
      mockUpsert.mockResolvedValue({});

      await saveUsageLimits('org-1', { monthlyApiRequestLimit: null });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { monthlyApiRequestLimit: null },
        }),
      );
    });
  });

  describe('getDefaultOrganizationLimits', () => {
    it('returns 100 as default monthlyApiRequestLimit when no row exists', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await getDefaultOrganizationLimits();

      expect(result.monthlyApiRequestLimit).toBe(100);
    });

    it('returns 100 as default monthlyApiRequestLimit when field not in JSON', async () => {
      mockFindUnique.mockResolvedValue({
        value: JSON.stringify({ monthlyTokenLimit: 50000 }),
      });

      const result = await getDefaultOrganizationLimits();

      expect(result.monthlyApiRequestLimit).toBe(100);
    });

    it('returns stored monthlyApiRequestLimit from JSON', async () => {
      mockFindUnique.mockResolvedValue({
        value: JSON.stringify({ monthlyApiRequestLimit: 500 }),
      });

      const result = await getDefaultOrganizationLimits();

      expect(result.monthlyApiRequestLimit).toBe(500);
    });

    it('returns 100 on malformed JSON', async () => {
      mockFindUnique.mockResolvedValue({ value: '{bad-json' });

      const result = await getDefaultOrganizationLimits();

      expect(result.monthlyApiRequestLimit).toBe(100);
    });
  });
});
