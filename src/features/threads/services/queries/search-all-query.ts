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
        organizationId: orgId,
        visitorId: visitorId,
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
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        publicId: true,
        title: true,
        createdAt: true,
        messages: {
          select: { content: true },
          take: 1,
          orderBy: { createdAt: 'asc' as const },
        },
      },
    }),
    db.project.findMany({
      where: {
        organizationId: orgId,
        title: { contains: trimmed, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        publicId: true,
        title: true,
        createdAt: true,
      },
    }),
  ]);

  const results: SearchResultItem[] = [
    ...projects.map((p) => ({
      id: p.publicId,
      title: p.title,
      type: 'project' as const,
      createdAt: p.createdAt.toISOString(),
    })),
    ...threads.map((t) => ({
      id: t.publicId,
      title: t.title || t.messages[0]?.content.slice(0, 60) || 'Untitled',
      type: 'thread' as const,
      createdAt: t.createdAt.toISOString(),
    })),
  ];

  return results;
}
