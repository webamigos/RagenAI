"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signVaultRequest = signVaultRequest;
exports.vaultAuthorizationHeader = vaultAuthorizationHeader;
const node_crypto_1 = require("node:crypto");
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
function signVaultRequest({ secret, timestamp, method, path, body, }) {
    const bodySha256 = (0, node_crypto_1.createHash)('sha256').update(body).digest('hex');
    const message = `${timestamp}\n${method}\n${path}\n${bodySha256}`;
    return (0, node_crypto_1.createHmac)('sha256', secret).update(message).digest('hex');
}
/** The `Authorization` header value the vault expects, for a given signature. */
function vaultAuthorizationHeader(timestamp, signature) {
    return `HMAC-SHA256 ts=${timestamp},sig=${signature}`;
}
//# sourceMappingURL=signing.js.map