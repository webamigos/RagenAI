import { describe, expect, it } from 'vitest';

import {
  CREATABLE_AUTH_TYPES,
  serverUrlFailure,
  validateEntry,
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
    ...over,
  };
}

describe('what an operator may save', () => {
  it('accepts a well-formed entry', () => {
    expect(validateEntry(input())).toBeNull();
  });

  it('offers only the shapes a row can carry on its own', () => {
    // `EXTERNAL_MCP` needs client credentials in the vault, which is Phase D.
    expect(CREATABLE_AUTH_TYPES).toEqual(['SERVER_SIDE', 'API_KEY_BEARER']);
    expect(validateEntry(input({ authType: 'EXTERNAL_MCP' }))?.field).toBe(
      'authType',
    );
    expect(
      validateEntry(input({ authType: 'API_KEY_CUSTOM_HEADER' }))?.field,
    ).toBe('authType');
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
});
