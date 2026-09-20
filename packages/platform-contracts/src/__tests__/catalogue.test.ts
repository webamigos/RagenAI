import { describe, expect, it } from 'vitest';

import { CONNECTOR_PROVIDERS } from '../connectors/connectors';
import {
  CATALOG_SLUG_PATTERN,
  LEGACY_CATALOG_SLUGS,
  MCP_AUTH_TYPES,
  OPERATOR_CREATABLE_AUTH_TYPES,
  allowedCatalogEntries,
  authTypeRequiresBehaviourPack,
  catalogCustomerSlug,
  catalogSlugError,
  catalogSystemPrompt,
  connectorSlug,
  isCatalogSlug,
  isConnectable,
  isLegacyCatalogSlug,
  isMcpAuthType,
  resolveCatalogEntry,
  slugsCollide,
  type CatalogBehaviourPack,
  type McpCatalogEntryDto,
} from '../connectors/catalogue';

function entry(over: Partial<McpCatalogEntryDto> = {}): McpCatalogEntryDto {
  return {
    publicId: 'a-public-id',
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

describe('auth types', () => {
  it('admits exactly the McpAuthType members', () => {
    expect(isMcpAuthType('EXTERNAL_MCP')).toBe(true);
    expect(isMcpAuthType('external_mcp')).toBe(false);
    expect(isMcpAuthType('NOTION')).toBe(false);
  });

  it('offers an operator only the shapes a row can carry on its own', () => {
    for (const authType of OPERATOR_CREATABLE_AUTH_TYPES) {
      expect(MCP_AUTH_TYPES).toContain(authType);
      expect(authTypeRequiresBehaviourPack(authType)).toBe(false);
    }
    expect(authTypeRequiresBehaviourPack('API_KEY_CUSTOM_HEADER')).toBe(true);
  });
});

describe('slugs', () => {
  it('keeps the eleven legacy names, verbatim', () => {
    expect(LEGACY_CATALOG_SLUGS).toEqual([...CONNECTOR_PROVIDERS]);
    expect(isLegacyCatalogSlug('GOOGLE_CALENDAR')).toBe(true);
    // Admitted by the seed and the migration, and by nothing else: the format
    // an operator may type does not accept them.
    expect(isCatalogSlug('GOOGLE_CALENDAR')).toBe(false);
  });

  it('accepts lowercase-kebab and refuses a twelfth casing convention', () => {
    expect(isCatalogSlug('notion')).toBe(true);
    expect(isCatalogSlug('open-mercato-2')).toBe(true);
    expect(isCatalogSlug('Foo_Bar')).toBe(false);
    expect(isCatalogSlug('2fast')).toBe(false);
    expect(isCatalogSlug('-leading')).toBe(false);
    expect(CATALOG_SLUG_PATTERN.test('notion')).toBe(true);
  });

  it('says what is wrong rather than just refusing', () => {
    expect(catalogSlugError('notion')).toBeNull();
    expect(catalogSlugError('')).toMatch(/required/);
    expect(catalogSlugError('x'.repeat(65))).toMatch(/64/);
    expect(catalogSlugError('Notion')).toMatch(/lowercase/);
  });

  it('collides case-insensitively, because customerId lowercases', () => {
    expect(catalogCustomerSlug('SLACK')).toBe('slack');
    expect(slugsCollide('slack', 'SLACK')).toBe(true);
    expect(slugsCollide('slack', 'slack-2')).toBe(false);
  });
});

describe('resolving an entry', () => {
  const pack: CatalogBehaviourPack = {
    slug: 'GOOGLE_CALENDAR',
    resolveServerUrl: () => 'http://localhost:8000',
    resolveAuthBaseUrl: () => 'http://localhost:8000',
    systemPromptFragment: ({ timeZone }) => `timeZone=${timeZone}`,
  };

  it('answers "unknown" for a slug with no row, rather than throwing', () => {
    // A leftover behaviour pack is dead code, not a crash: the resolver keys
    // on rows.
    expect(resolveCatalogEntry('gone', [], { gone: pack })).toEqual({
      status: 'unknown',
      slug: 'gone',
    });
  });

  it('resolves a row with no behaviour pack — which is the whole point', () => {
    const resolution = resolveCatalogEntry('notion', [entry()], {});
    expect(resolution.status).toBe('resolved');
    if (resolution.status !== 'resolved') {
      return;
    }
    expect(resolution.pack).toBeNull();
    expect(resolution.serverUrl).toBe('https://mcp.notion.com/mcp');
    expect(isConnectable(resolution)).toBe(true);
  });

  it("reads a built-in's URL from its pack, because the column is null", () => {
    const builtIn = entry({
      slug: 'GOOGLE_CALENDAR',
      mcpServerUrl: null,
      authType: 'SERVER_SIDE',
      isBuiltIn: true,
    });
    const resolution = resolveCatalogEntry('GOOGLE_CALENDAR', [builtIn], {
      GOOGLE_CALENDAR: pack,
    });
    if (resolution.status !== 'resolved') {
      throw new Error('expected a resolution');
    }
    expect(resolution.serverUrl).toBe('http://localhost:8000');
    expect(resolution.authBaseUrl).toBe('http://localhost:8000');
  });

  it('prefers the row over the pack when both name an address', () => {
    const resolution = resolveCatalogEntry(
      'GOOGLE_CALENDAR',
      [entry({ slug: 'GOOGLE_CALENDAR', mcpServerUrl: 'https://moved.test' })],
      { GOOGLE_CALENDAR: pack },
    );
    if (resolution.status !== 'resolved') {
      throw new Error('expected a resolution');
    }
    expect(resolution.serverUrl).toBe('https://moved.test');
  });

  it('is not connectable when disabled, unaddressed, or missing its code', () => {
    const disabled = resolveCatalogEntry(
      'notion',
      [entry({ enabled: false })],
      {},
    );
    expect(isConnectable(disabled)).toBe(false);

    const unaddressed = resolveCatalogEntry(
      'notion',
      [entry({ mcpServerUrl: null })],
      {},
    );
    expect(isConnectable(unaddressed)).toBe(false);

    const needsCode = resolveCatalogEntry(
      'WOOCOMMERCE',
      [
        entry({
          slug: 'WOOCOMMERCE',
          authType: 'API_KEY_CUSTOM_HEADER',
          mcpServerUrl: null,
        }),
      ],
      {},
    );
    expect(isConnectable(needsCode)).toBe(false);

    const hasCode = resolveCatalogEntry(
      'WOOCOMMERCE',
      [
        entry({
          slug: 'WOOCOMMERCE',
          authType: 'API_KEY_CUSTOM_HEADER',
          mcpServerUrl: null,
        }),
      ],
      // Its URL is assembled per connector from the shop URL the user types,
      // so having the code is enough.
      { WOOCOMMERCE: { slug: 'WOOCOMMERCE' } },
    );
    expect(isConnectable(hasCode)).toBe(true);

    expect(isConnectable(resolveCatalogEntry('gone', [], {}))).toBe(false);
  });
});

describe('the system prompt', () => {
  const ctx = { timeZone: 'Europe/Warsaw' };

  it('takes the row when it has text', () => {
    const resolution = resolveCatalogEntry(
      'notion',
      [entry({ systemPrompt: 'For Notion:' })],
      {},
    );
    expect(catalogSystemPrompt(resolution, ctx)).toBe('For Notion:');
  });

  it('falls back to a fragment that must compute', () => {
    const resolution = resolveCatalogEntry(
      'GOOGLE_CALENDAR',
      [entry({ slug: 'GOOGLE_CALENDAR', systemPrompt: null })],
      {
        GOOGLE_CALENDAR: {
          slug: 'GOOGLE_CALENDAR',
          systemPromptFragment: ({ timeZone }) => `timeZone=${timeZone}`,
        },
      },
    );
    expect(catalogSystemPrompt(resolution, ctx)).toBe('timeZone=Europe/Warsaw');
  });

  it('is null when neither has one', () => {
    expect(
      catalogSystemPrompt(resolveCatalogEntry('notion', [entry()], {}), ctx),
    ).toBeNull();
    expect(
      catalogSystemPrompt(resolveCatalogEntry('gone', [], {}), ctx),
    ).toBeNull();
  });
});

describe('the allowlist over the catalogue', () => {
  const entries = [
    entry({ slug: 'SLACK' }),
    entry({ slug: 'notion' }),
    entry({ slug: 'off', enabled: false }),
  ];

  it('treats an empty array at either tier as no restriction', () => {
    expect(allowedCatalogEntries(entries, [], []).map((e) => e.slug)).toEqual([
      'SLACK',
      'notion',
    ]);
  });

  it('intersects the platform default with the organization allowlist', () => {
    expect(
      allowedCatalogEntries(entries, ['SLACK', 'notion'], ['notion']).map(
        (e) => e.slug,
      ),
    ).toEqual(['notion']);
  });

  it('drops a slug whose entry is no longer in the catalogue', () => {
    expect(
      allowedCatalogEntries(entries, [], ['notion', 'deleted-slug']).map(
        (e) => e.slug,
      ),
    ).toEqual(['notion']);
  });
});

describe('the slug on a connector row', () => {
  it('is the slug column, which is NOT NULL since B3', () => {
    expect(connectorSlug({ providerSlug: 'SLACK' })).toBe('SLACK');
  });

  it('ignores the enum column, which is unwritten and on its way out', () => {
    // The `?? provider` that lived here through steps 1 and 2 went with the
    // column's nullability. The accessor stays so B5's drop touches one file.
    expect(
      connectorSlug({ provider: 'SLACK', providerSlug: 'slack-internal' }),
    ).toBe('slack-internal');
    expect(connectorSlug({ provider: null, providerSlug: 'notion' })).toBe(
      'notion',
    );
  });
});
