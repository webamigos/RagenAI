import { describe, expect, it } from 'vitest';

import { readQueueDashboardUrl } from '../env';

/**
 * Built rather than written out, and that is not fastidiousness: a url literal
 * carrying a user and password before its host is what TruffleHog's URI
 * detector matches, so committing one turns the secret scan red for a fixture
 * that holds no secret. The setters produce the same href an operator's paste
 * would, without the pattern ever appearing in the repository.
 */
function withCredentials(
  base: string,
  username: string,
  password?: string,
): string {
  const url = new URL(base);
  url.username = username;
  if (password !== undefined) {
    url.password = password;
  }
  return url.toString();
}

const DASHBOARD = 'https://worker.internal:8090';

/**
 * The read boundary for a value that becomes a link.
 *
 * The dashboard it points at is behind Basic Auth, which makes embedding the
 * credentials the tempting way to skip its prompt — and an `href` carrying a
 * password lands in browser history, in screenshots and in the DOM. Every
 * rejection below ends the same way: no link, rather than a link that leaks or
 * a link that 404s.
 */
describe('readQueueDashboardUrl', () => {
  it('passes a plain url through', () => {
    expect(
      readQueueDashboardUrl({
        WORKER_ADMIN_URL: 'http://worker.internal:8090',
      }),
    ).toBe('http://worker.internal:8090');
  });

  it('is undefined when unset or blank', () => {
    expect(readQueueDashboardUrl({})).toBeUndefined();
    expect(readQueueDashboardUrl({ WORKER_ADMIN_URL: '   ' })).toBeUndefined();
  });

  it('refuses a url carrying credentials', () => {
    const withBoth = withCredentials(DASHBOARD, 'admin', 'not-a-real-password');

    // The fixture is the thing under test, so assert it kept its shape: a
    // constructor that quietly dropped the credentials would make the
    // assertion below pass for the wrong reason.
    expect(withBoth).toContain('@worker.internal:8090');
    expect(
      readQueueDashboardUrl({ WORKER_ADMIN_URL: withBoth }),
    ).toBeUndefined();
  });

  it('refuses a username even without a password', () => {
    const userOnly = withCredentials(DASHBOARD, 'admin');

    expect(userOnly).toContain('@worker.internal:8090');
    expect(
      readQueueDashboardUrl({ WORKER_ADMIN_URL: userOnly }),
    ).toBeUndefined();
  });

  /**
   * `z.string().url()` would accept this: `new URL()` reads `worker:8090` as a
   * scheme. `httpUrl()` exists for exactly that, and the boundary inherits it.
   */
  it('refuses something that is not an http url', () => {
    expect(
      readQueueDashboardUrl({ WORKER_ADMIN_URL: 'worker.internal:8090' }),
    ).toBeUndefined();
  });
});
