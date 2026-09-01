import { describe, it, expect } from 'vitest';
import { validateOrigin, buildCorsHeaders } from '../cors';

describe('validateOrigin — bare-host normalization', () => {
  it('matches a full-origin request against a bare-hostname allowed entry', () => {
    expect(validateOrigin('https://example.com', ['example.com'])).toBe(true);
  });

  it('does not match a malicious prefix against a bare-hostname entry', () => {
    expect(
      validateOrigin('https://malicious-example.com', ['example.com']),
    ).toBe(false);
  });

  it('matches origins with different ports only when the allowed entry has that port', () => {
    expect(
      validateOrigin('https://example.com:8443', ['https://example.com:8443']),
    ).toBe(true);
    expect(
      validateOrigin('https://example.com:8443', ['https://example.com']),
    ).toBe(false);
  });
});

describe('buildCorsHeaders', () => {
  it('never sets Access-Control-Allow-Credentials', () => {
    const empty = buildCorsHeaders('https://example.com', []);
    const allowed = buildCorsHeaders('https://example.com', [
      'https://example.com',
    ]);
    const denied = buildCorsHeaders('https://evil.com', [
      'https://example.com',
    ]);

    expect(empty).not.toHaveProperty('Access-Control-Allow-Credentials');
    expect(allowed).not.toHaveProperty('Access-Control-Allow-Credentials');
    expect(denied).not.toHaveProperty('Access-Control-Allow-Credentials');
  });

  it('echoes * when allowedOrigins is empty', () => {
    expect(
      buildCorsHeaders('https://example.com', [])[
        'Access-Control-Allow-Origin'
      ],
    ).toBe('*');
  });

  it('echoes the specific origin when it validates', () => {
    expect(
      buildCorsHeaders('https://example.com', ['https://example.com'])[
        'Access-Control-Allow-Origin'
      ],
    ).toBe('https://example.com');
  });

  it('omits Access-Control-Allow-Origin when origin does not validate', () => {
    const headers = buildCorsHeaders('https://evil.com', [
      'https://example.com',
    ]);
    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin');
  });

  it('omits Access-Control-Allow-Origin when origin is null and a whitelist is set', () => {
    const headers = buildCorsHeaders(null, ['https://example.com']);
    expect(headers).not.toHaveProperty('Access-Control-Allow-Origin');
  });

  it('always sets Vary: Origin so caches differentiate per-origin responses', () => {
    expect(buildCorsHeaders('https://example.com', [])['Vary']).toBe('Origin');
    expect(
      buildCorsHeaders('https://example.com', ['https://example.com'])['Vary'],
    ).toBe('Origin');
    expect(
      buildCorsHeaders('https://evil.com', ['https://example.com'])['Vary'],
    ).toBe('Origin');
  });
});
