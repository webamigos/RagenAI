import { describe, expect, it } from 'vitest';

import {
  CREATABLE_AUTH_TYPES,
  serverUrlFailure,
  validateEntry,
  valuesForAuthType,
  type CatalogueEntryInput,
} from '../validation';

function input(over: Partial<CatalogueEntryInput> = {}): CatalogueEntryInput {
  return {
    slug: 'notion',
    label: 'Notion',
    description: 'Search pages and databases.',
    mcpServerUrl: 'https://mcp.notion.com/mcp',
    authType: 'API_KEY_BEARER',
    icon: '',
    lucideIcon: 'notebook',
    systemPrompt: '',
    allowsPrivateAddress: false,
    scopes: [],
    useUserScope: false,
    ...over,
  };
}

describe('what an operator may save', () => {
  it('accepts a well-formed entry', () => {
    expect(validateEntry(input())).toBeNull();
  });

  it('offers the three shapes a row can describe, and no more', () => {
    expect(CREATABLE_AUTH_TYPES).toEqual([
      'SERVER_SIDE',
      'API_KEY_BEARER',
      'EXTERNAL_MCP',
    ]);
    // The shop-URL shape assembles its address from what a *user* types at
    // connect time, which is code rather than a column.
    expect(
      validateEntry(input({ authType: 'API_KEY_CUSTOM_HEADER' }))?.field,
    ).toBe('authType');
  });

  it('accepts scopes for an OAuth entry and refuses them for the others', () => {
    expect(
      validateEntry(
        input({ authType: 'EXTERNAL_MCP', scopes: ['search:read'] }),
      ),
    ).toBeNull();
    expect(
      validateEntry(
        input({ authType: 'API_KEY_BEARER', scopes: ['search:read'] }),
      )?.field,
    ).toBe('scopes');
  });

  it('enforces the slug format on creation only', () => {
    expect(validateEntry(input({ slug: 'Notion_2' }))?.field).toBe('slug');
    // The eleven built-ins SHOUT, and an edit must not be refused for a slug
    // that was legal when it was seeded and is immutable now.
    expect(
      validateEntry(input({ slug: 'GOOGLE_CALENDAR' }), { isNew: false }),
    ).toBeNull();
  });

  it('requires a name', () => {
    expect(validateEntry(input({ label: '  ' }))?.field).toBe('label');
  });

  it('refuses an icon that would render broken', () => {
    expect(validateEntry(input({ icon: 'notion.svg' }))?.field).toBe('icon');
    expect(validateEntry(input({ icon: '/assets/notion.svg' }))).toBeNull();
    expect(validateEntry(input({ icon: 'https://cdn.test/n.svg' }))).toBeNull();
  });
});

describe('the address check at save time', () => {
  it('refuses a private address by default, and says how to allow it', () => {
    expect(serverUrlFailure('http://10.0.0.5/mcp', false)).toMatch(
      /private or reserved/,
    );
    expect(serverUrlFailure('http://10.0.0.5/mcp', true)).toBeNull();
  });

  it('refuses the metadata address whatever the flag says', () => {
    // The whole justification for the opt-out is that these two sets do not
    // overlap: an operator's server is on RFC 1918, cloud metadata is not.
    for (const allow of [false, true]) {
      expect(
        serverUrlFailure('http://169.254.169.254/latest/', allow),
        `allowPrivate=${allow}`,
      ).toMatch(/link-local|private or reserved/);
    }
    expect(serverUrlFailure('http://[fd00:ec2::254]/', true)).not.toBeNull();
    expect(serverUrlFailure('http://localhost:8000/mcp', true)).not.toBeNull();
  });

  it('refuses something that is not a URL, and a scheme that is not HTTP', () => {
    expect(serverUrlFailure('mcp.notion.com', false)).toMatch(/full URL/);
    expect(serverUrlFailure('file:///etc/passwd', false)).toMatch(/http/);
  });

  /**
   * `protocolsFor` holds a credentialed connector to https when the session is
   * opened, which left the form accepting one over http: it saved, enabled,
   * and then failed every connection with nothing on the form having said so.
   * A private address does not excuse it — that flag widens which addresses
   * may be dialled, and a public hostname still resolves with it set.
   */
  it('refuses http for a credentialed entry, private address or not', () => {
    for (const allowPrivate of [false, true]) {
      expect(
        serverUrlFailure(
          'http://mcp.example.com/mcp',
          allowPrivate,
          'API_KEY_BEARER',
        ),
      ).toMatch(/needs https/);
      expect(
        serverUrlFailure('http://10.0.0.5/mcp', allowPrivate, 'EXTERNAL_MCP'),
      ).not.toBeNull();
    }
  });

  it('lets a server-side entry speak http, which is the shape ADR-52 is for', () => {
    expect(
      serverUrlFailure('http://10.0.0.5/mcp', true, 'SERVER_SIDE'),
    ).toBeNull();
  });

  it('holds a credentialed entry to https through validateEntry too', () => {
    expect(
      validateEntry(
        input({
          mcpServerUrl: 'http://10.0.0.5/mcp',
          authType: 'API_KEY_BEARER',
          allowsPrivateAddress: true,
        }),
      ),
    ).toEqual({
      field: 'mcpServerUrl',
      message: expect.stringMatching(/needs https/),
    });
  });
});

describe('valuesForAuthType', () => {
  const withScopes = input({
    authType: 'EXTERNAL_MCP',
    scopes: ['read', 'write'],
    useUserScope: true,
  });

  it('drops scopes when the type stops being an OAuth one', () => {
    // Left behind, they failed the save with the message attached to a field
    // the form no longer renders — a Save that did nothing and said nothing.
    const next = valuesForAuthType(withScopes, 'API_KEY_BEARER');

    expect(next.authType).toBe('API_KEY_BEARER');
    expect(next.scopes).toEqual([]);
    expect(next.useUserScope).toBe(false);
    expect(validateEntry(next)).toBeNull();
  });

  it('keeps them while the type is still EXTERNAL_MCP', () => {
    const next = valuesForAuthType(withScopes, 'EXTERNAL_MCP');

    expect(next.scopes).toEqual(['read', 'write']);
    expect(next.useUserScope).toBe(true);
  });

  it('leaves every other field alone', () => {
    const next = valuesForAuthType(withScopes, 'API_KEY_BEARER');

    expect(next.slug).toBe(withScopes.slug);
    expect(next.label).toBe(withScopes.label);
    expect(next.mcpServerUrl).toBe(withScopes.mcpServerUrl);
    expect(next.allowsPrivateAddress).toBe(withScopes.allowsPrivateAddress);
  });
});
