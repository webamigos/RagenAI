import { describe, expect, it } from 'vitest';

import type { ProviderDefinition } from '../../contracts/connector.types';
import { blockedAddressReason } from '../refuse-blocked-address';

function definition(
  over: Partial<ProviderDefinition> = {},
): ProviderDefinition {
  return {
    provider: 'notion',
    name: 'Notion',
    description: '',
    icon: 'notebook',
    mcpServerUrl: 'https://mcp.notion.com/mcp',
    authType: 'external_mcp',
    ...over,
  };
}

describe('the address check on the OAuth hop', () => {
  it('exempts a built-in, whose URL is deployer-controlled', () => {
    // `MCP_GOOGLE_SERVER_URL` may legitimately be loopback — apps/api talks to
    // services on the same host — which is the exemption the policy has
    // always carried.
    const builtIn = definition({
      mcpServerUrl: 'http://localhost:8000',
      addressGuard: undefined,
    });
    expect(blockedAddressReason(builtIn, builtIn.mcpServerUrl)).toBeNull();
  });

  it('refuses a private address for an entry somebody typed', () => {
    const entry = definition({
      mcpServerUrl: 'http://10.0.0.5/mcp',
      addressGuard: { allowPrivate: false },
    });
    expect(blockedAddressReason(entry, entry.mcpServerUrl)).toMatch(
      /private or reserved/,
    );
  });

  it('admits a private address once the entry opts in', () => {
    const entry = definition({
      mcpServerUrl: 'http://10.0.0.5/mcp',
      addressGuard: { allowPrivate: true },
    });
    expect(blockedAddressReason(entry, entry.mcpServerUrl)).toBeNull();
  });

  it('still refuses the metadata address with the opt-in on, and says why', () => {
    const entry = definition({
      mcpServerUrl: 'http://169.254.169.254/latest/meta-data/',
      addressGuard: { allowPrivate: true },
    });
    expect(blockedAddressReason(entry, entry.mcpServerUrl)).toMatch(
      /cloud metadata/,
    );
  });

  it('refuses a URL that is not one', () => {
    const entry = definition({
      mcpServerUrl: 'not a url',
      addressGuard: { allowPrivate: false },
    });
    expect(blockedAddressReason(entry, entry.mcpServerUrl)).toMatch(
      /not a valid URL/,
    );
  });
});
