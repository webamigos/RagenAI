import { beforeEach, describe, expect, it, vi } from 'vitest';
const verify = vi.hoisted(() => vi.fn());
vi.mock('@better-auth/oauth-provider', () => ({
  verifyOAuthQueryParams: verify,
}));
vi.mock('../auth', () => ({
  auth: { $context: Promise.resolve({ secret: 'test-only-secret' }) },
}));
import { verifiedMcpQuery } from '../mcp-connect-flow';
describe('signed connection requests', () => {
  beforeEach(() => vi.resetAllMocks());
  it('refuses expired or tampered query before using the client or redirect', async () => {
    verify.mockResolvedValue(false);
    await expect(
      verifiedMcpQuery('client_id=attacker&redirect_uri=https://evil.example'),
    ).rejects.toThrow('expired or is invalid');
  });
  it('returns the client and prominently displayed redirect host only after verification', async () => {
    verify.mockResolvedValue(true);
    const query =
      'client_id=client-a&redirect_uri=https%3A%2F%2Fclient.example%3A8443%2Fcallback&scope=mcp%3Aread';
    expect(await verifiedMcpQuery(query)).toMatchObject({
      clientId: 'client-a',
      redirectHost: 'client.example:8443',
    });
    expect(verify).toHaveBeenCalledWith(query, 'test-only-secret');
  });
  it.each([
    'client_id=client-a',
    'redirect_uri=https://client.example/callback',
  ])('refuses incomplete signed request %s', async (query) => {
    verify.mockResolvedValue(true);
    await expect(verifiedMcpQuery(query)).rejects.toThrow('Incomplete');
  });
});
