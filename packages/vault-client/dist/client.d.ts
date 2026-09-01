/**
 * Minimal logging surface, so the caller can pass whatever it already has —
 * apps/web has a pino logger whose first argument is a metadata object, and
 * apps/api has a NestJS Logger. Neither is a dependency of this package.
 */
export type VaultClientLogger = {
    info: (meta: Record<string, unknown>, message: string) => void;
};
export type VaultClientOptions = {
    baseUrl: string;
    secret: string;
    /**
     * Sent as `X-Service-Name` for the vault's own auditing. Not part of the
     * signature — apps/web and apps/api are distinct callers and say so.
     */
    serviceName: string;
    logger?: VaultClientLogger;
};
export type StoreTokenData = {
    accessToken: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    codeVerifier?: string;
    tokenType?: string;
    expires_at?: string;
    scopes?: string[];
    token_uri?: string;
};
export type TokenResponse = {
    accessToken: string;
    refreshToken: string | null;
    clientId: string | null;
    clientSecret: string | null;
    codeVerifier: string | null;
    tokenType: string | null;
    expires_at: string | null;
    scopes: string[] | null;
    token_uri: string | null;
};
export type TokenStatusResponse = {
    provider: string;
    tokenType: string | null;
    expires_at: string | null;
    scopes: string[] | null;
    is_expired: boolean;
    createdAt: string;
    updatedAt: string;
};
export type ListTokensResponse = {
    tokens: TokenStatusResponse[];
};
export declare class RagenAuthClient {
    private readonly baseUrl;
    private readonly secret;
    private readonly serviceName;
    private readonly logger;
    constructor({ baseUrl, secret, serviceName, logger }: VaultClientOptions);
    private request;
    private tokenPath;
    storeToken(customerId: string, provider: string, data: StoreTokenData): Promise<void>;
    getToken(customerId: string, provider: string): Promise<TokenResponse>;
    deleteToken(customerId: string, provider: string): Promise<void>;
    getTokenStatus(customerId: string, provider: string): Promise<TokenStatusResponse>;
    listTokens(customerId: string): Promise<ListTokensResponse>;
}
//# sourceMappingURL=client.d.ts.map