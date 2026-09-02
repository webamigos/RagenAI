import { afterEach, describe, expect, it, vi } from 'vitest';

import { hardNavigate } from '../hard-navigate';

/**
 * jsdom refuses a real navigation, so `window.location` is replaced with a
 * plain object and the assignment read back off it.
 */
function captureHref(): { get: () => string } {
  const location = { href: '' } as Location;
  vi.stubGlobal('window', { location } as unknown as Window);
  return { get: () => location.href };
}

describe('hardNavigate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes the locale', () => {
    const href = captureHref();
    hardNavigate('pl', '/new');
    expect(href.get()).toBe('/pl/new');
  });

  it('accepts a path without a leading slash rather than producing //', () => {
    const href = captureHref();
    hardNavigate('en', 'sign-in');
    expect(href.get()).toBe('/en/sign-in');
  });

  it('keeps a query string intact — the invitation flow passes a token', () => {
    const href = captureHref();
    hardNavigate('pl', '/accept-invitation?token=abc%20def');
    expect(href.get()).toBe('/pl/accept-invitation?token=abc%20def');
  });

  it('handles the bare locale root, which two callers navigate to', () => {
    const href = captureHref();
    hardNavigate('pl', '/');
    expect(href.get()).toBe('/pl/');
  });
});
