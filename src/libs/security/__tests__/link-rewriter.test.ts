import { describe, it, expect } from 'vitest';
import {
  parseTrustedDomains,
  isTrustedHost,
  maybeRewriteHref,
  rewriteLinksInHtml,
} from '../link-rewriter';

describe('parseTrustedDomains', () => {
  it('returns an empty list for undefined or empty input', () => {
    expect(parseTrustedDomains(undefined)).toEqual([]);
    expect(parseTrustedDomains('')).toEqual([]);
    expect(parseTrustedDomains(',,,')).toEqual([]);
  });

  it('trims whitespace around each entry', () => {
    expect(parseTrustedDomains('  a.com ,b.com  ,  c.com')).toEqual([
      'a.com',
      'b.com',
      'c.com',
    ]);
  });

  it('lowercases hostnames (DNS is case-insensitive)', () => {
    expect(parseTrustedDomains('Webamigos.PL,*.Example.COM')).toEqual([
      'webamigos.pl',
      '*.example.com',
    ]);
  });
});

describe('isTrustedHost', () => {
  const list = ['webamigos.pl', '*.webamigos.pl', 'docs.google.com'];

  it('matches exact hostnames', () => {
    expect(isTrustedHost('webamigos.pl', list)).toBe(true);
    expect(isTrustedHost('docs.google.com', list)).toBe(true);
  });

  it('matches subdomains via *. glob', () => {
    expect(isTrustedHost('app.webamigos.pl', list)).toBe(true);
    expect(isTrustedHost('deeply.nested.webamigos.pl', list)).toBe(true);
  });

  it('does not match parent domain via bare glob', () => {
    // "*.webamigos.pl" should only match subdomains, not the apex
    // (which is covered by the bare "webamigos.pl" entry).
    const onlyGlob = ['*.webamigos.pl'];
    expect(isTrustedHost('webamigos.pl', onlyGlob)).toBe(false);
  });

  it('does not match unrelated hosts', () => {
    expect(isTrustedHost('evil.com', list)).toBe(false);
    expect(isTrustedHost('webamigos.pl.evil.com', list)).toBe(false);
  });

  it('is case-insensitive on the hostname', () => {
    expect(isTrustedHost('WEBAMIGOS.PL', list)).toBe(true);
  });

  it('returns false for an empty allowlist', () => {
    expect(isTrustedHost('webamigos.pl', [])).toBe(false);
  });
});

describe('maybeRewriteHref', () => {
  const opts = {
    trustedDomains: ['webamigos.pl', '*.webamigos.pl'],
  };

  it('returns null for null/empty input', () => {
    expect(maybeRewriteHref(null, opts)).toBeNull();
    expect(maybeRewriteHref('', opts)).toBeNull();
    expect(maybeRewriteHref('   ', opts)).toBeNull();
  });

  it('passes through root-relative links', () => {
    expect(maybeRewriteHref('/settings', opts)).toBeNull();
    expect(maybeRewriteHref('/api/v1/chat', opts)).toBeNull();
  });

  it('passes through fragment links', () => {
    expect(maybeRewriteHref('#section', opts)).toBeNull();
  });

  it('passes through relative paths (bare string, no scheme)', () => {
    expect(maybeRewriteHref('docs/intro', opts)).toBeNull();
  });

  it('passes through mailto: and tel: URIs', () => {
    expect(maybeRewriteHref('mailto:alice@example.com', opts)).toBeNull();
    expect(maybeRewriteHref('tel:+1234567890', opts)).toBeNull();
  });

  it('passes through absolute links on trusted hostnames', () => {
    expect(maybeRewriteHref('https://webamigos.pl/blog', opts)).toBeNull();
    expect(maybeRewriteHref('https://app.webamigos.pl/x', opts)).toBeNull();
  });

  it('rewrites untrusted absolute links through /r?u=<encoded>', () => {
    const result = maybeRewriteHref('https://evil.com/exfil?data=abc', opts);
    expect(result).toBe('/r?u=https%3A%2F%2Fevil.com%2Fexfil%3Fdata%3Dabc');
  });

  it('supports custom interstitial path', () => {
    const result = maybeRewriteHref('https://evil.com/', {
      ...opts,
      interstitialPath: '/link-warning',
    });
    expect(result).toBe('/link-warning?u=https%3A%2F%2Fevil.com%2F');
  });

  it('does not rewrite unsupported absolute schemes (leaves for DOMPurify)', () => {
    // These should already be stripped by DOMPurify's ALLOWED_URI_REGEXP,
    // but if one leaks through, the rewriter stays out of the way rather
    // than decoding attacker-controlled data into a URL parameter.
    expect(maybeRewriteHref('javascript:alert(1)', opts)).toBeNull();
    expect(maybeRewriteHref('data:text/html,<script>', opts)).toBeNull();
    expect(maybeRewriteHref('vbscript:x', opts)).toBeNull();
  });

  it('rewrites protocol-relative URLs to untrusted hosts (//evil.com/x)', () => {
    // Protocol-relative URLs look root-relative because they start with
    // `/`. Without the explicit check the rewriter would have let them
    // through — they'd inherit the page protocol and navigate
    // cross-origin. See CodeRabbit finding + regression test.
    const result = maybeRewriteHref('//evil.com/exfil?data=abc', opts);
    expect(result).toBe('/r?u=%2F%2Fevil.com%2Fexfil%3Fdata%3Dabc');
  });

  it('leaves protocol-relative URLs to trusted hosts alone', () => {
    const result = maybeRewriteHref('//webamigos.pl/blog', opts);
    expect(result).toBeNull();
  });

  it('rewrites protocol-relative URLs to subdomains of trusted hosts based on the allowlist', () => {
    // *.webamigos.pl glob — subdomain passes through.
    expect(maybeRewriteHref('//app.webamigos.pl/x', opts)).toBeNull();
    // An apex that is also explicitly listed → pass through.
    expect(maybeRewriteHref('//webamigos.pl/x', opts)).toBeNull();
  });
});

