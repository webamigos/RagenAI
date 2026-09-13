import { describe, expect, it } from 'vitest';

import { parseAdminEnv } from '../env';

/**
 * The contract exists because apps/admin was the last app without one
 * (ADR-37): fifteen variables read off `process.env`, none of them checked.
 *
 * Every case passes an explicit source rather than touching `process.env`,
 * the way `@ragenai/env`'s own tests do.
 */
const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/ragen',
  LITELLM_PROXY_URL: 'http://localhost:4000',
};

const deployed = {
  ...base,
  TARGET_ENV: 'production',
  LITELLM_MASTER_KEY: 'sk-x',
  INTERNAL_API_SECRET: 'shared',
};

/** `deployed` minus one variable, to prove that variable is what is required. */
const without = (name: string): Record<string, string | undefined> => {
  const source: Record<string, string | undefined> = { ...deployed };
  delete source[name];
  return source;
};

const issueNames = (source: Record<string, string | undefined>) => {
  const result = parseAdminEnv(source);
  return result.ok ? [] : result.issues.map(({ name }) => name);
};

describe('the apps/admin environment contract', () => {
  it('accepts a fresh clone with only the documented minimum', () => {
    // AGENTS.md's minimum `.env.local` lists neither TARGET_ENV nor any
    // secret. Turning that into a boot failure would break the first thing a
    // self-hoster runs.
    expect(parseAdminEnv(base).ok).toBe(true);
  });

  it('accepts a fully configured deployment', () => {
    expect(parseAdminEnv(deployed).ok).toBe(true);
  });

  it('rejects a proxy endpoint with no scheme', () => {
    // `z.string().url()` alone accepts `localhost:4000` — it reads
    // `localhost:` as the scheme, so the likeliest typo would pass.
    expect(
      parseAdminEnv({ ...base, LITELLM_PROXY_URL: 'localhost:4000' }).ok,
    ).toBe(false);
  });

  describe('Google sign-in, the defect #1115 fixed', () => {
    it('accepts both halves set', () => {
      expect(
        parseAdminEnv({
          ...base,
          GOOGLE_CLIENT_ID: 'id',
          GOOGLE_CLIENT_SECRET: 'secret',
        }).ok,
      ).toBe(true);
    });

    it('accepts neither half set — sign-in is optional', () => {
      expect(parseAdminEnv(base).ok).toBe(true);
    });

    it.each([
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      ['GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_ID'],
    ])('rejects %s alone', (present, missing) => {
      // Half-configured is what rendered a "Sign in with Google" button that
      // failed at Google with `invalid_client`.
      const result = parseAdminEnv({ ...base, [present]: 'value' });

      expect(result.ok).toBe(false);
      expect(result.ok ? '' : result.report).toContain(missing);
    });

    it.each([
      ['""', ''],
      ['whitespace', '   '],
    ])('treats %s as unset, not as configured', (_label, value) => {
      // `apps/admin/.env.example` ships both declared as `""`, so a copied
      // but unfilled env file must not read as half-configured.
      expect(
        parseAdminEnv({
          ...base,
          GOOGLE_CLIENT_ID: value,
          GOOGLE_CLIENT_SECRET: value,
        }).ok,
      ).toBe(true);

      // ...and one real half beside one blank half is still half.
      expect(
        issueNames({
          ...base,
          GOOGLE_CLIENT_ID: 'id',
          GOOGLE_CLIENT_SECRET: value,
        }),
      ).toContain('GOOGLE_CLIENT_ID');
    });
  });

  describe('secrets a deployment cannot do without', () => {
    it.each([['LITELLM_MASTER_KEY'], ['INTERNAL_API_SECRET']])(
      'requires %s once TARGET_ENV is deployed',
      (name) => {
        expect(issueNames(without(name))).toContain(name);
      },
    );

    it('requires neither on a local clone', () => {
      expect(parseAdminEnv({ ...base, TARGET_ENV: 'local' }).ok).toBe(true);
    });
  });

  describe('the vault pairs', () => {
    it.each([
      ['RAGEN_TOKEN_VAULT_URL', 'RAGEN_TOKEN_VAULT_SERVICE_SECRET'],
      ['RAGEN_VAULT_URL', 'RAGEN_VAULT_SERVICE_SECRET'],
    ])('rejects %s without its secret', (urlName, secretName) => {
      // A signed client with a URL and no secret produces 401s from the
      // vault rather than a legible configuration error (ADR-32).
      expect(
        issueNames({ ...base, [urlName]: 'https://vault.example.com' }),
      ).toContain(urlName);

      expect(
        parseAdminEnv({
          ...base,
          [urlName]: 'https://vault.example.com',
          [secretName]: 'shh',
        }).ok,
      ).toBe(true);
    });
  });

  describe('SECURITY_ALERT_SEVERITY', () => {
    it.each([['info'], ['warn'], ['critical']])('accepts %s', (value) => {
      expect(
        parseAdminEnv({ ...base, SECURITY_ALERT_SEVERITY: value }).ok,
      ).toBe(true);
    });

    it.each([['WARN'], ['  critical  ']])(
      'accepts %s, because AlertStatus trims and lowercases before comparing',
      (value) => {
        expect(
          parseAdminEnv({ ...base, SECURITY_ALERT_SEVERITY: value }).ok,
        ).toBe(true);
      },
    );

    it('reports a threshold that matches nothing', () => {
      // `high` is not one of the three, so no alert would ever match it —
      // while the panel still reports alerting as on, because recipients are
      // set. Silent, and previously unreported at boot.
      const result = parseAdminEnv({
        ...base,
        SECURITY_ALERT_EMAIL: 'ops@example.com',
        SECURITY_ALERT_SEVERITY: 'high',
      });

      expect(result.ok).toBe(false);
      expect(result.ok ? '' : result.report).toContain(
        'SECURITY_ALERT_SEVERITY',
      );
    });

    it('accepts it unset — the default threshold applies', () => {
      expect(parseAdminEnv(base).ok).toBe(true);
    });
  });

  it('collects every problem at once rather than the first', () => {
    // The whole point of the non-throwing parse: a boot loop that reveals one
    // missing variable per restart turns a ten-minute setup into an afternoon.
    const names = issueNames({
      DATABASE_URL: 'not-a-url',
      LITELLM_PROXY_URL: 'localhost:4000',
      GOOGLE_CLIENT_ID: 'id',
    });

    expect(names).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'LITELLM_PROXY_URL',
        'GOOGLE_CLIENT_ID',
      ]),
    );
  });
});
