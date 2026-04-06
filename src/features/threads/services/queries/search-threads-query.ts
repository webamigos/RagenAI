'use server';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';

export async function searchThreadsQuery(
  visitorId: string,
  query: string,
): Promise<{ id: string; title: string }[]> {
  if (!visitorId || !query.trim() || query.trim().length < 3) {
    return [];
  }

  const orgId = await getOrgIdFromAuthOrThrow();

  const threads = await db.thread.findMany({
    where: {
      organizationId: orgId,
      visitorId,
      messages: { some: {} },
      title: { contains: query.trim(), mode: 'insensitive' },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
    },
  });

  return threads.map((thread) => ({
    id: thread.id,
    title: thread.title || 'Untitled',
  }));
}
