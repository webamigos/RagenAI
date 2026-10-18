/**
 * Company sign-in over OpenID Connect: one generic provider, configured by
 * environment, that covers Microsoft Entra ID, Google Workspace, Keycloak and
 * any other issuer that publishes a discovery document.
 *
 * Open edition (decision D1 of
 * docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md). Off unless
 * configured; nothing here runs for an install that sets none of these.
 *
 * Kept free of Better Auth and the database so the parsing and the domain gate
 * — the two parts that decide who gets in — can be tested on their own.
 */

/** The Better Auth provider id. Part of the callback URL the IdP is given. */
export const OIDC_PROVIDER_ID = 'oidc';

/**
 * Which issuer this is, where Better Auth has something specific for it.
 *
 * - `microsoft-entra-id`: a single Entra tenant named by its GUID. Wired
 *   through Better Auth's `microsoftEntraId` helper, which keys the account on
 *   the immutable `oid` claim rather than the per-application `sub`.
 * - `google`: Google's issuer. The `hd` claim is required (see
 *   `requireHostedDomain`) and the authorization request carries `hd`, so
 *   Google's account chooser offers Workspace accounts only.
 * - `generic`: everything else — Keycloak, Okta, Authentik, an Entra tenant
 *   named by domain rather than GUID — over its discovery document.
 */
export type OidcIssuerKind = 'generic' | 'microsoft-entra-id' | 'google';

export type OidcConfig = {
  issuer: string;
  kind: OidcIssuerKind;
  /** The Entra tenant GUID, lowercase, for `microsoft-entra-id`; else null. */
  entraTenantId: string | null;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  /** Lowercase, without a leading `@`. Never empty. */
  allowedDomains: string[];
  /** Shown on the sign-in button. */
  displayName: string;
  /**
   * The organization new SSO users join as members, by id or slug. Unset, an
   * SSO sign-up is treated like any other: gated by the registration switch,
   * and given an organization of its own.
   */
  joinOrganization: string | null;
  /**
   * Treat an allowed-domain address as verified even when the issuer sends no
   * `email_verified` claim. Microsoft Entra ID does not send one; an operator
   * whose tenant owns the allowed domains sets `OIDC_TRUST_EMAIL=true` to say
   * so. Off by default: a missing claim is not a verified address.
   */
  trustEmail: boolean;
  /**
   * Require the ID token's `hd` (hosted domain) claim to be an allowed domain.
   *
   * On for Google's issuer, and not configurable off. Google's
   * `email_verified` proves the address, not membership of a Workspace: anyone
   * can make a personal Google account on `jan@yourcompany.com` and verify it
   * through a link. `hd` is what Google sets only for an account the Workspace
   * itself manages, so without it the domain gate would admit a stranger who
   * can read one company mailbox.
   */
  requireHostedDomain: boolean;
};

export type OidcStatus =
  | { status: 'off' }
  | { status: 'on'; config: OidcConfig }
  | { status: 'invalid'; problems: string[] };

type Env = Record<string, string | undefined>;

const set = (value: string | undefined) => value?.trim() || undefined;

/**
 * Read the OIDC settings.
 *
 * `invalid` rather than a throw: apps/web must not refuse to boot, because the
 * page that explains a misconfiguration is served by this same process. An
 * invalid configuration turns company sign-in off and is reported on the setup
 * checklist; password sign-in keeps working, so nobody is locked out by a typo.
 *
 * `OIDC_ALLOWED_DOMAINS` is required, not a refinement. An issuer such as a
 * multi-tenant Entra endpoint or Google's will vouch for accounts the install
 * has nothing to do with, and "every account the issuer knows" is never the
 * intended audience of a company's knowledge base.
 */
