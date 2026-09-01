import { createHash, createHmac } from 'node:crypto';

/**
 * Canonical request signature for ragen-token-vault.
 *
 * The scheme is fixed by the vault server: HMAC-SHA256 over
 * `timestamp\nmethod\npath\nsha256(body)`, hex-encoded. It lived in three
 * separate copies before ADR-32 — apps/web, apps/api's connector client and
 * apps/api's API-key client — which is the kind of duplication that drifts
 * quietly and then surfaces as a 401 nobody can explain.
 *
 * `timestamp` is seconds since the epoch. It is passed in rather than read
 * here so a caller can put the same value in the header it signs.
 */
export function signVaultRequest({
  secret,
  timestamp,
  method,
  path,
  body,
}: {
  secret: string;
  timestamp: number | string;
  method: string;
  path: string;
  body: string;
}): string {
  const bodySha256 = createHash('sha256').update(body).digest('hex');
  const message = `${timestamp}\n${method}\n${path}\n${bodySha256}`;
  return createHmac('sha256', secret).update(message).digest('hex');
}

/** The `Authorization` header value the vault expects, for a given signature. */
export function vaultAuthorizationHeader(
  timestamp: number | string,
  signature: string,
): string {
  return `HMAC-SHA256 ts=${timestamp},sig=${signature}`;
}
