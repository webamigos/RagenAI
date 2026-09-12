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
      // A trailing dot is the DNS root: it resolves the same but does not
      // compare equal, so each blocked name has to survive one being appended.
      ['localhost with a trailing DNS root dot', 'https://localhost.'],
      ['localhost with repeated trailing dots', 'https://localhost..'],
      ['a .localhost subdomain with a trailing dot', 'https://foo.localhost.'],
      // fe80::/10 is wider than fe80:* — it runs to febf:ffff:...
      ['IPv6 link-local above fe80:', 'https://[fe90::1]'],
      ['IPv6 link-local at fea0:', 'https://[fea0::1]'],
      ['IPv6 link-local at the top of fe80::/10', 'https://[febf::1]'],
      [
        'the last address in fe80::/10',
        'https://[febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff]',
      ],
      ['IPv6 unique local at the top of fc00::/7', 'https://[fdff::1]'],
    ])('rejects %s', (_label, url) => {
      expect(() => normalizeSiteUrl(url)).toThrow(/local or private address/);
    });

    it('does not flag a public IPv4 address that merely starts with a blocked octet', () => {
      // 172.32.x.x is outside the blocked 172.16.0.0/12 range.
      expect(normalizeSiteUrl('https://172.32.0.1')).toBe('https://172.32.0.1');
      // 11.x.x.x is outside the blocked 10.0.0.0/8 range.
      expect(normalizeSiteUrl('https://11.0.0.1')).toBe('https://11.0.0.1');
    });

    it('does not flag an IPv6 address just below the link-local range', () => {
      // fe7f::/16 sits outside fe80::/10; only fe80-febf is link-local.
      expect(normalizeSiteUrl('https://[fe7f::1]')).toBe('https://[fe7f::1]');
    });

    it('still accepts a public IPv6 address', () => {
      expect(normalizeSiteUrl('https://[2606:4700::1]')).toBe(
        'https://[2606:4700::1]',
      );
    });

    it('still accepts an ordinary public hostname', () => {
      expect(normalizeSiteUrl('https://shop.example.com')).toBe(
        'https://shop.example.com',
      );
    });

    it.each([
      ['documentation TEST-NET-3', 'https://203.0.113.10'],
      ['documentation TEST-NET-1', 'https://192.0.2.5'],
      ['documentation TEST-NET-2', 'https://198.51.100.5'],
      ['IETF protocol assignments 192.0.0.0/24', 'https://192.0.0.1'],
      ['deprecated 6to4 relay anycast', 'https://192.88.99.1'],
      ['benchmarking 198.18.0.0/15', 'https://198.18.0.1'],
      ['multicast', 'https://224.0.0.1'],
      ['reserved 240.0.0.0/4', 'https://250.1.2.3'],
      ['broadcast', 'https://255.255.255.255'],
      ['an mDNS .local name', 'https://printer.local'],
      ['cloud internal DNS', 'https://metadata.google.internal'],
      ['a .home.arpa name', 'https://db.home.arpa'],
      ['IPv6 unspecified', 'https://[::]'],
      ['IPv4-mapped RFC1918', 'https://[::ffff:10.0.0.1]'],
      ['IPv4-compatible loopback', 'https://[::127.0.0.1]'],
      ['NAT64 wrapping loopback', 'https://[64:ff9b::127.0.0.1]'],
      ['6to4 wrapping loopback', 'https://[2002:7f00:1::]'],
      ['IPv6 documentation', 'https://[2001:db8::1]'],
      ['Teredo', 'https://[2001:0:1234::1]'],
      ['IPv6 multicast', 'https://[ff02::1]'],
      ['discard-only 100::/64', 'https://[100::1]'],
    ])('rejects %s', (_label, url) => {
      expect(() => normalizeSiteUrl(url)).toThrow(/local or private address/);
    });

    it('still accepts a globally routable IPv4 literal', () => {
      expect(normalizeSiteUrl('https://93.184.216.34/shop')).toBe(
        'https://93.184.216.34/shop',
      );
    });

    it.each([
      ['just below CGNAT', 'https://100.63.255.255'],
      ['just above CGNAT', 'https://100.128.0.0'],
      ['outside 192.0.0.0/24 and TEST-NET-1', 'https://192.0.1.1'],
      ['just above TEST-NET-2', 'https://198.51.101.1'],
      ['just above TEST-NET-3', 'https://203.0.114.1'],
      ['just below multicast', 'https://223.255.255.255'],
    ])('does not flag a public address %s', (_label, url) => {
      expect(normalizeSiteUrl(url)).toBe(url);
    });

    it('still accepts a hostname that merely contains a blocked label', () => {
      expect(normalizeSiteUrl('https://localhost.example.com')).toBe(
        'https://localhost.example.com',
      );
    });

    it('still accepts a public hostname carrying a trailing DNS root dot', () => {
      // Stripping the dot must only affect classification, not the result.
      expect(normalizeSiteUrl('https://shop.example.com.')).toBe(
        'https://shop.example.com.',
      );
    });
  });
});
