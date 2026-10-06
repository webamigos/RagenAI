import { createServer } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { expect, it, vi } from 'vitest';

import { createOAuthTokenVerifier } from '../oauth-token.js';

it('caches remote JWKS and refetches for a rotated kid after its bounded cooldown', async () => {
  const first = await generateKeyPair('EdDSA');
  const second = await generateKeyPair('EdDSA');
  const firstJwk = {
    ...(await exportJWK(first.publicKey)),
    kid: 'first',
    alg: 'EdDSA',
  };
  const secondJwk = {
    ...(await exportJWK(second.publicKey)),
    kid: 'second',
    alg: 'EdDSA',
  };
  let keys = [firstJwk];
  let reads = 0;
  const server = createServer((request, response) => {
    expect(request.url).toBe('/api/auth/jwks');
    reads++;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ keys }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const issuer = `http://127.0.0.1:${address.port}/api/auth`;
  const resource = 'https://mcp.example/mcp';
  const verify = createOAuthTokenVerifier(issuer, resource);
  const sign = (key: typeof first.privateKey, kid: string) =>
    new SignJWT({ org: 'org', client_id: 'client', scope: 'mcp:read' })
      .setSubject('user')
      .setJti(kid)
      .setIssuer(issuer)
      .setAudience(resource)
      .setExpirationTime('15m')
      .setProtectedHeader({ alg: 'EdDSA', kid })
      .sign(key);
  try {
    const token = await sign(first.privateKey, 'first');
    await verify(token);
    await verify(token);
    expect(reads).toBe(1);
    keys = [firstJwk, secondJwk];
    const rotated = await sign(second.privateKey, 'second');
    // JOSE's default 30s cooldown bounds network requests for attacker-chosen kids.
    await expect(verify(rotated)).rejects.toMatchObject({ status: 401 });
    expect(reads).toBe(1);
    const afterCooldown = Date.now() + 31_000;
    vi.spyOn(Date, 'now').mockReturnValue(afterCooldown);
    expect(await verify(rotated)).toMatchObject({ jti: 'second' });
    expect(reads).toBe(2);
    await verify(rotated);
    expect(reads).toBe(2);
  } finally {
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
