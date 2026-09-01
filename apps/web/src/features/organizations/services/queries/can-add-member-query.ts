import 'server-only';

import db from '@ragenai/prisma-client';
import { getActiveMember, getSession } from '@/lib/auth-guards';
import { isAppAdmin, isOrgAdmin } from '@/lib/auth-access-control';
import { getUsageLimits } from '@/features/organizations/services/organization-settings';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';

export type AddMemberGate =
  | { allowed: true; inviterId: string | undefined; inviterName: string }
  | { allowed: false; error: string };

/**
 * The checks every way of adding someone to an organization has to pass:
 * caller is an org admin, the plan allows it, and there is a seat left.
 *
 * Shared because there are now two such ways — a magic-link invitation and an
 * account the admin creates outright — and a limit only one of them enforces is
 * not a limit. App admins bypass the plan and seat checks, as they do elsewhere.
 */
export async function canAddMemberQuery(
  organizationId: string,
): Promise<AddMemberGate> {
  const activeMember = await getActiveMember(organizationId);

  if (!activeMember || !isOrgAdmin(activeMember.role)) {
    return {
      allowed: false,
      error: 'Nie masz uprawnień do dodawania członków',
    };
  }

  const session = await getSession();
  const isPlatformAdmin = isAppAdmin(session?.user);

  if (!isPlatformAdmin) {
    const canInvite = await isFeatureEnabledQuery(
      organizationId,
      'inviteMembers',
    );
    if (!canInvite) {
      return {
        allowed: false,
        error: 'Dodawanie członków dostępne tylko w płatnych planach',
      };
    }

    const usageLimits = await getUsageLimits(organizationId);
    if (usageLimits.maxMembers !== null) {
      const [currentMemberCount, pendingInvitationCount] = await Promise.all([
        db.member.count({ where: { organizationId } }),
        db.invitation.count({ where: { organizationId, status: 'pending' } }),
      ]);

      if (
        currentMemberCount + pendingInvitationCount >=
        usageLimits.maxMembers
      ) {
        return {
          allowed: false,
          error: `Member limit reached (${usageLimits.maxMembers}). Contact your administrator to increase the limit.`,
        };
      }
    }
  }

  return {
    allowed: true,
    inviterId: session?.user?.id,
    inviterName:
      session?.user?.name || session?.user?.email || 'Twój współpracownik',
  };
}