describe('rewriteLinksInHtml', () => {
  const opts = {
    trustedDomains: ['webamigos.pl', '*.webamigos.pl'],
  };

  it('rewrites a single untrusted external link', () => {
    const html = '<p>See <a href="https://evil.com/x">here</a>.</p>';
    const result = rewriteLinksInHtml(html, opts);
    expect(result).toContain('href="/r?u=https%3A%2F%2Fevil.com%2Fx"');
    expect(result).toContain('data-ragen-link="external"');
  });

  it('leaves trusted links alone', () => {
    const html = '<a href="https://webamigos.pl/blog">blog</a>';
    const result = rewriteLinksInHtml(html, opts);
    expect(result).toContain('href="https://webamigos.pl/blog"');
    expect(result).not.toContain('/r?u=');
    expect(result).not.toContain('data-ragen-link');
  });

  it('leaves root-relative links alone', () => {
    const html = '<a href="/settings/security">settings</a>';
    const result = rewriteLinksInHtml(html, opts);
    expect(result).toContain('href="/settings/security"');
    expect(result).not.toContain('/r?u=');
  });

  it('rewrites multiple links in the same document independently', () => {
    const html =
      '<a href="https://evil1.com">a</a><a href="https://webamigos.pl">b</a><a href="https://evil2.com">c</a>';
    const result = rewriteLinksInHtml(html, opts);
    expect(result).toContain('/r?u=https%3A%2F%2Fevil1.com');
    expect(result).toContain('href="https://webamigos.pl"');
    expect(result).toContain('/r?u=https%3A%2F%2Fevil2.com');
  });

  it('preserves anchor attributes other than href', () => {
    const html =
      '<a href="https://evil.com" target="_blank" rel="noopener">x</a>';
    const result = rewriteLinksInHtml(html, opts);
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener"');
  });

  it('preserves non-anchor markup verbatim', () => {
    const html =
      '<p>Hello <strong>world</strong>, see <a href="https://evil.com">link</a>.</p>';
    const result = rewriteLinksInHtml(html, opts);
    expect(result).toContain('<strong>world</strong>');
    expect(result).toContain('Hello ');
    expect(result).toContain('/r?u=');
  });

  it('returns empty input unchanged', () => {
    expect(rewriteLinksInHtml('', opts)).toBe('');
  });

  it("handles anchors without href (shouldn't crash)", () => {
    const html = '<a>no href</a><a href="https://evil.com">with href</a>';
    const result = rewriteLinksInHtml(html, opts);
    expect(result).toContain('no href');
    expect(result).toContain('/r?u=');
  });

  it('handles pre-encoded special characters in the href', () => {
    const html = '<a href="https://evil.com/path?a=1&amp;b=2">link</a>';
    const result = rewriteLinksInHtml(html, opts);
    // The rewrite should round-trip through proper encoding
    expect(result).toMatch(/\/r\?u=https%3A%2F%2Fevil\.com%2Fpath%3F/);
  });
});
