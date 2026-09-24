import db from '@ragenai/prisma-client';

import type {
  KnowledgeDecisionView,
  PageRef,
} from '../../contracts/brain.types';

export type KnowledgeDecisionLedgerItem = KnowledgeDecisionView & {
  page: PageRef;
};

/** Ledger rows returned at most. */
export const DECISIONS_LIMIT = 100;

/**
 * The organization's decision ledger since `since`, newest first, each row
 * naming its page and its actor — the account "what was decided this week"
 * is written from. Actors are read as users, not members: the ledger names
 * who acted after they have left.
 */
export async function getKnowledgeDecisionsQuery(
  orgId: string,
  since: Date,
  limit = DECISIONS_LIMIT,
): Promise<KnowledgeDecisionLedgerItem[]> {
  const rows = await db.knowledgeDecision.findMany({
    where: { organizationId: orgId, createdAt: { gte: since } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: Math.min(Math.max(limit, 1), DECISIONS_LIMIT),
    select: {
      action: true,
      actorId: true,
      createdAt: true,
      page: { select: { publicId: true, title: true } },
    },
  });
  const actorIds = [...new Set(rows.map((r) => r.actorId))];
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const name = new Map(actors.map((u) => [u.id, u.name || u.email]));
  return rows.map((r) => ({
    action: r.action,
    actorName: name.get(r.actorId) ?? null,
    createdAt: r.createdAt.toISOString(),
    page: r.page,
  }));
}
