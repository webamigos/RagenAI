import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { expect, it, vi } from 'vitest';
import { authenticate } from '../auth.js';
import { resetEnvCache } from '../config/env.js';
import { createOAuthTokenVerifier } from '../oauth-token.js';

it('returns 503 for unavailable authorization keys while cached keys and API keys remain usable', async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const key = {
    ...(await exportJWK(publicKey)),
    kid: 'available',
    alg: 'EdDSA',
  };
  let available = false;
  let reads = 0;
  const server = createServer((_req, response) => {
    reads++;
    response.statusCode = available ? 200 : 503;
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify(available ? { keys: [key] } : { error: 'Down' }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const origin = `http://127.0.0.1:${address.port}`;
  const issuer = `${origin}/api/auth`;
  const resource = 'http://localhost:3300/mcp';
  const token = await new SignJWT({
    org: 'org',
    client_id: 'client',
    scope: 'mcp:read',
  })
    .setSubject('user')
    .setJti('id')
    .setIssuer(issuer)
    .setAudience(resource)
    .setExpirationTime('15m')
    .setProtectedHeader({ alg: 'EdDSA', kid: 'available' })
    .sign(privateKey);
  const request = (value: string) =>
    ({ headers: { authorization: value } }) as IncomingMessage;
  vi.stubEnv('TARGET_ENV', 'local');
  vi.stubEnv('MCP_OAUTH_ENABLED', 'true');
  vi.stubEnv('BETTER_AUTH_URL', origin);
  vi.stubEnv('RAGEN_MCP_PUBLIC_URL', resource);
  vi.stubEnv(
    'MCP_SERVICE_SECRET',
    'availability-service-secret-independent-2026',
  );
  resetEnvCache();
  try {
    const verify = createOAuthTokenVerifier(issuer, resource);
    await expect(verify(token)).rejects.toMatchObject({ status: 503 });
    try {
      await authenticate(request(`Bearer ${token}`));
      throw new Error('Expected authentication refusal');
    } catch (response) {
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(503);
      expect((response as Response).headers.get('Retry-After')).toBe('30');
      expect((response as Response).headers.has('WWW-Authenticate')).toBe(
        false,
      );
    }
    expect(await authenticate(request('Bearer sk-test-key'))).toEqual({
      kind: 'api_key',
      apiKey: 'Bearer sk-test-key',
    });
    available = true;
    expect(await verify(token)).toMatchObject({ userId: 'user', orgId: 'org' });
    const afterLoad = reads;
    available = false;
    expect(await verify(token)).toMatchObject({ userId: 'user' });
    expect(reads).toBe(afterLoad);
    const pieces = token.split('.');
    pieces[2] = `${pieces[2][0] === 'A' ? 'B' : 'A'}${pieces[2].slice(1)}`;
    await expect(verify(pieces.join('.'))).rejects.toMatchObject({
      status: 401,
    });
  } finally {
    vi.unstubAllEnvs();
    resetEnvCache();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
