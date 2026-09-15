import { parseApiEnv } from '../env.js';

const VALID: Record<string, string> = {
  TARGET_ENV: 'local',
  DATABASE_URL: 'postgresql://postgres:pass@localhost:55432/ragen',
  LITELLM_PROXY_URL: 'http://localhost:4000',
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

  it('requires LITELLM_MASTER_KEY in production on the proxy path, and says why', () => {
    const result = withEnv({
      TARGET_ENV: 'production',
      LLM_GATEWAY: 'litellm',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.report).toContain('LITELLM_MASTER_KEY');
      expect(result.report).toContain('every model call is authenticated');
    }
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
      LITELLM_MASTER_KEY: 'sk-x',
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
        LITELLM_MASTER_KEY: 'sk-x',
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

  it('rejects a scheme-less LiteLLM URL, which z.string().url() accepted', () => {
    expect(withEnv({ LITELLM_PROXY_URL: 'localhost:4000' }).ok).toBe(false);
  });

  it('ignores variables it does not mention, so it can grow incrementally', () => {
    expect(withEnv({ SOME_FUTURE_VARIABLE: 'x' }).ok).toBe(true);
  });
});
