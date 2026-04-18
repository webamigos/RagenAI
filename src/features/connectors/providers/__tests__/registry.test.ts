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
      expect(manifest.provider).toBe(enumValue);
      expect(manifest.name).toBeTruthy();
      expect(manifest.description).toBeTruthy();
    }
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

  it('appends each known providers system prompt fragment', () => {
    const output = buildMcpContext(['CLICKUP', 'FIREFLIES'], timeZone, now);
    expect(output).toContain('For ClickUp:');
    expect(output).toContain('For Fireflies.ai');
  });

  it('injects the caller timezone into function-style fragments', () => {
    const output = buildMcpContext(['GOOGLE_CALENDAR'], timeZone, now);
    expect(output).toContain(`timeZone="${timeZone}"`);
  });

  it('skips unknown providers without throwing', () => {
    const output = buildMcpContext(
      ['HUBSPOT', 'NOT_A_REAL_PROVIDER'],
      timeZone,
      now,
    );
    expect(output).toContain('For HubSpot');
    expect(output).not.toContain('NOT_A_REAL_PROVIDER:');
  });

  it('includes the fragment for providers that define one', () => {
    const output = buildMcpContext(['WOOCOMMERCE'], timeZone, now);
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
