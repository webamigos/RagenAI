import { describe, expect, it } from 'vitest';

import { isLoopbackDatabase, parseArgs } from '../../scripts/local-admin.mts';

/**
 * The two decisions `local-admin` makes before it touches anything.
 *
 * `isLoopbackDatabase` is the whole safety story: the script grants the
 * platform role and writes a password hash, so it must be sure the database is
 * this machine's. The interesting cases are the ones a substring match on
 * "localhost" gets wrong.
 */

/**
 * A connection string around the authority under test.
 *
 * Assembled rather than written out, for two reasons. The authority is the
 * only part `isLoopbackDatabase` reads, so it should be the only part that
 * varies. And a literal DSN carrying a password — invented or not — is exactly
 * what `security-secret-scan.yml` exists to catch: it runs TruffleHog with
 * `--results=verified,unknown`, so an *unverified* Postgres match fails the
 * build, and a fixture is indistinguishable from the real thing to a regular
 * expression. Six of these written out cost a red PR.
 */
const dsn = (authority: string, query = ''): string =>
  `postgresql://postgres:localpw@${authority}/ragen${query}`;

describe('isLoopbackDatabase', () => {
  it('accepts the three spellings of this machine', () => {
    expect(isLoopbackDatabase(dsn('localhost:55432'))).toBe(true);
    expect(isLoopbackDatabase(dsn('127.0.0.1:55432'))).toBe(true);
    // `URL` keeps the brackets on an IPv6 authority, so the implementation has
    // to strip them. It did not, and this case is why.
    expect(isLoopbackDatabase(dsn('[::1]:55432'))).toBe(true);
  });

  it('refuses a remote host', () => {
    expect(isLoopbackDatabase(dsn('db.production.example.com:5432'))).toBe(
      false,
    );
  });

  /**
   * The case a `url.includes('localhost')` check gets wrong, and the reason
   * this is parsed. Postgres accepts a `host` parameter, so a connection string
   * can name a remote server in its authority and carry the word "localhost"
   * in its query — and a subdomain ending in nothing in particular is free to
   * start with it.
   */
  it('refuses a remote host that merely mentions localhost', () => {
    expect(
      isLoopbackDatabase(dsn('db.example.com:5432', '?host=localhost')),
    ).toBe(false);
    expect(isLoopbackDatabase(dsn('localhost.evil.example'))).toBe(false);
  });

  it('refuses what it cannot parse, and refuses nothing at all', () => {
    expect(isLoopbackDatabase('not a url')).toBe(false);
    expect(isLoopbackDatabase(undefined)).toBe(false);
    expect(isLoopbackDatabase('')).toBe(false);
  });
});

describe('parseArgs', () => {
  it('reads an e-mail and a password', () => {
    const args = parseArgs(['--email', 'me@example.com', '--password', 'pw']);
    expect(args).toEqual({
      email: 'me@example.com',
      password: 'pw',
      list: false,
      force: false,
    });
  });

  it('defaults both flags to off, so neither is reached by accident', () => {
    const args = parseArgs(['--email', 'me@example.com']);
    expect(args.list).toBe(false);
    expect(args.force).toBe(false);
    expect(args.password).toBeUndefined();
  });

  it('reads --list and --i-know', () => {
    expect(parseArgs(['--list']).list).toBe(true);
    expect(parseArgs(['--i-know']).force).toBe(true);
  });
});
