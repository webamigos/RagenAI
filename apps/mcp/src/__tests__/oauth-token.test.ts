import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { createOAuthTokenVerifier } from '../oauth-token.js';

const issuer = 'https://auth.example/api/auth';
const resource = 'https://mcp.example/mcp';
let sign: (claims?: Record<string, unknown>) => Promise<string>;
let verify: ReturnType<typeof createOAuthTokenVerifier>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwk = await exportJWK(publicKey);
  verify = createOAuthTokenVerifier(
    issuer,
    resource,
    createLocalJWKSet({ keys: [{ ...jwk, kid: 'one', alg: 'EdDSA' }] }),
  );
  sign = (claims = {}) =>
    new SignJWT({
      sub: 'user',
      orgId: 'org',
      projectId: 'project',
      client_id: 'client',
      jti: 'token-id',
      scope: 'openid mcp:read',
      iss: issuer,
      aud: resource,
      exp: Math.floor(Date.now() / 1000) + 900,
      ...claims,
    })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'one' })
      .sign(privateKey);
});

describe('OAuth access token verification', () => {
  it('returns the verified identity and expiration', async () => {
    expect(await verify(await sign())).toEqual({
      userId: 'user',
      orgId: 'org',
      projectId: 'project',
      clientId: 'client',
      jti: 'token-id',
      expiresAt: expect.any(Number),
    });
  });
  it('accepts an organization-wide grant', async () => {
    expect(
      await verify(await sign({ projectId: undefined })),
    ).not.toHaveProperty('projectId');
  });
  it.each([
    { iss: 'https://attacker.example' },
    { aud: 'https://other.example/mcp' },
    { exp: 1 },
    { exp: undefined },
    { sub: undefined },
    { orgId: '' },
    { client_id: undefined },
    { jti: undefined },
    { projectId: 42 },
    { cnf: { jkt: 'proof-bound' } },
  ])('rejects invalid claims %j', async (claims) => {
    await expect(verify(await sign(claims))).rejects.toMatchObject({
      status: 401,
    });
  });
  it('rejects a modified signature', async () => {
    const token = await sign();
    const parts = token.split('.');
    parts[2] = `${parts[2][0] === 'A' ? 'B' : 'A'}${parts[2].slice(1)}`;
    await expect(verify(parts.join('.'))).rejects.toMatchObject({
      status: 401,
    });
  });
  it.each(['openid', 'mcp:read-write', undefined])(
    'requires the exact read scope (%s)',
    async (scope) => {
      await expect(verify(await sign({ scope }))).rejects.toMatchObject({
        status: 403,
      });
    },
  );
});
