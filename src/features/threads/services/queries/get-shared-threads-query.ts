'use server';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import type { SidebarThreadItem } from '@/features/threads/contracts/thread.types';

export async function getSharedThreadsQuery(
  userId: string,
): Promise<SidebarThreadItem[]> {
  const orgId = await getOrgIdFromAuthOrThrow();

  const shares = await db.threadShare.findMany({
    where: {
      userId,
      thread: {
        organizationId: orgId,
        messages: { some: {} },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      thread: {
        select: {
          publicId: true,
          createdAt: true,
          isStarred: true,
          title: true,
          projectId: true,
          teamId: true,
          project: { select: { publicId: true, title: true } },
          team: { select: { id: true, name: true } },
        },
      },
      sharedBy: {
        select: { name: true, email: true },
      },
    },
  });

  return shares.map((s) => ({
    publicId: s.thread.publicId,
    createdAt: s.thread.createdAt.toISOString(),
    isStarred: s.thread.isStarred,
    title: s.thread.title,
    projectId: s.thread.projectId,
    teamId: s.thread.teamId,
    project: s.thread.project,
    team: s.thread.team,
    messages: [],
    sharedByUser: { name: s.sharedBy.name, email: s.sharedBy.email },
  }));
}
