import { describe, expect, it } from 'vitest';
import {
  assertMcpRegistrationRedirects,
  MCP_REGISTRATION_RATE_LIMIT,
} from '../mcp-registration';

describe('MCP registration policy', () => {
  it.each([
    'https://client.example/callback',
    'https://client.example/callback?source=mcp',
  ])('accepts HTTPS: %s', (uri) => {
    expect(() =>
      assertMcpRegistrationRedirects({ redirect_uris: [uri] }),
    ).not.toThrow();
  });
  it.each(['http://localhost:4321/callback', 'http://127.0.0.1:9876/callback'])(
    'accepts native loopback: %s',
    (uri) => {
      expect(() =>
        assertMcpRegistrationRedirects({
          application_type: 'native',
          redirect_uris: [uri],
        }),
      ).not.toThrow();
      expect(() =>
        assertMcpRegistrationRedirects({
          application_type: 'web',
          redirect_uris: [uri],
        }),
      ).toThrow();
    },
  );
  it.each([
    'http://client.example/callback',
    'http://localhost.evil.example/callback',
    'http://127.0.0.2/callback',
    'http://[::1]/callback',
    'javascript:alert(1)',
    '/callback',
    'not a URI',
    Object.assign(new URL('https://client.example/callback'), { username: 'user', password: 'pass' }).href,
    'https://client.example/callback#fragment',
    'https://*.example/callback',
  ])('rejects unsafe redirect: %s', (uri) => {
    expect(() =>
      assertMcpRegistrationRedirects({
        application_type: 'native',
        redirect_uris: [uri],
      }),
    ).toThrow();
  });
  it.each([
    null,
    {},
    { redirect_uris: [] },
    { redirect_uris: [123] },
    { redirect_uris: 'https://client.example' },
  ])('rejects malformed metadata %j', (body) => {
    expect(() => assertMcpRegistrationRedirects(body)).toThrow();
  });
  it('guards every URI including logout callbacks', () => {
    expect(() =>
      assertMcpRegistrationRedirects({
        redirect_uris: ['https://client.example', 'http://evil.example'],
      }),
    ).toThrow();
    expect(() =>
      assertMcpRegistrationRedirects({
        redirect_uris: ['https://client.example'],
        post_logout_redirect_uris: ['http://evil.example'],
      }),
    ).toThrow();
  });
  it('refuses client-requested consent bypass', () => {
    expect(() =>
      assertMcpRegistrationRedirects({
        redirect_uris: ['https://client.example'],
        skip_consent: true,
      }),
    ).toThrow('Consent cannot be disabled');
  });
  it('sets the per-IP registration budget', () => {
    expect(MCP_REGISTRATION_RATE_LIMIT).toEqual({ window: 60, max: 10 });
  });
});
