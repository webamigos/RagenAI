/* eslint-disable no-console */
// Loaded by auth.ts, which is bundled for the Edge middleware too, so the
// logger stays out of this file for the same reason it stays out of that one.
import type { BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthMiddleware,
  getOAuthState,
  isAPIError,
} from 'better-auth/api';
import { genericOAuth } from 'better-auth/plugins';
import db from '@ragenai/prisma-client';
import { ORG_MEMBER_ROLE } from '@ragenai/platform-contracts';

import { ensureDefaultTeamMembershipCommand } from '@/features/teams/services/commands/ensure-default-team-membership-command';
import {
  OIDC_PROVIDER_ID,
  gateProfile,
  isAllowedEmail,
  isOidcCallback,
  oidcConfigFromEnv,
  profileRefusal,
  type OidcConfig,
} from './oidc-config';
import { SIGN_IN_REFUSAL, type SignInRefusal } from './oidc-errors';

type HookContext = {
  path?: string;
  params?: Record<string, unknown>;
} | null;

/** The configuration this process runs with, or null when SSO is off. */
export function activeOidcConfig(): OidcConfig | null {
  const status = oidcConfigFromEnv(process.env);
  if (status.status === 'invalid') {
    console.error('[AUTH] OIDC sign-in is off: the configuration is invalid', {
      problems: status.problems,
    });
  }
  return status.status === 'on' ? status.config : null;
}

/**
 * The Better Auth plugin, or nothing.
 *
 * `requireIdTokenVerification` makes a missing or incomplete discovery
 * document an error rather than a silent downgrade to decoding the ID token
 * without checking its signature. PKCE is on, as it is by default.
 */
export function oidcPlugins() {
  const config = activeOidcConfig();
  if (!config) {
    return [];
  }

  return [
    genericOAuth({
      config: [
        {
          providerId: OIDC_PROVIDER_ID,
          name: config.displayName,
          discoveryUrl: config.discoveryUrl,
          requireIdTokenVerification: true,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          scopes: ['openid', 'email', 'profile'],
          pkce: true,
          mapProfileToUser: (profile) => {
            const claims = {
              email: typeof profile.email === 'string' ? profile.email : null,
              emailVerified:
                typeof profile.emailVerified === 'boolean'
                  ? profile.emailVerified
                  : null,
              hostedDomain: typeof profile.hd === 'string' ? profile.hd : null,
            };
            // Thrown before Better Auth looks anything up, so a refused
            // profile writes nothing. Better Auth does not catch it here;
            // `oidcCallbackRefusals` turns it into the sign-in redirect.
            const refusal = profileRefusal(claims, config.allowedDomains, {
              requireHostedDomain: config.requireHostedDomain,
            });
            if (refusal) {
              throw refusalError(refusal);
            }
            return gateProfile(claims, config.allowedDomains, {
              trustEmail: config.trustEmail,
              requireHostedDomain: config.requireHostedDomain,
            });
          },
        },
      ],
    }),
    oidcCallbackRefusals(),
  ];
}

/**
 * The refusal as an `APIError` whose `code` is the `?error=` the sign-in page
 * reads. Better Auth's callback redirects an `APIError` with a `code` to the
 * error URL on its own when it is thrown while creating the user; the message
 * is for logs and for the password form, which shows it as it is.
 */
export function refusalError(code: SignInRefusal): APIError {
  return new APIError('FORBIDDEN', { code, message: REFUSAL_MESSAGES[code] });
}

const REFUSAL_MESSAGES: Record<SignInRefusal, string> = {
  [SIGN_IN_REFUSAL.REGISTRATION_DISABLED]:
    'Registration is disabled on this installation. Ask an administrator for an invitation.',
  [SIGN_IN_REFUSAL.DOMAIN_NOT_ALLOWED]:
    'This address is outside the domains company sign-in accepts.',
  [SIGN_IN_REFUSAL.HOSTED_DOMAIN_MISMATCH]:
    'This Google account is not managed by an allowed Google Workspace.',
  [SIGN_IN_REFUSAL.EMAIL_NOT_VERIFIED]:
    'The identity provider did not confirm this address is verified.',
  [SIGN_IN_REFUSAL.JOIN_ORGANIZATION_UNSET]:
    'Registration is closed and company sign-in has no organization to join.',
  [SIGN_IN_REFUSAL.JOIN_ORGANIZATION_NOT_FOUND]:
    'The organization company sign-in joins does not exist.',
  [SIGN_IN_REFUSAL.EMAIL_NOT_FOUND]:
    'The identity provider sent no email address.',
};

/**
 * Sends every refused OIDC callback back to the sign-in page.
 *
 * Better Auth redirects most callback failures to the `errorCallbackURL` the
 * sign-in page passed, with `?error=<code>`. Not all: an `APIError` thrown from
 * `mapProfileToUser`, or any `APIError` without a `code`, comes back as a JSON
 * body, and the browser is left on `/api/auth/callback/oidc` showing it. This
 * runs after the callback and turns any such error into the same redirect.
 *
 * Only the response changes. Whatever refused the sign-in has already refused
 * it, before anything was written; nothing here decides who gets in.
 */
