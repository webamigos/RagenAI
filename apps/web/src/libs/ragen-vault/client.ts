import { RagenAuthClient } from '@ragenai/vault-client';
import { logger } from '@/app/lib/utils/logger';

let _ragenAuthClient: RagenAuthClient | null = null;

/**
 * The vault client itself lives in `@ragenai/vault-client` (ADR-32) — the
 * request signing and transport were duplicated between here and apps/api,
 * differing only in logger and service name. What stays here is the wiring:
 * reading this app's environment and handing over this app's logger.
 */
function getRagenAuthClient(): RagenAuthClient {
  if (!_ragenAuthClient) {
    const baseUrl =
      process.env.RAGEN_TOKEN_VAULT_URL ?? process.env.RAGEN_VAULT_URL;
    const secret =
      process.env.RAGEN_TOKEN_VAULT_SERVICE_SECRET ??
      process.env.RAGEN_VAULT_SERVICE_SECRET;

    if (!baseUrl || !secret) {
      throw new Error(
        'RAGEN_TOKEN_VAULT_URL and RAGEN_TOKEN_VAULT_SERVICE_SECRET must be set',
      );
    }

    _ragenAuthClient = new RagenAuthClient({
      baseUrl,
      secret,
      serviceName: 'ragen-app',
      logger,
    });
  }
  return _ragenAuthClient;
}

export { getRagenAuthClient };

/**
 * Lazy-initialized singleton. Access via property getter to avoid
 * crashing at import time when env vars are not yet available.
 */
export const ragenAuthClient = new Proxy({} as RagenAuthClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getRagenAuthClient(), prop, receiver);
  },
});
