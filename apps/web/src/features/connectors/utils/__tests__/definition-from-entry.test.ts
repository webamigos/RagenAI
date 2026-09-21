import type { McpCatalogEntryDto } from '@ragenai/platform-contracts';
import { describe, expect, it } from 'vitest';

import type { ProviderDefinition } from '../../contracts/connector.types';
import { definitionFromEntry } from '../definition-from-entry';

function entry(over: Partial<McpCatalogEntryDto> = {}): McpCatalogEntryDto {
  return {
    publicId: 'public-1',
    slug: 'notion',
    label: 'Notion',
    description: 'Search pages and databases.',
    icon: '/assets/connectors/notion.svg',
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

const GOOGLE_PACK: ProviderDefinition = {
  provider: 'GOOGLE_CALENDAR',
  name: 'Google Calendar',
  description: 'View calendar events and check availability.',
  icon: 'calendar',
  // Read from `MCP_GOOGLE_SERVER_URL` at module load, which is why the row
  // leaves it null.
  mcpServerUrl: 'http://localhost:8000',
  authBaseUrl: 'http://localhost:8000',
  authPath: '/auth/google',
  systemPromptFragment: ({ timeZone }) => `timeZone=${timeZone}`,
};

describe('a catalogue row resolved into a provider definition', () => {
  it('resolves completely with no behaviour pack — which is the point', () => {
    const definition = definitionFromEntry(entry(), undefined);

    expect(definition).toMatchObject({
      provider: 'notion',
      name: 'Notion',
      description: 'Search pages and databases.',
      icon: 'notebook',
      mcpServerUrl: 'https://mcp.notion.com/mcp',
      authType: 'external_mcp',
    });
  });

  it("takes a built-in's server address from its pack, because the row has none", () => {
    const definition = definitionFromEntry(
      entry({
        slug: 'GOOGLE_CALENDAR',
        label: 'Google Calendar',
        mcpServerUrl: null,
        authBaseUrl: null,
        authPath: '/auth/google',
        authType: 'OAUTH',
        isBuiltIn: true,
      }),
      GOOGLE_PACK,
    );

    expect(definition.mcpServerUrl).toBe('http://localhost:8000');
    expect(definition.authBaseUrl).toBe('http://localhost:8000');
    expect(definition.authPath).toBe('/auth/google');
  });

  it('prefers the row over the pack for everything the row can hold', () => {
    const definition = definitionFromEntry(
      entry({
        slug: 'GOOGLE_CALENDAR',
        label: 'Kalendarz',
        mcpServerUrl: 'https://moved.test/mcp',
        scopes: ['https://www.googleapis.com/auth/calendar'],
        systemPrompt: 'For Google Calendar:',
      }),
      GOOGLE_PACK,
    );

    expect(definition.name).toBe('Kalendarz');
    expect(definition.mcpServerUrl).toBe('https://moved.test/mcp');
    expect(definition.scopes).toEqual([
      'https://www.googleapis.com/auth/calendar',
    ]);
    expect(definition.systemPromptFragment).toBe('For Google Calendar:');
  });

  it('keeps a prompt fragment that must compute in code', () => {
    const definition = definitionFromEntry(
      entry({ slug: 'GOOGLE_CALENDAR', systemPrompt: null }),
      GOOGLE_PACK,
    );

    const fragment = definition.systemPromptFragment;
    expect(typeof fragment).toBe('function');
    expect(
      typeof fragment === 'function'
        ? fragment({ timeZone: 'Europe/Warsaw' })
        : fragment,
    ).toBe('timeZone=Europe/Warsaw');
  });

  it('never takes credentials from a row', () => {
    // ADR-32: OAuth client secrets live in ragen-token-vault, never in a
    // column, so they can only ever arrive from the pack's environment read.
    const definition = definitionFromEntry(entry(), {
      ...GOOGLE_PACK,
      oauthClientId: 'client-id',
      oauthClientSecret: 'client-secret',
    });

    expect(definition.oauthClientId).toBe('client-id');
    expect(definition.oauthClientSecret).toBe('client-secret');
    expect(Object.keys(entry())).not.toContain('oauthClientSecret');
  });

  it('maps every auth shape the catalogue can hold', () => {
    const shapes = {
      SERVER_SIDE: 'server_side',
      API_KEY_BEARER: 'api_key_bearer',
      EXTERNAL_MCP: 'external_mcp',
      API_KEY_CUSTOM_HEADER: 'api_key_custom_header',
      OAUTH: 'oauth',
      API_KEY: 'api_key',
    } as const;

    for (const [row, definition] of Object.entries(shapes)) {
      expect(
        definitionFromEntry(
          entry({ authType: row as McpCatalogEntryDto['authType'] }),
          undefined,
        ).authType,
      ).toBe(definition);
    }
  });
});

describe('the icon a card renders', () => {
  it("takes the row's own asset when it has one", () => {
    expect(
      definitionFromEntry(
        entry({ icon: 'https://cdn.test/notion.svg' }),
        undefined,
      ).iconUrl,
    ).toBe('https://cdn.test/notion.svg');
  });

  it('falls back to the built-in asset this app ships', () => {
    expect(
      definitionFromEntry(entry({ slug: 'SLACK', icon: null }), undefined)
        .iconUrl,
    ).toBe('/assets/connectors/slack.svg');
  });

  it('is null when nothing has one, so the card renders the lucide icon', () => {
    // An `<img>` with no `src` renders as a broken image, which is what an
    // entry an operator added would have shown before this.
    const definition = definitionFromEntry(
      entry({ slug: 'notion', icon: null, lucideIcon: 'notebook' }),
      undefined,
    );
    expect(definition.iconUrl).toBeNull();
    expect(definition.icon).toBe('notebook');
  });
});

describe('the row is the whole answer for scopes and user-scope', () => {
  const SLACK_PACK = {
    ...GOOGLE_PACK,
    provider: 'SLACK',
    scopes: ['search:read.public', 'channels:history'],
    useUserScope: true,
  } as unknown as ProviderDefinition;

  it('lets an operator clear the scopes a built-in ships with', () => {
    // Falling back to the pack on an empty list made this impossible to say:
    // "no scopes" and "I did not set scopes" were the same value.
    const definition = definitionFromEntry(
      entry({ slug: 'SLACK', scopes: [] }),
      SLACK_PACK,
    );

    expect(definition.scopes).toEqual([]);
  });

  it('lets an operator turn off the Slack user_scope rewrite', () => {
    const definition = definitionFromEntry(
      entry({ slug: 'SLACK', useUserScope: false }),
      SLACK_PACK,
    );

    expect(definition.useUserScope).toBe(false);
  });

  it('still carries what the seeded row does hold', () => {
    const definition = definitionFromEntry(
      entry({
        slug: 'SLACK',
        scopes: ['search:read.public'],
        useUserScope: true,
      }),
      SLACK_PACK,
    );

    expect(definition.scopes).toEqual(['search:read.public']);
    expect(definition.useUserScope).toBe(true);
  });
});
