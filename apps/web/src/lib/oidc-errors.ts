/**
 * Why a company sign-in (OIDC) was refused, as the `?error=` code the callback
 * sends the browser back to the sign-in page with, and which sentence the
 * sign-in page shows for it.
 *
 * Shared by the server, which picks the code, and `LoginForm`, which reads it,
 * so this file imports nothing: it ends up in the client bundle.
 *
 * Codes are lowercase snake case, like Better Auth's own callback codes
 * (`email_not_found`, `state_mismatch`…), which arrive through the same
 * parameter and are mapped here too.
 */
export const SIGN_IN_REFUSAL = {
  /** Registration is closed and nothing else let this sign-up through. */
  REGISTRATION_DISABLED: 'registration_disabled',
  /** The address is not in `OIDC_ALLOWED_DOMAINS`. */
  DOMAIN_NOT_ALLOWED: 'oidc_domain_not_allowed',
  /** Google: the account is not managed by an allowed Workspace (`hd`). */
  HOSTED_DOMAIN_MISMATCH: 'oidc_hosted_domain_mismatch',
  /** The issuer did not say the address is verified (and `OIDC_TRUST_EMAIL` is off). */
  EMAIL_NOT_VERIFIED: 'oidc_email_not_verified',
  /** Registration is closed and `OIDC_JOIN_ORGANIZATION` is not set. */
  JOIN_ORGANIZATION_UNSET: 'oidc_join_organization_unset',
  /** `OIDC_JOIN_ORGANIZATION` names an organization that does not exist. */
  JOIN_ORGANIZATION_NOT_FOUND: 'oidc_join_organization_not_found',
  /** Better Auth's code for a profile with no address. */
  EMAIL_NOT_FOUND: 'email_not_found',
} as const;

export type SignInRefusal =
  (typeof SIGN_IN_REFUSAL)[keyof typeof SIGN_IN_REFUSAL];

/** A key in the `sign-in` message namespace. */
export type SsoErrorMessageKey =
  | 'sso-failed'
  | 'sso-error-registration-disabled'
  | 'sso-error-domain'
  | 'sso-error-hosted-domain'
  | 'sso-error-email-not-verified'
  | 'sso-error-join-organization-unset'
  | 'sso-error-join-organization-not-found'
  | 'sso-error-email-missing'
  | 'sso-error-account-not-linked'
  | 'sso-error-cancelled';

const MESSAGE_KEYS: Record<string, SsoErrorMessageKey> = {
  [SIGN_IN_REFUSAL.REGISTRATION_DISABLED]: 'sso-error-registration-disabled',
  [SIGN_IN_REFUSAL.DOMAIN_NOT_ALLOWED]: 'sso-error-domain',
  [SIGN_IN_REFUSAL.HOSTED_DOMAIN_MISMATCH]: 'sso-error-hosted-domain',
  [SIGN_IN_REFUSAL.EMAIL_NOT_VERIFIED]: 'sso-error-email-not-verified',
  [SIGN_IN_REFUSAL.JOIN_ORGANIZATION_UNSET]:
    'sso-error-join-organization-unset',
  [SIGN_IN_REFUSAL.JOIN_ORGANIZATION_NOT_FOUND]:
    'sso-error-join-organization-not-found',
  [SIGN_IN_REFUSAL.EMAIL_NOT_FOUND]: 'sso-error-email-missing',
  // Better Auth: an account with this address exists, and the issuer did not
  // say the address is verified, so the sign-in was not linked to it.
  account_not_linked: 'sso-error-account-not-linked',
  // OAuth 2.0: the user declined, or closed the provider's consent screen.
  access_denied: 'sso-error-cancelled',
};

/**
 * The sentence for an `?error=` code, or null when there is none to show.
 * Anything not listed — a state mismatch, an expired code, a provider outage —
 * gets the general one: the user can do nothing different about those.
 */
export function ssoErrorMessageKey(
  code: string | null | undefined,
): SsoErrorMessageKey | null {
  if (!code) {
    return null;
  }
  // Own keys only: `?error=` comes from the URL, and `constructor`,
  // `toString` or `__proto__` would otherwise resolve on Object.prototype.
  return Object.hasOwn(MESSAGE_KEYS, code) ? MESSAGE_KEYS[code] : 'sso-failed';
}
