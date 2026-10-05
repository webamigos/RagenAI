/** The authorization-server tables, never the MCP-client token table. */
export const OAUTH_SCALAR_LIST_FIELDS: Record<string, readonly string[]> = {
  oauthClient: [
    'scopes',
    'clientCredentialsScopes',
    'contacts',
    'redirectUris',
    'postLogoutRedirectUris',
    'grantTypes',
    'responseTypes',
  ],
  oauthResource: ['allowedScopes'],
  oauthRefreshToken: ['resources', 'requestedUserInfoClaims', 'scopes'],
  oauthAccessToken: ['resources', 'requestedUserInfoClaims', 'scopes'],
  oauthConsent: ['resources', 'requestedUserInfoClaims', 'scopes'],
};

/** Prisma rejects null scalar lists; SQL NULL is read back as []. */
export function sanitizeOAuthScalarLists(
  model: string,
  data: unknown,
): unknown {
  const fields =
    OAUTH_SCALAR_LIST_FIELDS[model[0].toLowerCase() + model.slice(1)];
  if (!fields || !data || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((row) => sanitizeOAuthScalarLists(model, row));
  }
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, value]) => !(value === null && fields.includes(key)),
    ),
  );
}
