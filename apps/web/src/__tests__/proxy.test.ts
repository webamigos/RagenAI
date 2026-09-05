import { describe, it, expect, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const i18nMiddlewareMarker = 'i18n-middleware-handled';

vi.mock('next-intl/middleware', () => ({
  default: () => () =>
    NextResponse.next({ headers: { 'x-marker': i18nMiddlewareMarker } }),
}));

const proxy = (await import('../proxy')).default;

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, 'http://localhost'), { headers });
}

describe('proxy locale-prefix detection', () => {
  it('does not treat /plans as locale-prefixed by "pl"', async () => {
    const res = await proxy(makeRequest('/plans'));

    // Before the fix, LOCALE_PREFIX_REGEX matched "/pl" inside "/plans" with
    // no path-boundary check, sending this into the locale-prefixed branches
    // (and, with no session cookie, redirecting to /pl/sign-in) instead of
    // straight through to next-intl's own routing.
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-marker')).toBe(i18nMiddlewareMarker);
  });

  it('does not treat /dashboard as locale-prefixed by "da"', async () => {
    const res = await proxy(makeRequest('/dashboard'));

    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-marker')).toBe(i18nMiddlewareMarker);
  });

  it('still redirects an unauthenticated request under a real locale prefix', async () => {
    const res = await proxy(makeRequest('/pl/organization'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/pl/sign-in');
  });
});

describe('proxy Accept-Language parsing on the root path', () => {
  it('strips a quality suffix before matching a supported locale', async () => {
    const res = await proxy(
      makeRequest('/', { 'accept-language': 'pl;q=0.9' }),
    );

    expect(res.headers.get('location')).toContain('/pl');
  });

  it('skips an unsupported first preference and matches a later one', async () => {
    const res = await proxy(
      makeRequest('/', { 'accept-language': 'zh-CN,da;q=0.9' }),
    );

    expect(res.headers.get('location')).toContain('/da');
  });

  it('falls back to the default locale when nothing in the header is supported', async () => {
    const res = await proxy(
      makeRequest('/', { 'accept-language': 'zh-CN,ja;q=0.9' }),
    );

    expect(res.headers.get('location')).toContain('/en');
  });
});
