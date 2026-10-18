import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetAppUrlWarningForTests, resolveAppUrl } from '../app-url';
import { appOrigin } from '../fragments';

describe('resolveAppUrl', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetAppUrlWarningForTests();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('reads APP_URL', () => {
    expect(resolveAppUrl({ APP_URL: 'https://ragen.example' })).toBe(
      'https://ragen.example',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('prefers APP_URL over the legacy name when both are set', () => {
    expect(
      resolveAppUrl({
        APP_URL: 'https://ragen.example',
        BETTER_AUTH_URL: 'http://localhost:3000',
      }),
    ).toBe('https://ragen.example');
  });

  it('falls back to BETTER_AUTH_URL, so an existing install keeps working', () => {
    expect(resolveAppUrl({ BETTER_AUTH_URL: 'https://legacy.example' })).toBe(
      'https://legacy.example',
    );
  });

  it('warns about the legacy name once per process, not per call', () => {
    resolveAppUrl({ BETTER_AUTH_URL: 'https://legacy.example' });
    resolveAppUrl({ BETTER_AUTH_URL: 'https://legacy.example' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('APP_URL');
  });

  it('treats a blank APP_URL as unset rather than letting it shadow the legacy value', () => {
    expect(
      resolveAppUrl({
        APP_URL: '   ',
        BETTER_AUTH_URL: 'https://legacy.example',
      }),
    ).toBe('https://legacy.example');
  });

  it('returns undefined when neither is set', () => {
    expect(resolveAppUrl({})).toBeUndefined();
    expect(
      resolveAppUrl({ APP_URL: '', BETTER_AUTH_URL: ' ' }),
    ).toBeUndefined();
  });

  it('strips trailing slashes, because callers append absolute paths', () => {
    expect(resolveAppUrl({ APP_URL: 'https://ragen.example///' })).toBe(
      'https://ragen.example',
    );
  });
});

describe('appOrigin', () => {
  it('accepts either name and treats blank as unset', () => {
    expect(
      appOrigin.parse({
        APP_URL: 'https://ragen.example',
        BETTER_AUTH_URL: '',
      }),
    ).toEqual({ APP_URL: 'https://ragen.example', BETTER_AUTH_URL: undefined });
  });

  it('rejects a value that is not an http(s) url', () => {
    expect(appOrigin.safeParse({ APP_URL: 'localhost:3000' }).success).toBe(
      false,
    );
  });
});
