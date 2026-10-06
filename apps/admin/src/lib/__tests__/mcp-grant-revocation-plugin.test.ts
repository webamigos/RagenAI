import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { expect, it } from 'vitest';
import { mcpGrantRevocationPlugin } from '../mcp-grant-revocation-plugin';

it('revokes banned user grants in every workspace without exposing an OAuth issuer', async () => {
  const data: Record<string, Record<string, unknown>[]> = Object.fromEntries(
    [
      'user',
      'session',
      'account',
      'verification',
      'oauthClient',
      'oauthResource',
      'oauthClientResource',
      'oauthConsent',
      'oauthRefreshToken',
      'oauthAccessToken',
      'oauthClientAssertion',
      'jwks',
    ].map((model) => [model, []]),
  );
  data.user.push(
    { id: 'banned', banned: true },
    { id: 'other', banned: false },
  );
  for (const model of ['oauthConsent', 'oauthRefreshToken', 'oauthAccessToken'])
    data[model].push(
      { id: 'one', userId: 'banned', referenceId: 'org-one:all' },
      { id: 'two', userId: 'banned', referenceId: 'org-two:all' },
      { id: 'keep', userId: 'other', referenceId: 'org-one:all' },
    );
  const plugin = mcpGrantRevocationPlugin();
  expect(plugin.endpoints.revokeBannedUserMcpGrants.options).toHaveProperty(
    'metadata.SERVER_ONLY',
    true,
  );
  const auth = betterAuth({
    baseURL: 'http://localhost:3002',
    secret: 'admin-revocation-secret-at-least-32-characters',
    database: memoryAdapter(data),
    plugins: [plugin],
  });
  await expect(
    auth.api.revokeBannedUserMcpGrants({ body: { userId: 'other' } }),
  ).rejects.toMatchObject({ status: 'FORBIDDEN' });
  expect(data.oauthConsent).toHaveLength(3);
  await auth.api.revokeBannedUserMcpGrants({ body: { userId: 'banned' } });
  for (const model of ['oauthConsent', 'oauthRefreshToken', 'oauthAccessToken'])
    expect(data[model].map((row) => row.id)).toEqual(['keep']);
  expect(
    (
      await auth.handler(
        new Request('http://localhost:3002/api/auth/oauth2/token', {
          method: 'POST',
        }),
      )
    ).status,
  ).toBe(404);
});
