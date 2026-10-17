/**
 * A minimal OpenID Connect issuer for the company sign-in e2e spec (p0-38).
 *
 * Real enough for Better Auth's generic OAuth plugin to run its whole path:
 * discovery, an authorization-code redirect carrying `state` and `nonce`, a
 * token exchange returning an RS256-signed `id_token` it verifies against the
 * JWKS, and the userinfo call. Nothing about it is a real identity provider:
 * there is no login screen, and the identity it vouches for is whatever the
 * spec last posted to `/__identity`.
 *
 *   GET  /.well-known/openid-configuration
 *   GET  /authorize      → 302 back to redirect_uri with a code
 *   POST /token          → id_token + access_token
 *   GET  /userinfo       → the identity
 *   GET  /jwks
 *   POST /__identity     → { email, email_verified?, name?, sub? } for the next sign-in
 *   GET  /health
 *
 * node:crypto only: the suite should not depend on a JOSE library being
 * hoisted into node_modules by something else.
 */

import http from 'http';
import { createSign, generateKeyPairSync, randomBytes } from 'crypto';

const PORT = parseInt(process.env.MOCK_OIDC_PORT || '4300', 10);
const ISSUER = `http://localhost:${PORT}`;
const KID = 'mock-oidc-key';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: KID,
  alg: 'RS256',
  use: 'sig',
};

type Identity = {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
};

let nextIdentity: Identity = {
  sub: 'mock-user',
  email: 'jan@oidc-e2e.test',
  email_verified: true,
  name: 'Jan Mock',
};

const codes = new Map<
  string,
  { identity: Identity; nonce?: string; clientId: string }
>();
const accessTokens = new Map<string, Identity>();

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString('base64url');

function signJwt(payload: Record<string, unknown>): string {
  const header = base64url(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }),
  );
  const body = base64url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${body}`);
  return `${header}.${body}.${base64url(signer.sign(privateKey))}`;
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', ISSUER);

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/.well-known/openid-configuration') {
    return json(res, 200, {
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      userinfo_endpoint: `${ISSUER}/userinfo`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'email', 'profile'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [
        'client_secret_post',
        'client_secret_basic',
      ],
    });
  }

  if (url.pathname === '/jwks') {
    return json(res, 200, { keys: [jwk] });
  }

  if (url.pathname === '/__identity' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)) || '{}') as Partial<Identity>;
    nextIdentity = {
      sub: body.sub ?? `sub-${randomBytes(6).toString('hex')}`,
      email: body.email ?? nextIdentity.email,
      email_verified: body.email_verified ?? true,
      name: body.name ?? 'Mock User',
    };
    return json(res, 200, nextIdentity);
  }

  if (url.pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const clientId = url.searchParams.get('client_id') ?? '';
    if (!redirectUri) {
      return json(res, 400, { error: 'invalid_request' });
    }
    const code = randomBytes(16).toString('hex');
    codes.set(code, {
      identity: nextIdentity,
      nonce: url.searchParams.get('nonce') ?? undefined,
      clientId,
    });
    const back = new URL(redirectUri);
    back.searchParams.set('code', code);
    const state = url.searchParams.get('state');
    if (state) {
      back.searchParams.set('state', state);
    }
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }

  if (url.pathname === '/token' && req.method === 'POST') {
    const form = new URLSearchParams(await readBody(req));
    const grant = codes.get(form.get('code') ?? '');
    if (!grant) {
      return json(res, 400, { error: 'invalid_grant' });
    }
    codes.delete(form.get('code')!);
    const now = Math.floor(Date.now() / 1000);
    const accessToken = randomBytes(16).toString('hex');
    accessTokens.set(accessToken, grant.identity);
    return json(res, 200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
      id_token: signJwt({
        iss: ISSUER,
        aud: grant.clientId || form.get('client_id'),
        sub: grant.identity.sub,
        iat: now,
        exp: now + 300,
        ...(grant.nonce ? { nonce: grant.nonce } : {}),
        email: grant.identity.email,
        email_verified: grant.identity.email_verified,
        name: grant.identity.name,
      }),
    });
  }

  if (url.pathname === '/userinfo') {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const identity = accessTokens.get(token);
    if (!identity) {
      return json(res, 401, { error: 'invalid_token' });
    }
    return json(res, 200, identity);
  }

  json(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`Mock OIDC issuer Listening on ${ISSUER}`);
});
