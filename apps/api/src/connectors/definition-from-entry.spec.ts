import type { McpCatalogEntryDto } from '@ragenai/platform-contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { definitionFromEntry } from './definition-from-entry.js';

const RAILWAY = 'http://ragen-mcp-rejestrio.railway.internal:9080/mcp';

const entry = (over: Partial<McpCatalogEntryDto> = {}): McpCatalogEntryDto => ({
  publicId: 'p1',
  slug: 'rejestrio',
  label: 'Rejestr.io',
  description: null,
  icon: null,
  lucideIcon: 'building-2',
  mcpServerUrl: RAILWAY,
  authType: 'SERVER_SIDE',
  authBaseUrl: null,
  authPath: null,
  scopes: [],
  useUserScope: false,
  oauthCredentialsStored: false,
  systemPrompt: null,
  allowsPrivateAddress: true,
  isBuiltIn: false,
  enabled: true,
  ...over,
});

const original = process.env.CONNECTOR_TRUSTED_HOSTS;
afterEach(() => {
  if (original === undefined) {
    delete process.env.CONNECTOR_TRUSTED_HOSTS;
  } else {
    process.env.CONNECTOR_TRUSTED_HOSTS = original;
  }
});

/**
 * apps/api opens the same catalogue connections apps/web does (tool calls
 * from the public API); the two copies must agree on which ones are guarded.
 */
describe('definitionFromEntry (api) — deployer-trusted hosts', () => {
  it('drops the address guard for a host the deployment trusts', () => {
    process.env.CONNECTOR_TRUSTED_HOSTS = '.railway.internal';
    expect(
      definitionFromEntry(entry(), undefined).addressGuard,
    ).toBeUndefined();
  });

  it('keeps it otherwise', () => {
    delete process.env.CONNECTOR_TRUSTED_HOSTS;
    expect(definitionFromEntry(entry(), undefined).addressGuard).toEqual({
      allowPrivate: true,
    });
  });

  it('keeps it when the connector also dials an address nobody vouched for', () => {
    process.env.CONNECTOR_TRUSTED_HOSTS = '.railway.internal';
    // A key registered at an untrusted authBaseUrl, or a shop URL an org user
    // types, must stay behind the guard even if the MCP host is trusted.
    expect(
      definitionFromEntry(
        entry({
          authType: 'API_KEY_BEARER',
          authBaseUrl: 'https://auth.example.com',
        }),
        undefined,
      ).addressGuard,
    ).toEqual({ allowPrivate: true });
    expect(
      definitionFromEntry(
        entry({ authType: 'API_KEY_CUSTOM_HEADER' }),
        undefined,
      ).addressGuard,
    ).toEqual({ allowPrivate: true });
  });
});