export function oidcConfigFromEnv(env: Env): OidcStatus {
  const issuer = set(env.OIDC_ISSUER);
  const clientId = set(env.OIDC_CLIENT_ID);
  const clientSecret = set(env.OIDC_CLIENT_SECRET);
  const domains = set(env.OIDC_ALLOWED_DOMAINS);

  if (!issuer && !clientId && !clientSecret && !domains) {
    return { status: 'off' };
  }

  const problems: string[] = [];
  if (!issuer) {
    problems.push('OIDC_ISSUER is not set');
  } else if (!isHttpUrl(issuer)) {
    problems.push('OIDC_ISSUER is not an http(s) URL');
  } else if (entraTenant(issuer)?.multiTenant) {
    problems.push(
      'OIDC_ISSUER names a multi-tenant Microsoft authority (common, organizations or consumers); use your tenant ID',
    );
  }
  if (!clientId) {
    problems.push('OIDC_CLIENT_ID is not set');
  }
  if (!clientSecret) {
    problems.push('OIDC_CLIENT_SECRET is not set');
  }

  const allowedDomains = (domains ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter((domain) => domain.length > 0);
  if (allowedDomains.length === 0) {
    problems.push('OIDC_ALLOWED_DOMAINS is not set');
  } else if (
    allowedDomains.some((domain) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain))
  ) {
    problems.push('OIDC_ALLOWED_DOMAINS has an entry that is not a domain');
  }

  if (problems.length > 0) {
    return { status: 'invalid', problems };
  }

  const base = issuer!.replace(/\/+$/, '');
  const entraTenantId = entraTenant(base)?.guid ?? null;
  let kind: OidcIssuerKind = 'generic';
  if (entraTenantId) {
    kind = 'microsoft-entra-id';
  } else if (isGoogleIssuer(base)) {
    kind = 'google';
  }
  return {
    status: 'on',
    config: {
      issuer: base,
      kind,
      entraTenantId,
      discoveryUrl: `${base}/.well-known/openid-configuration`,
      clientId: clientId!,
      clientSecret: clientSecret!,
      allowedDomains,
      displayName: set(env.OIDC_DISPLAY_NAME) ?? 'company account',
      joinOrganization: set(env.OIDC_JOIN_ORGANIZATION) ?? null,
      trustEmail: set(env.OIDC_TRUST_EMAIL) === 'true',
      requireHostedDomain: kind === 'google',
    },
  };
}

const ENTRA_HOST = 'login.microsoftonline.com';
const ENTRA_MULTI_TENANT = new Set(['common', 'organizations', 'consumers']);
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The tenant segment of an Entra issuer, or null for any other issuer.
 *
 * A multi-tenant authority is refused outright: its discovery document
 * advertises a templated `{tenantid}` issuer that no ID token matches, and it
 * would vouch for every Entra tenant there is. A tenant named by domain
 * (`contoso.onmicrosoft.com`) is neither — discovery resolves it — so it stays
 * on the generic path; only a GUID gets the Entra helper, which requires one.
 */
function entraTenant(
  issuer: string,
): { guid: string | null; multiTenant: boolean } | null {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    return null;
  }
  if (url.hostname !== ENTRA_HOST) {
    return null;
  }
  const tenant = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase();
  return {
    guid: tenant && GUID.test(tenant) ? tenant : null,
    multiTenant: tenant !== undefined && ENTRA_MULTI_TENANT.has(tenant),
  };
}

/**
 * The `hd` authorization parameter for Google: the one allowed domain, or `*`
 * (any Workspace) when there are several. It only shapes Google's account
 * chooser — the ID token's `hd` claim is what `gateProfile` checks.
 */
export function googleHostedDomainHint(
  allowedDomains: readonly string[],
): string {
  return allowedDomains.length === 1 ? allowedDomains[0]! : '*';
}

/**
 * Whether the issuer vouched for the address, from the raw claims: `true`,
 * `false`, or `null` when it said nothing.
 *
 * Read from the claims rather than the profile's `emailVerified`, which
 * Better Auth's Entra helper sets to `false` for a missing claim — and that
 * would make `OIDC_TRUST_EMAIL` unable to fill it in. Entra's optional
 * `verified_primary_email` / `verified_secondary_email` claims count, as they
 * do in Better Auth's own Microsoft provider.
 */
