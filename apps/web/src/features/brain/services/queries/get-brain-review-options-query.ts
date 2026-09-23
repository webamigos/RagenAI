import db from '@ragenai/prisma-client';

import type { ReviewOptions } from '../../contracts/brain-review.types';

/**
 * Who a reviewer may name as a page's owner or grant it to (spec D2): the
 * organization's members and teams, by name. The review commands check the
 * same two tables again under their transaction; this list is what the form
 * offers, not what makes a choice valid.
 */
export async function getBrainReviewOptionsQuery(
  orgId: string,
): Promise<ReviewOptions> {
  const [members, teams] = await Promise.all([
    db.member.findMany({
      where: { organizationId: orgId },
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
    db.team.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  return {
    members: members
      .map((m) => ({ userId: m.userId, name: m.user.name || m.user.email }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    teams,
  };
}
