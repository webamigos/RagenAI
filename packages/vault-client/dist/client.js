"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RagenAuthClient = void 0;
const signing_1 = require("./signing");
const REQUEST_TIMEOUT_MS = 10_000;
const SILENT_LOGGER = { info: () => { } };
class RagenAuthClient {
    baseUrl;
    secret;
    serviceName;
    logger;
    constructor({ baseUrl, secret, serviceName, logger }) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.secret = secret;
        this.serviceName = serviceName;
        this.logger = logger ?? SILENT_LOGGER;
    }
    async request(method, path, body) {
        const bodyStr = body ? JSON.stringify(body) : '';
        const timestamp = Math.floor(Date.now() / 1000);
        const sig = (0, signing_1.signVaultRequest)({
            secret: this.secret,
            timestamp,
            method,
            path,
            body: bodyStr,
        });
        const url = `${this.baseUrl}${path}`;
        const headers = {
            Authorization: (0, signing_1.vaultAuthorizationHeader)(timestamp, sig),
            'X-Service-Name': this.serviceName,
        };
        if (body) {
            headers['Content-Type'] = 'application/json';
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(url, {
                method,
                headers,
                body: bodyStr || undefined,
                signal: controller.signal,
            });
            if (!response.ok) {
                const errorBody = await response.text().catch(() => 'unknown');
                throw new Error(`ragen-token-vault ${method} ${path} returned ${response.status}: ${errorBody}`);
            }
            // DELETE returns 204 with no body
            if (response.status === 204) {
                return undefined;
            }
            return (await response.json());
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(`ragen-token-vault ${method} ${path} timed out`);
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    tokenPath(customerId, provider) {
        return `/v1/tokens/${encodeURIComponent(customerId)}/${encodeURIComponent(provider)}`;
    }
    async storeToken(customerId, provider, data) {
        // Convert to snake_case for the vault API
        const payload = {
            access_token: data.accessToken,
        };
        if (data.refreshToken) {
            payload.refresh_token = data.refreshToken;
        }
        if (data.clientId) {
            payload.client_id = data.clientId;
        }
        if (data.clientSecret) {
            payload.client_secret = data.clientSecret;
        }
        if (data.codeVerifier) {
            payload.code_verifier = data.codeVerifier;
        }
        if (data.tokenType) {
            payload.token_type = data.tokenType;
        }
        if (data.expires_at) {
            payload.expires_at = data.expires_at;
        }
        if (data.scopes) {
            payload.scopes = data.scopes;
        }
        if (data.token_uri) {
            payload.token_uri = data.token_uri;
        }
        await this.request('PUT', this.tokenPath(customerId, provider), payload);
        this.logger.info({ provider }, 'Stored token in ragen-token-vault');
    }
    async getToken(customerId, provider) {
        // Vault returns snake_case, convert to camelCase
        const raw = await this.request('GET', this.tokenPath(customerId, provider));
        const accessToken = raw.access_token ?? raw.accessToken;
        if (!accessToken) {
            throw new Error(`Token response missing access_token for provider ${provider}`);
        }
        return {
            accessToken,
            refreshToken: raw.refresh_token ??
                raw.refreshToken ??
                null,
            clientId: raw.client_id ??
                raw.clientId ??
                null,
            clientSecret: raw.client_secret ??
                raw.clientSecret ??
                null,
            codeVerifier: raw.code_verifier ??
                raw.codeVerifier ??
                null,
            tokenType: raw.token_type ??
                raw.tokenType ??
                null,
            expires_at: raw.expires_at ?? null,
            scopes: raw.scopes ?? null,
            token_uri: raw.token_uri ??
                raw.tokenUri ??
                null,
        };
    }
    async deleteToken(customerId, provider) {
        await this.request('DELETE', this.tokenPath(customerId, provider));
        this.logger.info({ provider }, 'Deleted token from ragen-token-vault');
    }
    async getTokenStatus(customerId, provider) {
        return this.request('GET', `${this.tokenPath(customerId, provider)}/status`);
    }
    async listTokens(customerId) {
        const path = `/v1/tokens/${encodeURIComponent(customerId)}`;
        return this.request('GET', path);
    }
}
exports.RagenAuthClient = RagenAuthClient;
//# sourceMappingURL=client.js.map