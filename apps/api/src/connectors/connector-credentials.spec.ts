import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetToken = vi.fn();
vi.mock('../ragen-vault/index.js', () => ({
  ragenAuthClient: {
    getToken: (...args: unknown[]) => mockGetToken(...args),
  },
}));

const { getConnectorOAuthCredentials } =
  await import('./connector-credentials.js');

type Definition = Parameters<typeof getConnectorOAuthCredentials>[0];

function definition(overrides: Partial<Definition> = {}): Definition {
  return {
    provider: 'notion',
    name: 'Notion',
    authType: 'external_mcp',
    mcpServerUrl: 'https://mcp.notion.com/mcp',
    ...overrides,
  } as Definition;
}

describe('getConnectorOAuthCredentials', () => {
  beforeEach(() => {
    mockGetToken.mockReset();
  });

  it('uses the environment-provided credentials a behaviour pack carries', async () => {
    const credentials = await getConnectorOAuthCredentials(
      definition({ oauthClientId: 'env-id', oauthClientSecret: 'env-secret' }),
    );

    expect(credentials).toEqual({
      clientId: 'env-id',
      clientSecret: 'env-secret',
    });
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it('reads an operator entry credentials from the vault, under the catalogue address', async () => {
    mockGetToken.mockResolvedValue({
      clientId: 'vault-id',
      clientSecret: 'vault-secret',
    });

    const credentials = await getConnectorOAuthCredentials(
      definition({ oauthCredentialsStored: true }),
    );

    expect(credentials).toEqual({
      clientId: 'vault-id',
      clientSecret: 'vault-secret',
    });
    expect(mockGetToken).toHaveBeenCalledWith('ragen-catalogue', 'notion');
  });

  it('does not reach the vault for an entry that stores nothing there', async () => {
    const credentials = await getConnectorOAuthCredentials(definition());

    expect(credentials).toEqual({});
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it('answers with no credentials when the vault is unreachable, rather than throwing', async () => {
    mockGetToken.mockRejectedValue(new Error('vault down'));

    await expect(
      getConnectorOAuthCredentials(
        definition({ oauthCredentialsStored: true }),
      ),
    ).resolves.toEqual({});
  });
});
