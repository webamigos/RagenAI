import { createHash, createHmac } from 'crypto';
import { type ConfigService } from '@nestjs/config';
import { VaultClient, VaultNotConfiguredError } from './vault.client';

describe('VaultClient', () => {
  let client: VaultClient;
  const secret = 'test-secret-min-32-chars-long-xxxxx';
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    client = new VaultClient(configureWith('http://localhost:3100', secret));
  });

  function configureWith(url?: string, signingSecret?: string): ConfigService {
    return {
      get: jest.fn((key: string) => {
        if (key === 'RAGEN_TOKEN_VAULT_URL') return url;
        if (key === 'RAGEN_TOKEN_VAULT_SERVICE_SECRET') return signingSecret;
        return undefined;
      }),
    } as unknown as ConfigService;
  }

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  function mockFetchResponse(overrides: Record<string, unknown> = {}) {
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ ok: true }),
      text: () => Promise.resolve(''),
      ...overrides,
    };
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(response as unknown as Response);
    return fetchSpy;
  }

  describe('storeToken', () => {
    it('should PUT to vault with HMAC auth and timeout signal', async () => {
      const spy = mockFetchResponse();

      await client.storeToken('cust-1', 'provider', {
        access_token: 'token-123',
      });

      expect(spy).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const [url, options] = spy.mock.calls[0];
      expect(url).toBe('http://localhost:3100/v1/tokens/cust-1/provider');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(options.method).toBe('PUT');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(options.headers.Authorization).toMatch(
        /^HMAC-SHA256 ts=\d+,sig=[0-9a-f]+$/,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(options.headers['X-Service-Name']).toBe('ragen-api');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(options.signal).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      expect(JSON.parse(options.body)).toEqual({ access_token: 'token-123' });
    });
  });

  describe('retrieveToken', () => {
    it('should GET from vault and return token data', async () => {
      const tokenData = { access_token: 'tok-abc' };
      mockFetchResponse({
        json: () => Promise.resolve(tokenData),
      });

      const result = await client.retrieveToken('cust-1', 'provider');
      expect(result).toEqual(tokenData);
    });

    it('should return null when token is not found', async () => {
      mockFetchResponse({ ok: false, status: 404 });

      const result = await client.retrieveToken('cust-1', 'missing');
      expect(result).toBeNull();
    });
  });

  describe('deleteToken', () => {
    it('should DELETE from vault', async () => {
      const spy = mockFetchResponse({ headers: { get: () => null } });

      await client.deleteToken('cust-1', 'provider');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const [url, options] = spy.mock.calls[0];
      expect(url).toBe('http://localhost:3100/v1/tokens/cust-1/provider');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(options.method).toBe('DELETE');
    });
  });

  describe('URL encoding', () => {
    it('should encode special characters in customerId and provider', async () => {
      const spy = mockFetchResponse({ headers: { get: () => null } });

      await client.deleteToken('cust/1', 'pro/../vider');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const [url] = spy.mock.calls[0];
      expect(url).toBe(
        'http://localhost:3100/v1/tokens/cust%2F1/pro%2F..%2Fvider',
      );
    });
  });

  describe('HMAC signature correctness', () => {
    it('should compute correct HMAC-SHA256 signature', async () => {
      const spy = mockFetchResponse({ headers: { get: () => null } });

      await client.deleteToken('cust-1', 'provider');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const [, options] = spy.mock.calls[0];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const match = options.headers.Authorization.match(
        /^HMAC-SHA256 ts=(\d+),sig=([0-9a-f]+)$/,
      );
      expect(match).not.toBeNull();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const [, ts, sig] = match;
      const path = '/v1/tokens/cust-1/provider';
      const bodySha256 = createHash('sha256').update('').digest('hex');
      const message = `${ts}\nDELETE\n${path}\n${bodySha256}`;
      const expectedSig = createHmac('sha256', secret)
        .update(message)
        .digest('hex');

      expect(sig).toBe(expectedSig);
    });
  });

  describe('error handling', () => {
    it('should throw on non-ok, non-404 responses', async () => {
      mockFetchResponse({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
      });

      await expect(
        client.storeToken('cust-1', 'provider', { access_token: 'x' }),
      ).rejects.toThrow('Vault request failed (500): Internal error');
    });

    it('should propagate network errors', async () => {
      fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(client.retrieveToken('cust-1', 'provider')).rejects.toThrow(
        'ECONNREFUSED',
      );
    });
  });

  describe('when the installation runs no token vault', () => {
    // `src/config/env.ts` declares the pair allOrNone, so "neither" is a
    // supported configuration. Constructing must therefore stay silent —
    // this used to throw from onModuleInit and took the whole API down with
    // it, costing a self-hosted install chat, threads and notifications.
    it('constructs without the vault settings', () => {
      expect(() => new VaultClient(configureWith())).not.toThrow();
    });

    it('reports that it is not configured', () => {
      expect(new VaultClient(configureWith()).isConfigured()).toBe(false);
      expect(
        new VaultClient(configureWith('http://localhost:3100')).isConfigured(),
      ).toBe(false);
    });

    it('fails only when a call actually needs the vault', async () => {
      const unconfigured = new VaultClient(configureWith());

      await expect(
        unconfigured.retrieveToken('org:user', 'google'),
      ).rejects.toBeInstanceOf(VaultNotConfiguredError);
    });

    it('names both variables in the error, so the fix is obvious', async () => {
      const unconfigured = new VaultClient(configureWith());

      await expect(
        unconfigured.retrieveToken('org:user', 'google'),
      ).rejects.toThrow(
        /RAGEN_TOKEN_VAULT_URL[\s\S]*RAGEN_TOKEN_VAULT_SERVICE_SECRET/,
      );
    });
  });
});
