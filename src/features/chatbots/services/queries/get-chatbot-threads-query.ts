'use server';

import db from '@ragenai/prisma-client';

export const getChatbotThreadsQuery = async (
  chatbotId: string,
  organizationId: string,
  skip = 0,
  take = 20,
) => {
  const where = { chatbotId, organizationId };

  const [threads, total] = await Promise.all([
    db.thread.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: take + 1,
      select: {
        id: true,
        visitorId: true,
        createdAt: true,
        title: true,
        _count: { select: { messages: true } },
        messages: {
          select: { content: true, role: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    }),
    db.thread.count({ where }),
  ]);

  const hasMore = threads.length > take;
  const threadsSlice = hasMore ? threads.slice(0, take) : threads;

  return {
    threads: threadsSlice.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
    hasMore,
    total,
  };
};
