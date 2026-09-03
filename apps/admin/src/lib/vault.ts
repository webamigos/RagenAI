import 'server-only';

import { RagenAuthClient } from '@ragenai/vault-client';

import { logger } from './logger';

/**
 * This app's binding of the shared ragen-token-vault client (ADR-32).
 *
 * The client, the HMAC signing and the transport live in the package. What
 * belongs here is the wiring: this app's environment, this app's logger, and
 * this app's service name — which the vault sees, so `ragen-admin` is what
 * shows up in its logs rather than a request indistinguishable from apps/web's.
 *
 * ## Why the panel needs this at all
 *
 * An API key is two halves. `ApiKey` in Postgres holds the metadata and the
 * masked value; the secret itself lives only in the vault under
 * `api-key-<id>`. So the panel can *read* keys with Prisma alone, but it
 * cannot destroy one without reaching the vault — and a key whose row is gone
 * while its secret survives is exactly the orphan this binding exists to
 * avoid.
 */

let cached: RagenAuthClient | null = null;

/**
 * An empty value counts as unset, which `??` would not do — and it is the
 * likelier shape. A `.env` that declares a variable and leaves it blank is
 * how every optional setting in `.env.example` is written, and with `??` a
 * blank `RAGEN_TOKEN_VAULT_URL` wins over a populated `RAGEN_VAULT_URL`,
 * so the fallback below would never fire on exactly the deployment it exists
 * for. apps/web's copy has the same `??`; there it surfaces as an error
 * naming the variables, here it would silently disable the Revoke button.
 */
function firstSet(...values: (string | undefined)[]): string | undefined {
  return values.find((value) => value !== undefined && value.trim() !== '');
}

/**
 * Both variable names are accepted because both are already in use:
 * `RAGEN_TOKEN_VAULT_*` is what apps/web reads first, `RAGEN_VAULT_*` is the
 * older spelling it still falls back to. The panel matches that rather than
 * inventing a third convention nobody's deployment sets.
 */
function readEnv(): { baseUrl?: string; secret?: string } {
  return {
    baseUrl: firstSet(
      process.env.RAGEN_TOKEN_VAULT_URL,
      process.env.RAGEN_VAULT_URL,
    ),
    secret: firstSet(
      process.env.RAGEN_TOKEN_VAULT_SERVICE_SECRET,
      process.env.RAGEN_VAULT_SERVICE_SECRET,
    ),
  };
}

/**
 * Whether revoking is possible at all in this deployment.
 *
 * Checked before the action runs, and surfaced on the page, because the
 * alternative is a Revoke button that throws only after an administrator has
 * confirmed it. The rest of the API Keys page — reading, deactivating —
 * needs no vault, so an unconfigured vault degrades one control rather than
 * the page.
 */
export function isVaultConfigured(): boolean {
  const { baseUrl, secret } = readEnv();
  return Boolean(baseUrl && secret);
}

export function getVaultClient(): RagenAuthClient {
  if (!cached) {
    const { baseUrl, secret } = readEnv();
    if (!baseUrl || !secret) {
      throw new Error(
        'RAGEN_TOKEN_VAULT_URL and RAGEN_TOKEN_VAULT_SERVICE_SECRET must be set to revoke an API key.',
      );
    }
    cached = new RagenAuthClient({
      baseUrl,
      secret,
      serviceName: 'ragen-admin',
      logger,
    });
  }
  return cached;
}

/** The provider name apps/web stores API-key secrets under. Must match. */
export const API_KEY_VAULT_PROVIDER = 'ragen-api-key';

/** The customer id apps/web derives from the key's row id. Must match. */
export function apiKeyVaultCustomerId(apiKeyId: string): string {
  return `api-key-${apiKeyId}`;
}

/** Exported for tests, which need each case to build its own client. */
export function resetVaultClientForTests(): void {
  cached = null;
}
