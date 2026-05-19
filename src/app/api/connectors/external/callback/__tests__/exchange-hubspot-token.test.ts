import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@ai-sdk/mcp', () => ({ auth: vi.fn() }));
vi.mock('@ragenai/prisma-client', () => ({
  default: { mcpConnector: { upsert: vi.fn() } },
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: vi.fn(),
  getCurrentUserId: vi.fn(),
}));
vi.mock('@/features/connectors/constants/providers', () => ({
  getProviderDefinition: vi.fn(),
}));
vi.mock('@/libs/ragen-vault', () => ({
  RagenAuthOAuthClientProvider: class {},
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { exchangeHubspotToken } from '../route';

const buildOAuthProvider = () =>
  ({
    saveTokens: vi.fn(),
  }) as unknown as Parameters<typeof exchangeHubspotToken>[0];

describe('exchangeHubspotToken', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('POSTs to api.hubapi.com with form-encoded standard OAuth params and saves the returned token', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'acc-1',
          refresh_token: 'ref-1',
          token_type: 'bearer',
          expires_in: 1800,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const oauthProvider = buildOAuthProvider();
    await exchangeHubspotToken(
      oauthProvider,
      'auth-code',
      'https://app.ragen.ai/cb',
      'client-id',
      'client-secret',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.hubapi.com/oauth/v1/token');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });

    const body = (init as RequestInit).body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('redirect_uri')).toBe('https://app.ragen.ai/cb');
    expect(body.get('client_id')).toBe('client-id');
    expect(body.get('client_secret')).toBe('client-secret');
    // PKCE must NOT be sent — HubSpot's classic OAuth doesn't expect it and
    // we never sent code_challenge on the authorize URL either.
    expect(body.get('code_verifier')).toBeNull();

    expect(oauthProvider.saveTokens).toHaveBeenCalledWith({
      access_token: 'acc-1',
      token_type: 'bearer',
      refresh_token: 'ref-1',
      expires_in: 1800,
    });
  });

  it('throws when HubSpot returns a non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response('invalid_grant', { status: 400 }));
    const oauthProvider = buildOAuthProvider();

    await expect(
      exchangeHubspotToken(oauthProvider, 'code', 'cb', 'cid', 'csecret'),
    ).rejects.toThrow(/HubSpot token exchange HTTP error: 400/);
    expect(oauthProvider.saveTokens).not.toHaveBeenCalled();
  });

  it('throws when HubSpot returns 200 with no access_token', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'no_token' }), { status: 200 }),
    );
    const oauthProvider = buildOAuthProvider();

    await expect(
      exchangeHubspotToken(oauthProvider, 'code', 'cb', 'cid', 'csecret'),
    ).rejects.toThrow('No access_token in HubSpot token response');
    expect(oauthProvider.saveTokens).not.toHaveBeenCalled();
  });

  it('defaults token_type to "bearer" when HubSpot omits it', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'acc-only' }), {
        status: 200,
      }),
    );
    const oauthProvider = buildOAuthProvider();

    await exchangeHubspotToken(oauthProvider, 'code', 'cb', 'cid', 'csecret');

    expect(oauthProvider.saveTokens).toHaveBeenCalledWith(
      expect.objectContaining({ token_type: 'bearer' }),
    );
  });
});
