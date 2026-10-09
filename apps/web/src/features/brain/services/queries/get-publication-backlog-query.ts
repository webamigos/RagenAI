import { PUBLISHED_FILE_METADATA_KEY } from '@ragenai/brain-contracts';
import db from '@ragenai/prisma-client';

import type { ReviewError } from '../../contracts/brain-review.types';
import { planPublication, principalIds } from '../../utils/plan-publication';

export type PublicationBacklog = {
  /** Pages "Opublikuj zatwierdzone" would write: new, changed or unfinished. */
  pending: number;
  /** Of the pages that would be written, those it would refuse, by reason. */
  refused: Partial<Record<ReviewError, number>>;
};

/**
 * What "publish all approved" would do if clicked now, counted by the same
 * rules it publishes by (`planPublication`), so the button, the overview and
 * the run's own report agree. Organization-wide, as the run is: a language
 * filter narrows what the panel shows, not what publishing reaches.
 *
 * Runs on every load of the overview and the pages list, so it does not read
 * every approved page to produce one number. SQL keeps only the pages a run
 * would write (never published, changed since, or with an unfinished index
 * write) — usually a handful, whatever the size of the organization — and
 * only those go through `planPublication`, with only the members and teams
 * they name. A page already serving its content cannot be pending whatever
 * the refusal checks say, so leaving it out changes no count of `pending`.
 */
export async function getPublicationBacklogQuery(
  orgId: string,
): Promise<PublicationBacklog> {
  const backlog: PublicationBacklog = { pending: 0, refused: {} };
  // The same pages `bulkPublicationWhere` walks (approved; serving or never
  // published, so not withdrawn), narrowed to those a run would write.
  const writable = await db.$queryRaw<{ id: number }[]>`
    SELECT p.id
    FROM knowledge_pages p
    LEFT JOIN user_files f
      ON f.id = p.published_file_id
     AND f.organization_id = p.organization_id
    WHERE p.organization_id = ${orgId}
      AND p.status = 'APPROVED'
      AND (p.published_at IS NOT NULL OR p.published_file_id IS NULL)
      AND (
        p.published_at IS NULL
        OR (f.metadata -> ${PUBLISHED_FILE_METADATA_KEY} ->> 'contentHash')
           IS DISTINCT FROM p.content_hash
        OR f.embedding_status::text IS DISTINCT FROM 'COMPLETED'
      )
  `;
  if (writable.length === 0) {
    return backlog;
  }
  const pages = await db.knowledgePage.findMany({
    where: {
      organizationId: orgId,
      id: { in: writable.map((row) => row.id) },
    },
    select: {
      status: true,
      ownerId: true,
      accessibleBy: true,
      contentHash: true,
      publishedAt: true,
      publishedFile: { select: { embeddingStatus: true, metadata: true } },
    },
  });
  const userIds = new Set<string>();
  const teamIds = new Set<string>();
  for (const page of pages) {
    if (page.ownerId) {
      userIds.add(page.ownerId);
    }
    const named = principalIds(page.accessibleBy);
    named.userIds.forEach((id) => userIds.add(id));
    named.teamIds.forEach((id) => teamIds.add(id));
  }
  const [members, teams] = await Promise.all([
    userIds.size
      ? db.member.findMany({
          where: { organizationId: orgId, userId: { in: [...userIds] } },
          select: { userId: true },
        })
      : [],
    teamIds.size
      ? db.team.findMany({
          where: { organizationId: orgId, id: { in: [...teamIds] } },
          select: { id: true },
        })
      : [],
  ]);
  const memberIds = new Set(members.map((m) => m.userId));
  const knownTeams = new Set(teams.map((t) => t.id));
  for (const page of pages) {
    const plan = planPublication(orgId, page, {
      ownerIsMember: page.ownerId !== null && memberIds.has(page.ownerId),
      memberIds,
      teamIds: knownTeams,
    });
    if ('error' in plan) {
      backlog.refused[plan.error] = (backlog.refused[plan.error] ?? 0) + 1;
    } else if (plan.changed || plan.queue) {
      backlog.pending += 1;
    }
  }
  return backlog;
}
