import 'server-only';

import db from '@ragenai/prisma-client';
import { getActiveMember, getSession } from '@/lib/auth-guards';
import { isAppAdmin, canManageOrg } from '@/lib/auth-access-control';
import { getUsageLimits } from '@/features/organizations/services/organization-settings';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import type { AddMemberRefusal } from '../../contracts/add-member-errors';

export type AddMemberGate =
  | {
      allowed: true;
      inviterId: string | undefined;
      /** Absent when there is neither a name nor an email to show. */
      inviterName: string | undefined;
    }
  | ({ allowed: false } & AddMemberRefusal);

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

  if (!activeMember || !canManageOrg(activeMember.role)) {
    return { allowed: false, code: 'no-permission-add-member' };
  }

  const session = await getSession();
  const isPlatformAdmin = isAppAdmin(session?.user);

  if (!isPlatformAdmin) {
    const canInvite = await isFeatureEnabledQuery(
      organizationId,
      'inviteMembers',
    );
    if (!canInvite) {
      return { allowed: false, code: 'plan-required-for-members' };
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
          code: 'member-limit-reached',
          params: { limit: usageLimits.maxMembers },
        };
      }
    }
  }

  return {
    allowed: true,
    inviterId: session?.user?.id,
    // No Polish stand-in: the invitation email has its own wording for an
    // invitation with no named inviter, in the reader's language.
    inviterName: session?.user?.name || session?.user?.email || undefined,
  };
}
