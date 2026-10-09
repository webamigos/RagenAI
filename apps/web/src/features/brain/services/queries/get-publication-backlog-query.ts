import db from '@ragenai/prisma-client';

import type { ReviewError } from '../../contracts/brain-review.types';
import {
  bulkPublicationWhere,
  planPublication,
} from '../../utils/plan-publication';

export type PublicationBacklog = {
  /** Pages "Opublikuj zatwierdzone" would write: new, changed or unfinished. */
  pending: number;
  /** Approved pages it would refuse, by reason. */
  refused: Partial<Record<ReviewError, number>>;
};

/**
 * What "publish all approved" would do if clicked now, counted by the same
 * rules it publishes by (`planPublication`), so the button, the overview and
 * the run's own report agree. Organization-wide, as the run is: a language
 * filter narrows what the panel shows, not what publishing reaches.
 */
export async function getPublicationBacklogQuery(
  orgId: string,
): Promise<PublicationBacklog> {
  const [pages, members, teams] = await Promise.all([
    db.knowledgePage.findMany({
      where: bulkPublicationWhere(orgId),
      select: {
        status: true,
        ownerId: true,
        accessibleBy: true,
        contentHash: true,
        publishedAt: true,
        publishedFile: { select: { embeddingStatus: true, metadata: true } },
      },
    }),
    db.member.findMany({
      where: { organizationId: orgId },
      select: { userId: true },
    }),
    db.team.findMany({
      where: { organizationId: orgId },
      select: { id: true },
    }),
  ]);
  const memberIds = new Set(members.map((m) => m.userId));
  const teamIds = new Set(teams.map((t) => t.id));
  const backlog: PublicationBacklog = { pending: 0, refused: {} };
  for (const page of pages) {
    const plan = planPublication(orgId, page, {
      ownerIsMember: page.ownerId !== null && memberIds.has(page.ownerId),
      memberIds,
      teamIds,
    });
    if ('error' in plan) {
      backlog.refused[plan.error] = (backlog.refused[plan.error] ?? 0) + 1;
    } else if (plan.changed || plan.queue) {
      backlog.pending += 1;
    }
  }
  return backlog;
}
