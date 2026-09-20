import { describe, expect, it } from 'vitest';
import { McpConnectorProvider } from '@/generated/prisma/client';
import {
  PROVIDER_LIST,
  PROVIDER_REGISTRY,
  PUBLIC_PROVIDER_LIST,
  getProvider,
  toPublicProviderDto,
} from '../registry';
import { buildMcpContext } from '../system-prompt';

describe('PROVIDER_REGISTRY', () => {
  it('covers every McpConnectorProvider enum value', () => {
    const enumValues = Object.values(McpConnectorProvider).sort();
    const registryKeys = Object.keys(PROVIDER_REGISTRY).sort();
    expect(registryKeys).toEqual(enumValues);
  });

  it('exposes PROVIDER_LIST with one entry per registry key', () => {
    expect(PROVIDER_LIST).toHaveLength(Object.keys(PROVIDER_REGISTRY).length);
    const listProviders = PROVIDER_LIST.map((p) => p.provider).sort();
    expect(listProviders).toEqual(Object.keys(PROVIDER_REGISTRY).sort());
  });

  it('returns the manifest for every enum value via getProvider', () => {
    for (const enumValue of Object.values(McpConnectorProvider)) {
      const manifest = getProvider(enumValue);
      expect(manifest).toBeDefined();
      expect(manifest?.provider).toBe(enumValue);
      expect(manifest?.name).toBeTruthy();
      expect(manifest?.description).toBeTruthy();
    }
  });

  it('answers undefined for a slug no manifest carries', () => {
    // A connector added from the admin panel has no manifest at all, and a
    // row can name a slug this build has never heard of. That is a supported
    // state, not a crash — see the B4 resolver.
    expect(getProvider('notion')).toBeUndefined();
  });

  it('uses stable string identifiers matching enum values', () => {
    for (const [key, manifest] of Object.entries(PROVIDER_REGISTRY)) {
      expect(manifest.provider).toBe(key);
    }
  });
});

describe('buildMcpContext', () => {
  const timeZone = 'Europe/Warsaw';
  const now = '2026-04-16 10:30:00';

  it('includes the header with the enabled providers and time', () => {
    const output = buildMcpContext(['CLICKUP', 'HUBSPOT'], timeZone, now);
    expect(output).toContain('CLICKUP, HUBSPOT');
    expect(output).toContain(timeZone);
    expect(output).toContain(now);
  });

  // The fragments arrive as resolved definitions — a catalogue row merged
  // with its behaviour pack — rather than being looked up here, because a
  // connector an operator added carries its prompt on its row and the registry
  // only knows the eleven that ship with Ragen. The packs are what a built-in
  // resolves to, so passing them is the built-in case.
  it('appends each connectors system prompt fragment', () => {
    const output = buildMcpContext(
      ['CLICKUP', 'FIREFLIES'],
      timeZone,
      now,
      PROVIDER_REGISTRY,
    );
    expect(output).toContain('For ClickUp:');
    expect(output).toContain('For Fireflies.ai');
  });

  it('injects the caller timezone into function-style fragments', () => {
    const output = buildMcpContext(
      ['GOOGLE_CALENDAR'],
      timeZone,
      now,
      PROVIDER_REGISTRY,
    );
    expect(output).toContain(`timeZone="${timeZone}"`);
  });

  it('skips a connector nothing resolved, without throwing', () => {
    const output = buildMcpContext(
      ['HUBSPOT', 'NOT_A_REAL_PROVIDER'],
      timeZone,
      now,
      PROVIDER_REGISTRY,
    );
    expect(output).toContain('For HubSpot');
    expect(output).not.toContain('NOT_A_REAL_PROVIDER:');
  });

  it('takes a prompt off a row with no behaviour pack at all', () => {
    // The whole point of the catalogue: Notion is a row, and its prompt is
    // text on that row.
    const output = buildMcpContext(['notion'], timeZone, now, {
      notion: {
        provider: 'notion',
        name: 'Notion',
        description: 'Search pages.',
        icon: 'notebook',
        mcpServerUrl: 'https://mcp.notion.com/mcp',
        systemPromptFragment: 'For Notion: search before you answer.',
      },
    });
    expect(output).toContain('For Notion: search before you answer.');
  });

  it('includes the fragment for providers that define one', () => {
    const output = buildMcpContext(
      ['WOOCOMMERCE'],
      timeZone,
      now,
      PROVIDER_REGISTRY,
    );
    expect(output).toContain('For WooCommerce');
  });
});

describe('toPublicProviderDto', () => {
  // Anything here is a potential client-side secret leak. Keep this list
  // in sync with ProviderDefinition if new sensitive fields are added.
  const SENSITIVE_FIELDS = [
    'oauthClientSecret',
    'oauthClientId',
    'systemPromptFragment',
    'useUserScope',
    'headerName',
    'mcpServerUrlPath',
  ];

  it('never exposes server-only fields for any registered provider', () => {
    for (const manifest of PROVIDER_LIST) {
      const dto = toPublicProviderDto(manifest);
      for (const field of SENSITIVE_FIELDS) {
        expect(dto).not.toHaveProperty(field);
      }
    }
  });

  it('exposes every provider via PUBLIC_PROVIDER_LIST with identical ids', () => {
    const expected = PROVIDER_LIST.map((p) => p.provider).sort();
    const actual = PUBLIC_PROVIDER_LIST.map((p) => p.provider).sort();
    expect(actual).toEqual(expected);
  });

  it('preserves fields the connectors UI needs', () => {
    const hubspot = PROVIDER_REGISTRY.HUBSPOT;
    const dto = toPublicProviderDto(hubspot);
    expect(dto.name).toBe(hubspot.name);
    expect(dto.provider).toBe(hubspot.provider);
    expect(dto.authType).toBe(hubspot.authType);
    expect(dto.mcpServerUrl).toBe(hubspot.mcpServerUrl);
  });

  it('strips OAuth secrets that the server manifest carries', () => {
    // HubSpot and Slack both read oauthClientSecret from env at module
    // load — the public DTO must never leak them to a browser.
    const hubspotDto = toPublicProviderDto(PROVIDER_REGISTRY.HUBSPOT);
    const slackDto = toPublicProviderDto(PROVIDER_REGISTRY.SLACK);
    expect(hubspotDto).not.toHaveProperty('oauthClientSecret');
    expect(slackDto).not.toHaveProperty('oauthClientSecret');
  });
});
