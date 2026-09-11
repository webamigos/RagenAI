import { normalizeSiteUrl } from './site-url.js';

describe('normalizeSiteUrl', () => {
  it('strips a trailing slash', () => {
    expect(normalizeSiteUrl('https://shop.example.com/')).toBe(
      'https://shop.example.com',
    );
  });

  it('strips repeated trailing slashes', () => {
    expect(normalizeSiteUrl('https://shop.example.com///')).toBe(
      'https://shop.example.com',
    );
  });

  it('preserves a subdirectory path without a trailing slash', () => {
    expect(normalizeSiteUrl('https://example.com/store/')).toBe(
      'https://example.com/store',
    );
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeSiteUrl('  https://shop.example.com ')).toBe(
      'https://shop.example.com',
    );
  });

  it('rejects empty strings', () => {
    expect(() => normalizeSiteUrl('')).toThrow(/required/);
  });

  it('rejects HTTP URLs', () => {
    expect(() => normalizeSiteUrl('http://shop.example.com')).toThrow(
      /https:\/\//,
    );
  });

  it('rejects values that are not parseable as URLs', () => {
    expect(() => normalizeSiteUrl('not a url')).toThrow(/valid URL/);
  });

  it('rejects other schemes', () => {
    expect(() => normalizeSiteUrl('ftp://shop.example.com')).toThrow(
      /https:\/\//,
    );
  });

  it('drops query strings and hash fragments', () => {
    expect(normalizeSiteUrl('https://shop.example.com/path?foo=bar#x')).toBe(
      'https://shop.example.com/path',
    );
  });

  it('rejects URLs with embedded username', () => {
    expect(() => normalizeSiteUrl('https://admin@shop.example.com')).toThrow(
      /embedded credentials/,
    );
  });

  it('rejects URLs with embedded username + password', () => {
    expect(() =>
      normalizeSiteUrl('https://admin:secret@shop.example.com'),
    ).toThrow(/embedded credentials/);
  });

  describe('SSRF guard against private/loopback destinations', () => {
    it.each([
      ['localhost', 'https://localhost'],
      ['a .localhost subdomain', 'https://foo.localhost'],
      ['IPv4 loopback', 'https://127.0.0.1'],
      ['another IPv4 loopback address', 'https://127.1.2.3'],
      ['RFC1918 10.0.0.0/8', 'https://10.1.2.3'],
      ['RFC1918 172.16.0.0/12', 'https://172.20.0.5'],
      ['RFC1918 192.168.0.0/16', 'https://192.168.1.1'],
      ['link-local 169.254.0.0/16 (cloud metadata)', 'https://169.254.169.254'],
      ['CGNAT 100.64.0.0/10', 'https://100.64.0.1'],
      ['0.0.0.0', 'https://0.0.0.0'],
      ['IPv6 loopback', 'https://[::1]'],
      ['IPv6 link-local', 'https://[fe80::1]'],
      ['IPv6 unique local (fc..)', 'https://[fc00::1]'],
      ['IPv6 unique local (fd..)', 'https://[fd12::1]'],
      ['IPv4-mapped IPv6 loopback', 'https://[::ffff:127.0.0.1]'],
    ])('rejects %s', (_label, url) => {
      expect(() => normalizeSiteUrl(url)).toThrow(/local or private address/);
    });

    it('does not flag a public IPv4 address that merely starts with a blocked octet', () => {
      // 172.32.x.x is outside the blocked 172.16.0.0/12 range.
      expect(normalizeSiteUrl('https://172.32.0.1')).toBe('https://172.32.0.1');
      // 11.x.x.x is outside the blocked 10.0.0.0/8 range.
      expect(normalizeSiteUrl('https://11.0.0.1')).toBe('https://11.0.0.1');
    });

    it('still accepts an ordinary public hostname', () => {
      expect(normalizeSiteUrl('https://shop.example.com')).toBe(
        'https://shop.example.com',
      );
    });
  });
});