export function issuerEmailVerified(
  claims: Record<string, unknown>,
): boolean | null {
  if (typeof claims.email_verified === 'boolean') {
    return claims.email_verified;
  }
  const verifiedLists = [
    claims.verified_primary_email,
    claims.verified_secondary_email,
  ].filter((list): list is unknown[] => Array.isArray(list));
  if (verifiedLists.length === 0 || typeof claims.email !== 'string') {
    return null;
  }
  const email = claims.email.toLowerCase();
  return verifiedLists.some((list) =>
    list.some(
      (entry) => typeof entry === 'string' && entry.toLowerCase() === email,
    ),
  );
}

function isGoogleIssuer(issuer: string): boolean {
  try {
    return new URL(issuer).hostname === 'accounts.google.com';
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Whether `email` belongs to one of the allowed domains, exactly. */
export function isAllowedEmail(
  email: string | null | undefined,
  allowedDomains: readonly string[],
): boolean {
  const at = email?.lastIndexOf('@') ?? -1;
  if (!email || at < 1) {
    return false;
  }
  const domain = email.slice(at + 1).toLowerCase();
  return allowedDomains.includes(domain);
}

/**
 * What the provider's profile becomes, with the domain gate applied.
 *
 * An address outside the allowed domains is mapped to an empty email, which
 * Better Auth's callback refuses with `email_not_found` before it creates or
 * links anything — the user lands back on sign-in with an error, and no row
 * is written.
 *
 * `emailVerified` is passed through only for an allowed domain. It matters
 * more than it looks: Better Auth links an OAuth sign-in to an existing local
 * account with the same address when the provider says the address is
 * verified. Trusting that for any domain would let an issuer that does not
 * own a domain — a self-registered tenant asserting `ceo@yourcompany.com` —
 * take over the local account behind it.
 */
export function gateProfile(
  profile: {
    email?: string | null;
    emailVerified?: boolean | null;
    hostedDomain?: string | null;
  },
  allowedDomains: readonly string[],
  options: { trustEmail?: boolean; requireHostedDomain?: boolean } = {},
): { email: string; emailVerified: boolean } {
  if (!isAllowedEmail(profile.email, allowedDomains)) {
    return { email: '', emailVerified: false };
  }
  if (
    options.requireHostedDomain &&
    !allowedDomains.includes(profile.hostedDomain?.toLowerCase() ?? '')
  ) {
    return { email: '', emailVerified: false };
  }
  // `trustEmail` only fills in a claim the issuer did not send. An issuer that
  // says outright the address is unverified is believed either way.
  const verified =
    profile.emailVerified === true ||
    (options.trustEmail === true && profile.emailVerified == null);
  return { email: profile.email!.toLowerCase(), emailVerified: verified };
}

/**
 * Whether a Better Auth hook is running inside this provider's OAuth callback.
 *
 * The user-create hooks run for every door — password sign-up, magic link,
 * this — and only this one may admit a user past closed registration into the
 * configured organization. The callback path is the one thing that tells them
 * apart; a body field would be the caller's to set.
 */
export function isOidcCallback(
  context: { path?: string; params?: Record<string, unknown> } | null,
): boolean {
  if (!context) {
    return false;
  }
  // Better Auth routes every provider's callback through `/callback/:id`
  // (`/oauth2/callback/:providerId` in older releases), so the id is a param.
  const id = context.params?.id ?? context.params?.providerId;
  if (id === OIDC_PROVIDER_ID) {
    return true;
  }
  return (
    context.path === `/callback/${OIDC_PROVIDER_ID}` ||
    context.path === `/oauth2/callback/${OIDC_PROVIDER_ID}`
  );
}
