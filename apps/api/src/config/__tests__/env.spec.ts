import { parseApiEnv } from '../env.js';

const VALID: Record<string, string> = {
  TARGET_ENV: 'local',
  DATABASE_URL: 'postgresql://postgres:pass@localhost:55432/ragen',
  // Part of the documented minimum, and required since ADR-44 made BullMQ the
  // default: this service enqueues jobs, and a producer that cannot reach
  // Redis cannot enqueue at all.
  REDIS_URL: 'redis://localhost:56379',
};

const withEnv = (overrides: Record<string, string | undefined> = {}) =>
  parseApiEnv({ ...VALID, ...overrides });

describe('parseApiEnv', () => {
  it('accepts a minimal local environment', () => {
    expect(withEnv().ok).toBe(true);
  });

  it('demands TARGET_ENV rather than defaulting a deployed service to local', () => {
    expect(withEnv({ TARGET_ENV: undefined }).ok).toBe(false);
  });

  /**
   * The default is `native`, where nothing authenticates against a proxy.
   * Demanding the credential anyway would refuse to boot a correctly
   * configured deployment, and the obvious workaround — invent a dummy master
   * key — is how a boot check stops being believed.
   *
   * Asserted as a deployment that *parses*, not as one whose report happens
   * not to mention the variable. Every other deployed requirement is supplied
   * here on purpose: without them the parse fails for unrelated reasons, and
   * an assertion about what the report does not say would pass whether or not
   * this rule works.
   */
  it('accepts a deployed environment with no master key when no gateway is named', () => {
    const result = withEnv({
      TARGET_ENV: 'production',
      INTERNAL_API_SECRET: 'internal-secret',
    });

    expect(result.ok).toBe(true);
  });

  it('requires INTERNAL_API_SECRET in production', () => {
    // Without it, every call to apps/web's internal endpoints fails the
    // timing-safe comparison and the public API answers every chat request
    // with an auth error.
    const result = withEnv({
      TARGET_ENV: 'production',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report).toContain('INTERNAL_API_SECRET');
    }
  });

  it('accepts a complete production environment', () => {
    expect(
      withEnv({
        TARGET_ENV: 'production',
        INTERNAL_API_SECRET: 'shared',
      }).ok,
    ).toBe(true);
  });

  it('asks for neither locally, so a fresh clone runs', () => {
    expect(withEnv({ TARGET_ENV: 'local' }).ok).toBe(true);
  });

  it('rejects a token vault URL with no signing secret', () => {
    // The vault client signs every request, so a URL without the secret
    // produces 401s from the vault rather than a legible misconfiguration
    // (ADR-32).
    const result = withEnv({ RAGEN_TOKEN_VAULT_URL: 'https://vault.example' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report).toContain('RAGEN_TOKEN_VAULT_SERVICE_SECRET');
    }
  });

  it('accepts a complete token vault configuration', () => {
    expect(
      withEnv({
        RAGEN_TOKEN_VAULT_URL: 'https://vault.example',
        RAGEN_TOKEN_VAULT_SERVICE_SECRET: 'shh',
      }).ok,
    ).toBe(true);
  });

  it('ignores variables it does not mention, so it can grow incrementally', () => {
    expect(withEnv({ SOME_FUTURE_VARIABLE: 'x' }).ok).toBe(true);
  });
});

/**
 * The producers' half of the worker-runtime seam (ADR-44).
 *
 * The two variants are not symmetric for a service that only enqueues. Under
 * BullMQ there is no fallback for `REDIS_URL`, so a missing one is an upload
 * that fails at request time rather than a service that refuses to start and
 * says which variable. Under Temporal the adapter falls back to
 * `localhost:7233` — right in compose — and demanding the address here would
 * refuse to boot deployments that work today, which is the mistake the master
 * key case above was written to prevent.
 */
describe('the worker runtime it enqueues into', () => {
  it('demands Redis when the runtime is unset, because bullmq is the default', () => {
    const result = withEnv({ REDIS_URL: undefined });

    expect(result.ok).toBe(false);
    expect(result.ok || result.report).toContain('REDIS_URL');
  });

  it('demands nothing extra under temporal, which has a working fallback', () => {
    expect(
      withEnv({ REDIS_URL: undefined, WORKER_RUNTIME: 'temporal' }).ok,
    ).toBe(true);
  });
});
