import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A five-line binding is still the only place its wiring exists, and it fails
 * silently when it breaks: a wrong service name is invisible until somebody
 * reads the vault's logs, and a wrong customer-id shape means every revoke
 * deletes nothing while reporting success.
 */

const constructed: unknown[] = [];

vi.mock('@ragenai/vault-client', () => ({
  RagenAuthClient: class {
    constructor(options: unknown) {
      constructed.push(options);
    }
  },
}));

vi.mock('../logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

const {
  API_KEY_VAULT_PROVIDER,
  apiKeyVaultCustomerId,
  getVaultClient,
  isVaultConfigured,
  resetVaultClientForTests,
} = await import('../vault');

beforeEach(() => {
  constructed.length = 0;
  resetVaultClientForTests();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isVaultConfigured', () => {
  it('is false with neither variable set', () => {
    vi.stubEnv('RAGEN_TOKEN_VAULT_URL', '');
    vi.stubEnv('RAGEN_TOKEN_VAULT_SERVICE_SECRET', '');
    vi.stubEnv('RAGEN_VAULT_URL', '');
    vi.stubEnv('RAGEN_VAULT_SERVICE_SECRET', '');

    expect(isVaultConfigured()).toBe(false);
  });

  it('is false with a URL but no secret', () => {
    vi.stubEnv('RAGEN_TOKEN_VAULT_URL', 'http://vault.test');
    vi.stubEnv('RAGEN_TOKEN_VAULT_SERVICE_SECRET', '');
    vi.stubEnv('RAGEN_VAULT_SERVICE_SECRET', '');

    expect(isVaultConfigured()).toBe(false);
  });

  it('is true with the primary pair', () => {
    vi.stubEnv('RAGEN_TOKEN_VAULT_URL', 'http://vault.test');
    vi.stubEnv('RAGEN_TOKEN_VAULT_SERVICE_SECRET', 'shhh');

    expect(isVaultConfigured()).toBe(true);
  });

  // The older spelling is still what some deployments set, and apps/web falls
  // back to it. A panel that only read the new names would report "vault not
  // configured" on an installation whose vault works fine.
  it('accepts the legacy RAGEN_VAULT_* names', () => {
    vi.stubEnv('RAGEN_TOKEN_VAULT_URL', '');
    vi.stubEnv('RAGEN_TOKEN_VAULT_SERVICE_SECRET', '');
    vi.stubEnv('RAGEN_VAULT_URL', 'http://vault.test');
    vi.stubEnv('RAGEN_VAULT_SERVICE_SECRET', 'shhh');

    expect(isVaultConfigured()).toBe(true);
  });
});

describe('getVaultClient', () => {
  it('identifies itself as ragen-admin', () => {
    vi.stubEnv('RAGEN_TOKEN_VAULT_URL', 'http://vault.test');
    vi.stubEnv('RAGEN_TOKEN_VAULT_SERVICE_SECRET', 'shhh');

    getVaultClient();

    expect(constructed).toHaveLength(1);
    expect(constructed[0]).toMatchObject({
      baseUrl: 'http://vault.test',
      secret: 'shhh',
      serviceName: 'ragen-admin',
    });
  });

  it('builds the client once', () => {
    vi.stubEnv('RAGEN_TOKEN_VAULT_URL', 'http://vault.test');
    vi.stubEnv('RAGEN_TOKEN_VAULT_SERVICE_SECRET', 'shhh');

    getVaultClient();
    getVaultClient();

    expect(constructed).toHaveLength(1);
  });

  it('throws a message naming both variables when unconfigured', () => {
    vi.stubEnv('RAGEN_TOKEN_VAULT_URL', '');
    vi.stubEnv('RAGEN_TOKEN_VAULT_SERVICE_SECRET', '');
    vi.stubEnv('RAGEN_VAULT_URL', '');
    vi.stubEnv('RAGEN_VAULT_SERVICE_SECRET', '');

    expect(() => getVaultClient()).toThrow(
      /RAGEN_TOKEN_VAULT_URL and RAGEN_TOKEN_VAULT_SERVICE_SECRET/,
    );
  });
});

describe('the address an API key secret is stored under', () => {
  /**
   * These two must match `create-api-key-command.ts` in apps/web exactly. If
   * either drifts, every revoke deletes a key that does not exist — and the
   * vault answers that cheerfully, so the panel would report success while
   * leaving the secret in place.
   */
  it('matches the customer id apps/web writes', () => {
    expect(apiKeyVaultCustomerId('abc-123')).toBe('api-key-abc-123');
  });

  it('matches the provider apps/web writes', () => {
    expect(API_KEY_VAULT_PROVIDER).toBe('ragen-api-key');
  });
});
