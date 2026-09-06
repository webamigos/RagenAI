import { describe, expect, it } from 'vitest';

import { parseWebEnv } from '../env';

/**
 * The contract exists because apps/web had none: it imported `@ragenai/env`
 * for `isDeployedEnv()` and validated nothing, so a deployment with a missing
 * variable started and failed later, somewhere unrelated.
 *
 * Every case below passes an explicit source rather than touching
 * `process.env`, the way `@ragenai/env`'s own tests do.
 */
const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/ragen',
  LITELLM_PROXY_URL: 'http://localhost:4000',
};

const deployed = {
  ...base,
  TARGET_ENV: 'demo',
  LITELLM_MASTER_KEY: 'sk-x',
  SECRET_KEY: 'k',
  SESSION_AUTH_SECRET: 's',
  BETTER_AUTH_SECRET: 'b',
  BETTER_AUTH_URL: 'https://demo.example.com',
};

describe('the apps/web environment contract', () => {
  it('accepts a fresh clone with only the documented minimum', () => {
    // AGENTS.md's minimum `.env.local` lists neither TARGET_ENV nor any
    // secret. Turning that into a boot failure would break the first thing a
    // self-hoster runs, so this has to keep passing.
    expect(parseWebEnv(base).ok).toBe(true);
  });

  it('rejects a database URL that is not a URL', () => {
    expect(parseWebEnv({ ...base, DATABASE_URL: 'not-a-url' }).ok).toBe(false);
  });

  it('rejects a proxy endpoint with no scheme', () => {
    // `z.string().url()` alone accepts `localhost:4000` — it reads
    // `localhost:` as the scheme. Dropping `http://` is the single most
    // likely way to mistype this.
    const result = parseWebEnv({
      ...base,
      LITELLM_PROXY_URL: 'localhost:4000',
    });

    expect(result.ok).toBe(false);
  });

  it('accepts a fully configured deployment', () => {
    expect(parseWebEnv(deployed).ok).toBe(true);
  });

  it.each([
    ['LITELLM_MASTER_KEY'],
    ['SECRET_KEY'],
    ['SESSION_AUTH_SECRET'],
    ['BETTER_AUTH_SECRET'],
  ])('refuses a deployment missing %s', (name) => {
    const result = parseWebEnv({ ...deployed, [name]: undefined });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report).toContain(name);
    }
  });

  it('refuses a deployment with no origin for email links', () => {
    // getBaseUrl() throws for this, but every caller is inside a mailer that
    // catches — so an invitation silently never arrives instead of the
    // deployment refusing to start.
    const result = parseWebEnv({
      ...deployed,
      BETTER_AUTH_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report).toContain('BETTER_AUTH_URL');
    }
  });

  it('accepts NEXT_PUBLIC_APP_URL alone as that origin', () => {
    expect(
      parseWebEnv({
        ...deployed,
        BETTER_AUTH_URL: undefined,
        NEXT_PUBLIC_APP_URL: 'https://demo.example.com',
      }).ok,
    ).toBe(true);
  });

  it.each(['local', 'test', 'e2e', 'ci'])(
    'leaves the deployment-only variables optional when TARGET_ENV is %s',
    (targetEnv) => {
      expect(parseWebEnv({ ...base, TARGET_ENV: targetEnv }).ok).toBe(true);
    },
  );

  it('applies the deployment rules to demo, not just staging and production', () => {
    // The whole point of the denylist in isDeployedEnv(): a new environment
    // inherits the checks instead of escaping them.
    const result = parseWebEnv({ ...base, TARGET_ENV: 'demo' });

    expect(result.ok).toBe(false);
  });

  it('refuses a half-configured token vault', () => {
    // Half is worse than absent: the client constructs and then 401s per
    // request, which reads as "the vault is flaky" (ADR-32).
    const result = parseWebEnv({
      ...base,
      RAGEN_TOKEN_VAULT_URL: 'http://localhost:3100',
    });

    expect(result.ok).toBe(false);
  });
});
