import { beforeEach, describe, expect, it, vi } from 'vitest';

const getToken = vi.fn();

vi.mock('@/libs/ragen-vault', () => ({
  ragenAuthClient: { getToken: (...a: unknown[]) => getToken(...a) },
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import type { ProviderDefinition } from '../../../contracts/connector.types';
import { getConnectorOAuthCredentialsQuery } from '../get-connector-credentials-query';

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

describe('where a connector gets its OAuth client credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('takes a built-in’s from the environment, and asks no vault', async () => {
    // `SLACK_MCP_CLIENT_ID` and its siblings are read at module load by the
    // behaviour pack, which is where they have always been.
    const credentials = await getConnectorOAuthCredentialsQuery(
      definition({
        provider: 'SLACK',
        oauthClientId: 'from-env',
        oauthClientSecret: 'also-from-env',
      }),
    );

    expect(credentials).toEqual({
      clientId: 'from-env',
      clientSecret: 'also-from-env',
    });
    expect(getToken).not.toHaveBeenCalled();
  });

  it('reads an operator entry’s from the vault, under the catalogue id', async () => {
    getToken.mockResolvedValue({
      clientId: 'from-vault',
      clientSecret: 'secret-from-vault',
    });

    const credentials = await getConnectorOAuthCredentialsQuery(
      definition({ oauthCredentialsStored: true }),
    );

    expect(getToken).toHaveBeenCalledWith('ragen-catalogue', 'notion');
    expect(credentials).toEqual({
      clientId: 'from-vault',
      clientSecret: 'secret-from-vault',
    });
  });

  it('asks nothing when the row says nothing is stored', async () => {
    expect(
      await getConnectorOAuthCredentialsQuery(
        definition({ oauthCredentialsStored: false }),
      ),
    ).toEqual({});
    expect(getToken).not.toHaveBeenCalled();
  });

  it('answers empty when the vault is unreachable, rather than throwing', async () => {
    // The caller decides what no credentials means: for an external_mcp
    // connector that is a failed connect with a reason on the row, which is
    // the existing behaviour when the vault is down.
    getToken.mockRejectedValue(new Error('vault down'));

    expect(
      await getConnectorOAuthCredentialsQuery(
        definition({ oauthCredentialsStored: true }),
      ),
    ).toEqual({});
  });
});
