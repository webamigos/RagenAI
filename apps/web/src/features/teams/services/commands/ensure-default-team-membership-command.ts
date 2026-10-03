import db from '@ragenai/prisma-client';

/** Every organization keeps one Better Auth team under a stable id. */
export function defaultTeamId(organizationId: string): string {
  return `${organizationId}-general`;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === 'P2002';
}

/**
 * Make sure the organization's General team exists and `userId` is in it.
 * Both the sign-up hook and onboarding's self-heal call this, and the two can
 * run at once for the same user.
 *
 * The upsert's `where` carries `organizationId` for the tenant-scope guard.
 * With a field beside the unique `id`, Prisma no longer issues a native
 * `INSERT … ON CONFLICT`: it reads, then inserts, so the loser of a race gets
 * P2002 for a team that now exists. That is the outcome it wanted — carry on
 * to the membership, which is the part the self-heal is for.
 */
export async function ensureDefaultTeamMembershipCommand(
  organizationId: string,
  userId: string,
): Promise<{ teamId: string; joined: boolean }> {
  const teamId = defaultTeamId(organizationId);
  try {
    await db.team.upsert({
      where: { id: teamId, organizationId },
      update: {},
      create: { id: teamId, name: 'General', organizationId },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) {
      throw err;
    }
  }

  const existing = await db.teamMember.findFirst({
    where: { teamId, userId },
    select: { id: true },
  });
  if (existing) {
    return { teamId, joined: false };
  }
  await db.teamMember.create({
    data: { id: crypto.randomUUID(), teamId, userId },
  });
  return { teamId, joined: true };
}
