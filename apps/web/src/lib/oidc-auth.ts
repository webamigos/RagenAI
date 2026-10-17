/* eslint-disable no-console */
// Loaded by auth.ts, which is bundled for the Edge middleware too, so the
// logger stays out of this file for the same reason it stays out of that one.
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
  type OidcConfig,
} from './oidc-config';

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
          mapProfileToUser: (profile) =>
            gateProfile(
              {
                email: typeof profile.email === 'string' ? profile.email : null,
                emailVerified:
                  typeof profile.emailVerified === 'boolean'
                    ? profile.emailVerified
                    : null,
              },
              config.allowedDomains,
              { trustEmail: config.trustEmail },
            ),
        },
      ],
    }),
  ];
}

/**
 * Whether a sign-up passes closed registration because it is a company sign-in.
 *
 * All four must hold: it arrives through the OIDC callback, at an allowed
 * domain, with an address the issuer verified (`OIDC_TRUST_EMAIL` aside — see
 * `gateProfile`), and into an organization that exists. Without an
 * organization to join, an SSO sign-up would create a personal one like any
 * other door, and the registration switch means the same for it as for the
 * rest: SSO is not a way around a closed install, only a way into a
 * configured one. A configured organization that does not exist is refused
 * here rather than falling back to a personal organization later, which would
 * have been exactly that way around.
 */
export async function oidcSignUpAdmitted(
  user: { email: string; emailVerified?: boolean | null },
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
  return (await findJoinOrganization(config.joinOrganization)) !== null;
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
