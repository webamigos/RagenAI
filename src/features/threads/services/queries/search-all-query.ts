'use server';

import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';

export type SearchResultItem = {
  id: string;
  title: string;
  type: 'thread' | 'project';
  createdAt: string;
};

export async function searchAllQuery(
  visitorId: string,
  query: string,
): Promise<SearchResultItem[]> {
  const trimmed = (query ?? '').trim();
  if (!visitorId || trimmed.length < 2) {
    return [];
  }

  const orgId = await getOrgIdFromAuthOrThrow();

  const [threads, projects] = await Promise.all([
    db.thread.findMany({
      where: {
        organization_id: orgId,
        visitor_id: visitorId,
        messages: { some: {} },
        OR: [
          { title: { contains: trimmed, mode: 'insensitive' } },
          {
            messages: {
              some: { content: { contains: trimmed, mode: 'insensitive' } },
            },
          },
        ],
      },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: {
        public_id: true,
        title: true,
        created_at: true,
        messages: {
          select: { content: true },
          take: 1,
          orderBy: { created_at: 'asc' as const },
        },
      },
    }),
    db.project.findMany({
      where: {
        organization_id: orgId,
        title: { contains: trimmed, mode: 'insensitive' },
      },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: {
        public_id: true,
        title: true,
        created_at: true,
      },
    }),
  ]);

  const results: SearchResultItem[] = [
    ...projects.map((p) => ({
      id: p.public_id,
      title: p.title,
      type: 'project' as const,
      createdAt: p.created_at.toISOString(),
    })),
    ...threads.map((t) => ({
      id: t.public_id,
      title: t.title || t.messages[0]?.content.slice(0, 60) || 'Untitled',
      type: 'thread' as const,
      createdAt: t.created_at.toISOString(),
    })),
  ];

  return results;
}
