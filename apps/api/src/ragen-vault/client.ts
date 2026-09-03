import { Logger } from '@nestjs/common';
import { RagenAuthClient } from '@ragenai/vault-client';

const logger = new Logger('RagenAuthClient');

let _ragenAuthClient: RagenAuthClient | null = null;

/**
 * The vault client itself lives in `@ragenai/vault-client` (ADR-32) — this
 * file and apps/web's copy were the same 270 lines apart from the logger and
 * the service name, including a third hand-written copy of the HMAC signing.
 *
 * NOTE: still a *different* vault namespace than ../vault/vault.client.ts
 * (API-key secret validation). They share the signing helper and nothing else.
 */
export function getRagenAuthClient(): RagenAuthClient {
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
      // apps/api is a distinct caller from apps/web and says so in the audit
      // trail the vault keeps.
      serviceName: 'ragen-api',
      logger: {
        info: (meta, message) =>
          logger.log(`${message} ${JSON.stringify(meta)}`),
      },
    });
  }
  return _ragenAuthClient;
}

/**
 * Lazy-initialized singleton. Access via property getter to avoid
 * crashing at import time when env vars are not yet available.
 */
export const ragenAuthClient = new Proxy({} as RagenAuthClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getRagenAuthClient(), prop, receiver);
  },
});
