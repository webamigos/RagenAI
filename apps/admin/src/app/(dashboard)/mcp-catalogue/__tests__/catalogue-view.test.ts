import type { McpCatalogEntryDto } from '@ragenai/platform-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  organizationsAllowing,
  resolveServerUrl,
  toCatalogueEntryView,
} from '../catalogue-view';

function entry(over: Partial<McpCatalogEntryDto> = {}): McpCatalogEntryDto {
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

const ORGS = [
  { id: 'org-1', name: 'Acme', allowedConnectors: [] as string[] },
  { id: 'org-2', name: 'Beta', allowedConnectors: ['SLACK'] },
];

describe('the server address a catalogue entry resolves to', () => {
  const ORIGINAL = process.env.MCP_SLACK_SERVER_URL;

  beforeEach(() => {
    process.env.MCP_SLACK_SERVER_URL = 'https://slack.internal/mcp';
  });

  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.MCP_SLACK_SERVER_URL;
    } else {
      process.env.MCP_SLACK_SERVER_URL = ORIGINAL;
    }
  });

  it('takes the row when it has one', () => {
    expect(resolveServerUrl(entry())).toEqual({
      serverUrl: 'https://mcp.notion.com/mcp',
      serverUrlSource: 'row',
      serverUrlVariable: null,
    });
  });

  it("reads a built-in's from the environment, and names the variable", () => {
    // The column is null on purpose: seeding the value a migration happens to
    // see would mean a restored database points the connector elsewhere.
    expect(
      resolveServerUrl(
        entry({ slug: 'SLACK', mcpServerUrl: null, isBuiltIn: true }),
      ),
    ).toEqual({
      serverUrl: 'https://slack.internal/mcp',
      serverUrlSource: 'environment',
      serverUrlVariable: 'MCP_SLACK_SERVER_URL',
    });
  });

  it('says so when the address is assembled per connector', () => {
    expect(
      resolveServerUrl(
        entry({
          slug: 'WOOCOMMERCE',
          mcpServerUrl: null,
          authType: 'API_KEY_CUSTOM_HEADER',
        }),
      ).serverUrlSource,
    ).toBe('per-connector');
  });

  it('says "unset" rather than guessing for a row with no address', () => {
    expect(
      resolveServerUrl(entry({ mcpServerUrl: null })).serverUrl,
    ).toBeNull();
    expect(
      resolveServerUrl(entry({ mcpServerUrl: null })).serverUrlSource,
    ).toBe('unset');
  });
});

describe('which organizations may use an entry', () => {
  it('is every organization when no tier restricts anything', () => {
    expect(
      organizationsAllowing(
        entry(),
        [],
        [{ id: 'org-1', name: 'Acme', allowedConnectors: [] }],
      ),
    ).toBeNull();
  });

  it('is the ones whose allowlist names it, once any list exists', () => {
    expect(
      organizationsAllowing(entry({ slug: 'SLACK' }), [], ORGS)?.map(
        (o) => o.name,
      ),
    ).toEqual(['Acme', 'Beta']);

    expect(
      organizationsAllowing(entry({ slug: 'notion' }), [], ORGS)?.map(
        (o) => o.name,
      ),
    ).toEqual(['Acme']);
  });

  it('is narrowed by the platform default as well', () => {
    expect(
      organizationsAllowing(entry({ slug: 'notion' }), ['SLACK'], ORGS),
    ).toEqual([]);
  });

  it('is none for a disabled entry, without blaming the allowlist', () => {
    const view = toCatalogueEntryView(entry({ enabled: false }), [], ORGS);
    expect(view.organizations).toEqual([]);
  });
});
