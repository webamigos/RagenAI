import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockWarn = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    mcpCatalogEntry: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: (...args: unknown[]) => mockWarn(...args), error: vi.fn() },
}));

import {
  getCatalogEntriesQuery,
  getCatalogEntryQuery,
} from '../get-catalog-entries-query';

function row(over: Record<string, unknown> = {}) {
  return {
    publicId: 'public-1',
    slug: 'notion',
    label: 'Notion',
    description: null,
    icon: null,
    lucideIcon: 'notebook',
    mcpServerUrl: 'https://mcp.notion.com/mcp',
    authType: 'EXTERNAL_MCP',
    authBaseUrl: null,
    authPath: null,
    scopes: [],
    useUserScope: false,
    oauthCredentialsStored: false,
    systemPrompt: null,
    allowsPrivateAddress: false,
    isBuiltIn: false,
    enabled: true,
    ...over,
  };
}

describe('the catalogue loader', () => {
  beforeEach(() => {
    mockFindMany.mockResolvedValue([row()]);
  });

  it('returns only enabled entries unless asked for all of them', async () => {
    await getCatalogEntriesQuery();
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true } }),
    );

    await getCatalogEntriesQuery({ includeDisabled: true });
    expect(mockFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('drops a row whose auth type this build has no member for', async () => {
    // Three services deploy independently, so a newer member can reach the
    // column before this client knows it. Dropping means the connector is not
    // offered; guessing would mean dialling a server under the wrong shape.
    mockFindMany.mockResolvedValue([
      row(),
      row({ authType: 'WEBAUTHN_MAGIC' }),
    ]);

    const entries = await getCatalogEntriesQuery();

    expect(entries.map((e) => e.slug)).toEqual(['notion']);
    expect(mockWarn).toHaveBeenCalled();
  });

  it('looks one up by slug, and answers null for a slug with no row', async () => {
    mockFindUnique.mockResolvedValue(row({ slug: 'SLACK' }));
    expect(await getCatalogEntryQuery('SLACK')).toMatchObject({
      slug: 'SLACK',
    });

    mockFindUnique.mockResolvedValue(null);
    expect(await getCatalogEntryQuery('gone')).toBeNull();
  });
});
