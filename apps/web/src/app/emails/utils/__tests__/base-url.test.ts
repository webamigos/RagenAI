import { describe, it, expect, vi, afterEach } from 'vitest';

import { getBaseUrl } from '../base-url';

/**
 * The origin resolved here ends up in invitation and security-alert links, so
 * the failure mode this guards is a delivered email pointing somewhere the
 * recipient cannot use — a different deployment, or `undefined/...`.
 */
describe('getBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers BETTER_AUTH_URL, the origin Better Auth already builds its own email links from', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://ragen.example.com');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ignored.example.com');

    expect(getBaseUrl()).toBe('https://ragen.example.com');
  });

  it('falls back to NEXT_PUBLIC_APP_URL for installs that only set that one', () => {
    vi.stubEnv('BETTER_AUTH_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://selfhosted.example.com');

    expect(getBaseUrl()).toBe('https://selfhosted.example.com');
  });

  it('strips a trailing slash so appended paths do not double up', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://ragen.example.com///');

    expect(`${getBaseUrl()}/accept-invitation`).toBe(
      'https://ragen.example.com/accept-invitation',
    );
  });

  it('treats a whitespace-only value as unset', () => {
    vi.stubEnv('BETTER_AUTH_URL', '   ');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://selfhosted.example.com');

    expect(getBaseUrl()).toBe('https://selfhosted.example.com');
  });

  it.each(['local', 'test', 'e2e', 'ci'])(
    'falls back to localhost when TARGET_ENV is %s, which is not a deployment',
    (targetEnv) => {
      vi.stubEnv('BETTER_AUTH_URL', '');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
      vi.stubEnv('TARGET_ENV', targetEnv);

      expect(getBaseUrl()).toBe('http://localhost:3000');
    },
  );

  it.each(['demo', 'staging', 'production'])(
    'refuses to guess an origin on a real deployment (TARGET_ENV=%s)',
    (targetEnv) => {
      vi.stubEnv('BETTER_AUTH_URL', '');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
      vi.stubEnv('TARGET_ENV', targetEnv);

      expect(() => getBaseUrl()).toThrow(/BETTER_AUTH_URL/);
    },
  );

  it.each(['', '   '])(
    'refuses when TARGET_ENV is blank (%j), which is a cleared variable, not an environment',
    (targetEnv) => {
      // Regression: a cleared Railway variable arrives as '' rather than
      // undefined. Comparing the raw value against `undefined` let it reach
      // the localhost fallback, so a real deployment whose TARGET_ENV someone
      // emptied would have mailed out links pointing at localhost.
      vi.stubEnv('BETTER_AUTH_URL', '');
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
      vi.stubEnv('TARGET_ENV', targetEnv);

      expect(() => getBaseUrl()).toThrow(/BETTER_AUTH_URL/);
    },
  );

  it('still refuses when TARGET_ENV is unset, rather than guessing localhost', () => {
    // The one place this file deliberately parts company with
    // `isDeployedEnv()`, which reads an unset value as "not deployed". Here an
    // absent TARGET_ENV is the dangerous case: a real deployment that never
    // received its configuration would otherwise mail out localhost links.
    vi.stubEnv('BETTER_AUTH_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('TARGET_ENV', undefined);

    expect(() => getBaseUrl()).toThrow(/BETTER_AUTH_URL/);
  });
});
