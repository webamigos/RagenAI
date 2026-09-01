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
});