function oidcCallbackRefusals(): BetterAuthPlugin {
  return {
    id: 'oidc-callback-refusals',
    hooks: {
      after: [
        {
          matcher: (context) => isOidcCallback(context),
          handler: createAuthMiddleware(async (ctx) => {
            const location = await refusalRedirect(ctx.context.returned);
            if (location) {
              // A `Response`, not `throw ctx.redirect()`: the dispatcher
              // serialises an after-hook's APIError with the endpoint's own
              // status, so a thrown redirect goes out as a 403 that carries a
              // Location header the browser ignores. A Response keeps its
              // status. Seen in p0-38, not in any unit test.
              return redirectResponse(location);
            }
          }),
        },
      ],
    },
  };
}

/** A 302 to `location`, as the browser-facing response of the callback. */
export function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

/** Where a callback's result should send the browser instead, or null. */
export async function refusalRedirect(
  returned: unknown,
): Promise<string | null> {
  if (!isAPIError(returned)) {
    return null;
  }
  // Better Auth's own redirects — success and its handled errors alike — are
  // an `APIError` with a 3xx status. Those already go somewhere.
  if (returned.statusCode >= 300 && returned.statusCode < 400) {
    return null;
  }

  const code =
    typeof returned.body?.code === 'string' && returned.body.code
      ? returned.body.code.toLowerCase()
      : 'sso_failed';
  console.error('[AUTH] OIDC callback refused', {
    code,
    status: returned.statusCode,
  });

  // The `errorCallbackURL` the sign-in page passed, kept in the OAuth state.
  // Without a state to read, the sign-in page without its locale prefix,
  // which the proxy fills in.
  let errorURL = '/sign-in';
  try {
    const state = await getOAuthState();
    errorURL = state?.errorURL || errorURL;
  } catch {
    // Keep the default.
  }
  const separator = errorURL.includes('?') ? '&' : '?';
  return `${errorURL}${separator}error=${encodeURIComponent(code)}`;
}

/**
 * Why a sign-up is refused under closed registration as a company sign-in, or
 * null when it is admitted.
 *
 * Admitted when all four hold: it arrives through the OIDC callback, at an
 * allowed domain, with an address the issuer verified (`OIDC_TRUST_EMAIL`
 * aside — see `gateProfile`), and into an organization that exists. Without an
 * organization to join, an SSO sign-up would create a personal one like any
 * other door, and the registration switch means the same for it as for the
 * rest: SSO is not a way around a closed install, only a way into a
 * configured one. A configured organization that does not exist is refused
 * here rather than falling back to a personal organization later, which would
 * have been exactly that way around.
 *
 * Any other door — password, magic link — gets `registration_disabled`: this
 * only says something about company sign-in.
 */
export async function oidcSignUpRefusal(
  user: { email: string; emailVerified?: boolean | null },
  context: HookContext,
): Promise<SignInRefusal | null> {
  const config = activeOidcConfig();
  if (!config || !isOidcCallback(context)) {
    return SIGN_IN_REFUSAL.REGISTRATION_DISABLED;
  }
  if (!isAllowedEmail(user.email, config.allowedDomains)) {
    return SIGN_IN_REFUSAL.DOMAIN_NOT_ALLOWED;
  }
  if (user.emailVerified !== true) {
    return SIGN_IN_REFUSAL.EMAIL_NOT_VERIFIED;
  }
  if (!config.joinOrganization) {
    return SIGN_IN_REFUSAL.JOIN_ORGANIZATION_UNSET;
  }
  if ((await findJoinOrganization(config.joinOrganization)) === null) {
    console.error(
      '[AUTH] OIDC_JOIN_ORGANIZATION names no organization; refusing the sign-up',
      { joinOrganization: config.joinOrganization },
    );
    return SIGN_IN_REFUSAL.JOIN_ORGANIZATION_NOT_FOUND;
  }
  return null;
}

/** Whether a sign-up passes closed registration as a company sign-in. */
export async function oidcSignUpAdmitted(
  user: { email: string; emailVerified?: boolean | null },
  context: HookContext,
): Promise<boolean> {
  return (await oidcSignUpRefusal(user, context)) === null;
}

function findJoinOrganization(idOrSlug: string) {
  return db.organization.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true },
  });
}

/**
 * Put a new SSO user into the configured organization as a member.
 *
 * Returns false — and the caller provisions a personal organization as for any
 * other sign-up — when this is not an SSO sign-up, nothing is configured, or
 * the organization named does not exist. Falling back is the safe direction:
 * the user gets an empty workspace of their own, not access to anyone's data.
 */
export async function joinOidcOrganization(
  user: { id: string; email: string; emailVerified?: boolean | null },
  context: HookContext,
): Promise<boolean> {
  const config = activeOidcConfig();
  if (
    !config?.joinOrganization ||
    !isOidcCallback(context) ||
    user.emailVerified !== true ||
    !isAllowedEmail(user.email, config.allowedDomains)
  ) {
    return false;
  }

  const organization = await findJoinOrganization(config.joinOrganization);
  if (!organization) {
    console.error(
      '[AUTH] OIDC_JOIN_ORGANIZATION names no organization; giving the user a personal one',
      { joinOrganization: config.joinOrganization, userId: user.id },
    );
    return false;
  }

  await db.member.create({
    data: {
      id: crypto.randomUUID(),
      organizationId: organization.id,
      userId: user.id,
      role: ORG_MEMBER_ROLE,
    },
  });
  try {
    await ensureDefaultTeamMembershipCommand(organization.id, user.id);
  } catch (teamError) {
    console.error('[AUTH] Failed to add SSO user to the default team', {
      organizationId: organization.id,
      userId: user.id,
      error: teamError,
    });
  }

  console.log('[AUTH] SSO user joined the configured organization', {
    userId: user.id,
    organizationId: organization.id,
  });
  return true;
}
