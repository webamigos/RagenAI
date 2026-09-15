'use server';

import db from '@ragenai/prisma-client';

/**
 * Which team a chat turn's usage should be attributed to.
 *
 * This is the surviving half of `resolveLiteLLMKeyQuery`, which decided two
 * things at once: which LiteLLM virtual key to charge, and — as a side effect —
 * which team `AiUsage.teamId` recorded. B5 removed the keys, because the
 * proxy's per-team budget they carried moved into the database in Phase A. The
 * attribution is a separate feature and stays: the teams UI reports per-team
 * spend from `ai_usage`, and it would silently report nothing without this.
 *
 * Precedence is unchanged, minus the key:
 *   1. the session's active team, if the caller really is a member of it;
 *   2. otherwise, the caller's team when they belong to exactly one in the org,
 *      so the single-team case works with no selector;
 *   3. otherwise null — the turn is attributed to the organization alone.
 *
 * **The membership check is the point, not a formality.** The active team
 * arrives in a cookie, so without it a user could attribute their spend to a
 * team they do not belong to. That mattered when it chose a key to charge and
 * it still matters now that it chooses whose budget line the spend lands on.
 */
export async function resolveUsageTeamQuery({
  orgId,
  userId,
  activeTeamId,
}: {
  orgId: string;
  userId: string | null;
  activeTeamId?: string | null;
}): Promise<string | null> {
  if (!userId) {
    return null;
  }

  if (activeTeamId) {
    const team = await db.team.findFirst({
      where: {
        id: activeTeamId,
        organizationId: orgId,
        members: { some: { userId } },
      },
      select: { id: true },
    });
    if (team) {
      return team.id;
    }
  }

  // `take: 2` rather than `findMany` and count: the question is only whether
  // there is exactly one, and a user in twenty teams should not load twenty
  // rows to answer it.
  const memberships = await db.teamMember.findMany({
    where: { userId, team: { organizationId: orgId } },
    select: { teamId: true },
    take: 2,
  });

  return memberships.length === 1 ? (memberships[0]?.teamId ?? null) : null;
}
